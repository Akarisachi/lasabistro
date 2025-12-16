from flask import Flask, jsonify, request, render_template
import mysql.connector
from flask_cors import CORS
import os
import qrcode
import json
from datetime import datetime, date, time, timedelta
from werkzeug.utils import secure_filename
from datetime import datetime, date
import traceback  # Ensure this is added
from collections import Counter
from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, session, redirect, url_for
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__, template_folder="main", static_folder="static")
CORS(app)

app.secret_key = "supersecretkey123"  # replace with a random string in production

from ai_routes import ai_bp
app.register_blueprint(ai_bp)
# 📁 Folder to save uploaded images
QR_FOLDER = "static/qrcodes" 
UPLOAD_FOLDER = os.path.join(app.static_folder, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 🔗 Database Connection

def get_db_connection():
    return psycopg2.connect(
        host="dpg-d50morfgi27c73ap9510-a.oregon-postgres.render.com",
        database="restaurant_db_pj8q",
        user="restaurant_db_pj8q_user",
        password="hsImkcb315dSQsTsV7Ga1VUdebMzOw9d",
        cursor_factory=RealDictCursor  # optional: returns rows as dictionaries
    )

HARDCODED_USER = "admin"
HARDCODED_PASS = "admin123"

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status":"error","message":"Invalid JSON"}), 400

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if username == HARDCODED_USER and password == HARDCODED_PASS:
        # Redirect to owner page
        return redirect(url_for('owner_dashboard'))
  # owner_home renders owner_login.html
    else:
        return jsonify({"status":"error","message":"Invalid username or password"}), 401
    
@app.route("/logout")
def logout():
    # Clear the session (if you use session-based login)
    session.clear()
    # Redirect to login page
    return redirect(url_for("owner_login_page"))
# ======================== MENU ENDPOINTS ========================

@app.route('/')
def owner_login_page():
    return render_template('owner_login.html')

@app.route('/owner')
def owner_dashboard():
    return render_template('owner.html')


# ======================== DASHBOARD STATS ========================
@app.route('/dashboard_stats', methods=['GET'])
def dashboard_stats():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    today = datetime.today()

    # Current month range
    first_day = today.replace(day=1)
    next_month = (first_day.replace(day=28) + timedelta(days=4)).replace(day=1)

    # -------------------------
    # Total Sales (Current Month)
    # -------------------------
    cursor.execute("""
        SELECT SUM(total) AS total_sales
        FROM orders
        WHERE status='Completed'
        AND created_at >= %s
        AND created_at < %s
    """, (first_day, next_month))
    total_sales = float(cursor.fetchone()['total_sales'] or 0)

    # -------------------------
    # Current Month Orders (Peak Hours & Popular Dishes)
    # -------------------------
    cursor.execute("""
        SELECT o.total, o.created_at, o.order_type,
               oi.name AS item_name, oi.qty
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.status='Completed'
        AND o.created_at >= %s
        AND o.created_at < %s
        ORDER BY o.created_at ASC
    """, (first_day, next_month))

    rows = cursor.fetchall()

    revenue_per_hour = Counter()
    dish_counter = Counter()

    for r in rows:
        revenue_per_hour[r['created_at'].hour] += float(r['total'])
        dish_counter[r['item_name']] += r['qty']

    # -------------------------
    # Order Type Counts (ALL orders)
    # -------------------------
    cursor.execute("""
        SELECT type, order_type
        FROM orders
        WHERE created_at >= %s
        AND created_at < %s
    """, (first_day, next_month))
    order_type_rows = cursor.fetchall()

    order_type_counts = Counter()

    for r in order_type_rows:
        type_field = (r['type'] or "").strip().lower()
        order_type_field = (r['order_type'] or "").strip().lower()

        if type_field == "online":
            order_type_counts["Online"] += 1
        elif order_type_field in ["dine-in", "dinein", "dining"]:
            order_type_counts["Dine-in"] += 1
        elif order_type_field in ["takeout", "take-out", "pickup"]:
            order_type_counts["Takeout"] += 1
        else:
            order_type_counts["Other"] += 1

    # -------------------------
    # 12 Months Revenue Trend
    # -------------------------
    cursor.execute("""
        SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, 
               SUM(total) AS revenue
        FROM orders
        WHERE status='Completed'
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY month ASC
    """)
    revenue_rows = cursor.fetchall()

    # -------------------------
    # Reviews: Majority Rating + Breakdown
    # -------------------------
    cursor.execute("""
        SELECT rating, COUNT(*) AS count
        FROM reviews
        WHERE rating IS NOT NULL
        GROUP BY rating
        ORDER BY count DESC
    """)
    review_rows = cursor.fetchall()

    majority_rating = None
    rating_breakdown = {}

    if review_rows:
        majority_rating = review_rows[0]['rating']
        for r in review_rows:
            rating_breakdown[str(r['rating'])] = r['count']

    # -------------------------
    # Online Users
    # -------------------------
    cursor.execute("SELECT COUNT(*) AS count FROM customers")
    online_users = cursor.fetchone()['count']

    cursor.close()
    db.close()

    return jsonify({
        "month_name": today.strftime("%B %Y"),
        "total_sales": total_sales,

        "peak_hours": [
            {"hour": h, "revenue": revenue_per_hour[h]}
            for h in sorted(revenue_per_hour)
        ],

        "popular_dishes": [
            {"name": n, "qty": q}
            for n, q in dish_counter.most_common(5)
        ],

        "revenue_trend": [
            {"month": r['month'], "revenue": float(r['revenue'])}
            for r in revenue_rows
        ],

        "order_type_counts": {
            "online": order_type_counts.get("Online", 0),
            "dinein": order_type_counts.get("Dine-in", 0),
            "takeout": order_type_counts.get("Takeout", 0)
        },

        "reviews": {
            "majority_rating": majority_rating,
            "breakdown": rating_breakdown
        },

        "online_users": online_users
    })



#========================= MENU ITEMS ========================

@app.route('/menu', methods=['GET'])
def get_menu():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    # Get menu items
    cursor.execute("SELECT * FROM menu ORDER BY id")
    menus = cursor.fetchall()

    # Get active announcements (both category-wide and specific menu)
    cursor.execute("""
        SELECT *
        FROM announcements
        WHERE type='Sale'
          AND NOW() BETWEEN start_time AND end_time
    """)
    announcements = cursor.fetchall()

    # Map menu_id or category → announcement
    menu_discounts = {}   # key: menu_id
    category_discounts = {}  # key: category

    for a in announcements:
        if a['menu_id']:  # specific menu sale
            if a['menu_id'] not in menu_discounts or a['discount'] > menu_discounts[a['menu_id']]['discount']:
                menu_discounts[a['menu_id']] = a
        elif a['target'] and a['target'].startswith('cat:'):  # category sale
            category = a['target'].replace('cat:','')
            if category not in category_discounts or a['discount'] > category_discounts[category]['discount']:
                category_discounts[category] = a

    # Apply discounts
    for menu in menus:
        menu['original_price'] = menu['price']
        menu['discount'] = 0
        menu['display_price'] = menu['price']

        # Apply specific menu sale if exists
        if menu['id'] in menu_discounts:
            a = menu_discounts[menu['id']]
            menu['discount'] = a['discount']
            menu['display_price'] = round(menu['original_price']*(100 - menu['discount'])/100,2)
        # Else apply category-wide sale if exists
        elif menu['category'] in category_discounts:
            a = category_discounts[menu['category']]
            menu['discount'] = a['discount']
            menu['display_price'] = round(menu['original_price']*(100 - menu['discount'])/100,2)

        # Load ingredients
        cursor.execute("""
            SELECT i.id, i.name, i.dish_category, mi.quantity_needed AS qty
            FROM menu_ingredients mi
            JOIN inventory i ON mi.ingredient_id = i.id
            WHERE mi.menu_id = %s
        """, (menu['id'],))
        menu['ingredients'] = cursor.fetchall()

    cursor.close()
    db.close()
    return jsonify(menus)


@app.route('/menu', methods=['POST'])
def add_menu():
    db = get_db_connection()
    cursor = db.cursor()

    name = request.form.get('name')
    category = request.form.get('category')
    price = request.form.get('price')
    image_file = request.files.get('image')

    image_url = None
    if image_file:
        filename = secure_filename(image_file.filename)
        image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        image_file.save(image_path)
        image_url = f"/static/uploads/{filename}"

    cursor.execute("INSERT INTO menu (name, category, price, image) VALUES (%s, %s, %s, %s)",
                   (name, category, price, image_url))
    menu_id = cursor.lastrowid

    ingredients = request.form.get('ingredients')
    if ingredients:
        ingredients = json.loads(ingredients)
        for ing in ingredients:
            cursor.execute(
                "INSERT INTO menu_ingredients (menu_id, ingredient_id, quantity_needed) VALUES (%s, %s, %s)",
                (menu_id, ing['id'], ing['qty'])
            )

    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message": "✅ Menu item with ingredients added successfully"}), 201

@app.route('/menu/<int:id>', methods=['DELETE'])
def delete_menu(id):
    db = get_db_connection()
    cursor = db.cursor()
    cursor.execute("DELETE FROM menu WHERE id = %s", (id,))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message": "🗑️ Menu item deleted"}), 200

@app.route('/menu/<int:id>', methods=['PUT'])
def update_menu(id):
    db = get_db_connection()
    cursor = db.cursor()

    name = request.form.get('name')
    category = request.form.get('category')
    price = request.form.get('price')
    image_file = request.files.get('image')

    cursor.execute("SELECT image FROM menu WHERE id = %s", (id,))
    old_image = cursor.fetchone()[0]
    image_url = old_image

    if image_file:
        filename = secure_filename(image_file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        image_file.save(filepath)
        image_url = f"/static/uploads/{filename}"

    cursor.execute("UPDATE menu SET name=%s, category=%s, price=%s, image=%s WHERE id=%s",
                   (name, category, price, image_url, id))

    ingredients = request.form.get('ingredients')
    cursor.execute("DELETE FROM menu_ingredients WHERE menu_id=%s", (id,))
    if ingredients:
        ingredients = json.loads(ingredients)
        for ing in ingredients:
            cursor.execute(
                "INSERT INTO menu_ingredients (menu_id, ingredient_id, quantity_needed) VALUES (%s, %s, %s)",
                (id, ing['id'], ing['qty'])
            )

    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message": "✏️ Menu item updated"}), 200

@app.route('/menu/categories', methods=['GET'])
def get_menu_categories():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT DISTINCT category FROM menu")
    categories = [row['category'] for row in cursor.fetchall()]
    cursor.close()
    db.close()
    return jsonify(categories)

# ======================== RESERVATIONS ========================

@app.route('/reservations', methods=['GET'])
def get_reservations():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT * FROM reservations 
        WHERE status='active'
        ORDER BY reservation_date, reservation_time
    """)
    data = cursor.fetchall()

    for r in data:
        if isinstance(r['reservation_date'], (date, datetime)):
            r['reservation_date'] = r['reservation_date'].strftime("%Y-%m-%d")
        if isinstance(r['reservation_time'], (time, timedelta)):
            try:
                r['reservation_time'] = r['reservation_time'].strftime("%H:%M")
            except:
                total_seconds = r['reservation_time'].seconds
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                t = datetime.strptime(f"{hours:02d}:{minutes:02d}", "%H:%M")
                r['reservation_time'] = t.strftime("%H:%M")

    cursor.close()
    db.close()
    return jsonify(data)

@app.route('/reservations', methods=['POST'])
def add_reservation():
    db = get_db_connection()
    cursor = db.cursor()

    name = request.form.get('customer_name')
    contact = request.form.get('contact_number')
    date_r = request.form.get('reservation_date')
    time_r = request.form.get('reservation_time')
    table = request.form.get('table_number')
    guests = request.form.get('num_guests')

    cursor.execute("""
        INSERT INTO reservations (customer_name, contact_number, reservation_date, reservation_time, table_number, num_guests)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (name, contact, date_r, time_r, table if table else None, guests))

    db.commit()
    cursor.close()
    db.close()

    return jsonify({"message": "✅ Reservation added successfully"}), 201

@app.route('/available_tables', methods=['GET'])
def available_tables():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    reservation_date = request.args.get('date')
    reservation_time = request.args.get('time')

    cursor.execute("""
        SELECT table_number FROM reservations
        WHERE reservation_date = %s AND reservation_time = %s AND status='active'
    """, (reservation_date, reservation_time))
    reserved_tables = [r['table_number'] for r in cursor.fetchall() if r['table_number']]

    all_tables = [str(i) for i in range(1, 11)]
    available = [t for t in all_tables if t not in reserved_tables]

    cursor.close()
    db.close()
    return jsonify(available)

@app.route('/reservations/done/<int:id>', methods=['POST'])
def mark_done(id):
    db = get_db_connection()
    cursor = db.cursor()
    cursor.execute("UPDATE reservations SET status='done' WHERE id=%s", (id,))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message": "✅ Reservation marked as done"}), 200

@app.route('/reservations/<int:id>', methods=['DELETE'])
def delete_reservation(id):
    db = get_db_connection()
    cursor = db.cursor()
    cursor.execute("DELETE FROM reservations WHERE id = %s", (id,))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message": "🗑️ Reservation deleted"}), 200

# ======================== REVIEWS ========================

@app.route('/reviews', methods=['GET'])
def get_reviews():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM reviews ORDER BY review_time DESC")
    data = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(data)

# ======================== INVENTORY ========================

@app.route('/inventory', methods=['GET'])
def get_inventory():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM inventory")
    data = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(data)

@app.route('/inventory/<int:id>', methods=['GET'])
def get_single_inventory(id):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM inventory WHERE id=%s", (id,))
    data = cursor.fetchone()
    cursor.close()
    db.close()
    if data:
        return jsonify(data)
    else:
        return jsonify({"error": "Ingredient not found"}), 404

@app.route('/inventory', methods=['POST'])
def add_inventory():
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)

        name = request.form.get('name')
        quantity = float(request.form.get('quantity'))
        unit = request.form.get('unit')
        category = request.form.get('category', 'Others')  # Still defaults to 'Others'
        dish_category = request.form.get('dish_category') or None
        threshold = request.form.get('threshold')
        ingredient_type = request.form.get('ingredient_type') or 'Other'

        # Relaxed validation (unchanged)
        if dish_category:
            categories = [c.strip() for c in dish_category.split(',')]
            cursor.execute("SELECT DISTINCT category FROM menu WHERE category IN (%s)" % ','.join(['%s']*len(categories)), categories)
            matching_categories = cursor.fetchall()
            if not matching_categories:
                pass

        # Check for existing ingredient by name and unit only (ignore category for merging)
        
        cursor.execute("UPDATE inventory SET quantity = quantity + %s, dish_category = COALESCE(%s, dish_category), ingredient_type = COALESCE(%s, ingredient_type) WHERE name=%s AND unit=%s",
               (quantity, dish_category, ingredient_type, name, unit))
        if cursor.rowcount > 0:
            message = "✅ Ingredient quantity updated successfully"
        else:
            # Insert new
            cursor.execute("""INSERT INTO inventory (name, quantity, unit, threshold, category, dish_category, ingredient_type)VALUES (%s,%s,%s,%s,%s,%s,%s)""", (name, quantity, unit, threshold, category, dish_category, ingredient_type))
            message = "✅ Ingredient added successfully"

        db.commit()
        cursor.close()
        db.close()
        return jsonify({"message": message}), 201
    except Exception as e:
        print("Error in add_inventory:", str(e))
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500

@app.route('/inventory/<int:id>', methods=['PUT'])
def update_inventory(id):
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)

        name = request.form.get('name')
        quantity = float(request.form.get('quantity'))
        unit = request.form.get('unit')
        category = request.form.get('category', 'Others')
        dish_category = request.form.get('dish_category')
        threshold = request.form.get('threshold')
        ingredient_type = request.form.get('ingredient_type') or 'Other'

        if dish_category:
            categories = [c.strip() for c in dish_category.split(',')]
            cursor.execute("SELECT DISTINCT category FROM menu WHERE category IN (%s)" % ','.join(['%s']*len(categories)), categories)
            matching_categories = cursor.fetchall()
            if not matching_categories:
                pass

        cursor.execute("""
        UPDATE inventory
        SET name=%s, quantity=%s, unit=%s, threshold=%s, category=%s, dish_category=%s, ingredient_type=%s
        WHERE id=%s
        """, (name, quantity, unit, threshold, category, dish_category, ingredient_type, id))

        db.commit()
        cursor.close()
        db.close()
        return jsonify({"message": "✏️ Ingredient updated successfully"}), 200
    except Exception as e:
        print("Error in update_inventory:", str(e))
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500

@app.route('/inventory/<int:id>', methods=['DELETE'])
def delete_inventory(id):
    db = get_db_connection()
    cursor = db.cursor()
    cursor.execute("DELETE FROM inventory WHERE id=%s", (id,))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message": "🗑️ Ingredient deleted"}), 200

#========================= ORDERS ========================

@app.route('/orders', methods=['GET'])
def get_orders():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT o.id, o.username, o.total, o.status, o.created_at,
               o.type, o.table_number, o.order_type,
               oi.menu_id, oi.name as item_name, oi.qty, oi.price
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        ORDER BY o.created_at DESC
    """)

    rows = cursor.fetchall()
    orders_dict = {}

    for r in rows:
        if r['id'] not in orders_dict:
            orders_dict[r['id']] = {
                "id": r['id'],
                "username": r['username'],     # NULL for walk-in
                "type": r['type'],             # "Online" or "Walkin"
                "table_number": r['table_number'],
                "order_type": r['order_type'], # <-- include this!
                "total": float(r['total']),
                "status": r['status'],
                "date": r['created_at'].isoformat(),
                "items": []
            }

        orders_dict[r['id']]["items"].append({
            "id": r['menu_id'],
            "name": r['item_name'],
            "qty": r['qty'],
            "price": float(r['price'])
        })

    cursor.close()
    return jsonify(list(orders_dict.values()))

# Update order status
@app.route('/orders/<int:order_id>', methods=['PATCH'])
def update_order(order_id):
    db = get_db_connection()
    data = request.json
    new_status = data.get('status')
    if not new_status:
        return jsonify({"status":"error","message":"Missing status"}), 400

    cursor = db.cursor(dictionary=True)

    # Fetch previous status to prevent double deduction
    cursor.execute("SELECT status FROM orders WHERE id=%s", (order_id,))
    order = cursor.fetchone()
    if not order:
        cursor.close()
        db.close()
        return jsonify({"status":"error","message":"Order not found"}), 404

    previous_status = order['status']

    # Update order status
    cursor.execute("UPDATE orders SET status=%s WHERE id=%s", (new_status, order_id))

    # Only decrease inventory if changing from non-completed -> Completed
    if previous_status != 'Completed' and new_status == 'Completed':
        cursor.execute("SELECT menu_id, qty FROM order_items WHERE order_id=%s", (order_id,))
        items = cursor.fetchall()
        for item in items:
            menu_id = item['menu_id']
            qty_ordered = item['qty']

            if menu_id:
                # Get ingredients
                cursor.execute("SELECT ingredient_id, quantity_needed FROM menu_ingredients WHERE menu_id=%s", (menu_id,))
                ingredients = cursor.fetchall()
                for ing in ingredients:
                    ingredient_id = ing['ingredient_id']
                    needed_qty = float(ing['quantity_needed']) * qty_ordered
                    cursor.execute("""
                        UPDATE inventory
                        SET quantity = quantity - %s
                        WHERE id = %s
                    """, (needed_qty, ingredient_id))

    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status":"success"})


@app.route('/orders', methods=['POST'])
def create_order():
    data = request.get_json()
    type_ = data.get('type', 'Walkin')  # Walkin or Online
    items = data.get('items', [])

    if not items:
        return jsonify({'status':'error','message':'No items provided'}), 400

    # Only for walk-in orders: dine-in or takeout
    order_type = data.get('order_type') if type_ == 'Walkin' else None
    table_number = data.get('table_number') if type_ == 'Walkin' else None

    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    total = 0
    order_items = []

    for i in items:
        menu_id = i.get('id')
        qty = int(i.get('qty', 1))
        name = i.get('name', f"Item #{menu_id}" if menu_id else "Walk-in Item")

        if menu_id:
            # Fetch current active announcement for this menu item
            cursor.execute("""
                SELECT new_price, discount
                FROM announcements
                WHERE menu_id=%s AND NOW() BETWEEN start_time AND end_time
                ORDER BY discount DESC
                LIMIT 1
            """, (menu_id,))
            ann = cursor.fetchone()

            # Determine price
            if ann:
                price = float(ann['new_price'])
            else:
                cursor.execute("SELECT price FROM menu WHERE id=%s", (menu_id,))
                price = float(cursor.fetchone()['price'])
        else:
            price = float(i.get('price', 0))

        line_total = price * qty
        total += line_total

        order_items.append({
            "menu_id": menu_id,
            "name": name,
            "qty": qty,
            "price": price
        })

    # Insert order
    cursor.execute("""
        INSERT INTO orders (username, total, status, type, order_type, table_number, created_at)
        VALUES (%s,%s,'Pending',%s,%s,%s,NOW())
    """, (None if type_ == 'Walkin' else data.get('username'),
          total, type_, order_type, table_number))
    order_id = cursor.lastrowid

    # Insert order items and deduct inventory
    for item in order_items:
        menu_id = item['menu_id']
        name = item['name']
        qty = item['qty']
        price = item['price']

        cursor.execute("""
            INSERT INTO order_items (order_id, menu_id, name, qty, price)
            VALUES (%s,%s,%s,%s,%s)
        """, (order_id, menu_id, name, qty, price))

        if menu_id:
            # Deduct inventory
            cursor.execute("""
                SELECT ingredient_id, quantity_needed
                FROM menu_ingredients
                WHERE menu_id=%s
            """, (menu_id,))
            ingredients = cursor.fetchall()
            for ing in ingredients:
                needed_qty = float(ing['quantity_needed']) * qty
                cursor.execute("""
                    UPDATE inventory
                    SET quantity = quantity - %s
                    WHERE id = %s
                """, (needed_qty, ing['ingredient_id']))

    db.commit()
    cursor.close()
    db.close()

    return jsonify({'status':'success','order_id':order_id})



#========================== STAFF & ATTENDANCE ==========================

@app.route("/staff", methods=["GET"])
def get_staff():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM staff ORDER BY id DESC")
    data = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(data)

# --- ADD STAFF ---
@app.route("/staff", methods=["POST"])
def add_staff():
    data = request.json
    db = get_db_connection()
    cursor = db.cursor()

    # Insert staff
    cursor.execute(
        "INSERT INTO staff (name, position, contact, status) VALUES (%s, %s, %s, %s)",
        (data["name"], data["position"], data["contact"], data["status"])
    )
    db.commit()

    new_id = cursor.lastrowid  # ← get staff ID

    # -------- Generate QR Code --------
    qr_value = f"STAFF-{new_id}"
    qr_filename = f"staff_{new_id}.png"
    qr_path = os.path.join(QR_FOLDER, qr_filename)

    img = qrcode.make(qr_value)
    img.save(qr_path)

    # Save QR filename to DB
    cursor.execute(
        "UPDATE staff SET qr_code = %s WHERE id = %s",
        (qr_filename, new_id)
    )
    db.commit()

    cursor.close()
    db.close()

    return jsonify({
        "message": "Staff added successfully",
        "qr_code": qr_filename,
        "id": new_id
    }), 201

# --- GET SINGLE STAFF ---
@app.route("/staff/<int:id>", methods=["GET"])
def get_single_staff(id):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM staff WHERE id = %s", (id,))
    staff = cursor.fetchone()
    cursor.close()
    db.close()
    return jsonify(staff)

# --- UPDATE STAFF ---
@app.route("/staff/<int:id>", methods=["PUT"])
def update_staff(id):
    data = request.json
    db = get_db_connection()
    cursor = db.cursor()
    cursor.execute(
        "UPDATE staff SET name=%s, position=%s, contact=%s, status=%s WHERE id=%s",
        (data["name"], data["position"], data["contact"], data["status"], id)
    )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message": "Staff updated"})

# --- DELETE STAFF ---
@app.route("/staff/<int:id>", methods=["DELETE"])
def delete_staff(id):
    db = get_db_connection()
    cursor = db.cursor()
    cursor.execute("DELETE FROM staff WHERE id=%s", (id,))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message": "Staff deleted"})

def today_date():
    return date.today()

@app.route('/attendance/scan', methods=['POST'])
def attendance_scan():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    payload = data.get("payload", "")
    if not payload:
        return jsonify({"error": "No payload provided"}), 400

    # extract numeric ID from QR like STAFF-3
    import re
    m = re.search(r'(\d+)', str(payload))
    if not m:
        return jsonify({"error": "No staff id found in QR payload"}), 400

    staff_id = int(m.group(1))

    db = get_db_connection()
    cur = db.cursor(dictionary=True)

    # FIXED: correct columns!
    cur.execute("SELECT id, name FROM staff WHERE id = %s", (staff_id,))
    staff = cur.fetchone()

    if not staff:
        cur.close()
        db.close()
        return jsonify({"error": "Staff not found"}), 404

    today = today_date()

    cur.execute("""
        SELECT * FROM staff_attendance
        WHERE staff_id = %s AND date_record = %s
        ORDER BY attendance_id DESC
        LIMIT 1
    """, (staff_id, today))
    rec = cur.fetchone()

    now = datetime.now().replace(microsecond=0)

    if rec is None:
        cur.execute("""
            INSERT INTO staff_attendance (staff_id, date_record, time_in, status)
            VALUES (%s, %s, %s, %s)
        """, (staff_id, today, now, 'Present'))
        db.commit()

        inserted_id = cur.lastrowid
        cur.execute("SELECT * FROM staff_attendance WHERE attendance_id = %s", (inserted_id,))
        new_rec = cur.fetchone()

        cur.close()
        db.close()
        return jsonify({
            "action": "time_in",
            "message": f"Time IN recorded for {staff['name']}",
            "record": new_rec
        }), 201

    if rec.get('time_out') is None:
        cur.execute("""
            UPDATE staff_attendance
            SET time_out = %s, status = %s
            WHERE attendance_id = %s
        """, (now, 'Left', rec['attendance_id']))
        db.commit()

        cur.execute("SELECT * FROM staff_attendance WHERE attendance_id = %s", (rec['attendance_id'],))
        updated_rec = cur.fetchone()

        cur.close()
        db.close()
        return jsonify({
            "action": "time_out",
            "message": f"Time OUT recorded for {staff['name']}",
            "record": updated_rec
        }), 200

    # record already closed → new time_in
    cur.execute("""
        INSERT INTO staff_attendance (staff_id, date_record, time_in, status)
        VALUES (%s, %s, %s, %s)
    """, (staff_id, today, now, 'Present'))
    db.commit()
    new_id = cur.lastrowid
    cur.execute("SELECT * FROM staff_attendance WHERE attendance_id = %s", (new_id,))
    new_rec = cur.fetchone()

    cur.close()
    db.close()
    return jsonify({
        "action": "time_in_new",
        "message": f"New Time IN recorded for {staff['name']}",
        "record": new_rec
    }), 201

    
@app.route('/get_attendance', methods=['GET'])
def get_attendance():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Read filters from query string
    month = request.args.get('month')      # expecting "YYYY-MM"
    date_filter = request.args.get('date') # expecting "YYYY-MM-DD"
    name = request.args.get('name')        # partial match
    position = request.args.get('position')

    # Build SQL with parameterized WHERE clauses
    sql = """
        SELECT sa.attendance_id,
               DATE(sa.date_record) AS date_record,
               TIME_FORMAT(sa.time_in, '%H:%i') AS time_in,
               TIME_FORMAT(sa.time_out, '%H:%i') AS time_out,
               sa.status,
               s.id AS staff_id,
               s.name,
               s.position
        FROM staff_attendance sa
        JOIN staff s ON sa.staff_id = s.id
    """
    where = []
    params = []

    if month:
        # month format: YYYY-MM
        where.append("DATE_FORMAT(sa.date_record, '%%Y-%%m') = %s")
        params.append(month)

    if date_filter:
        where.append("DATE(sa.date_record) = %s")
        params.append(date_filter)

    if name:
        where.append("s.name LIKE %s")
        params.append(f"%{name}%")

    if position:
        where.append("s.position = %s")
        params.append(position)

    if where:
        sql += " WHERE " + " AND ".join(where)

    sql += " ORDER BY sa.date_record DESC, sa.time_in ASC, sa.attendance_id DESC"

    cursor.execute(sql, tuple(params))
    rows = cursor.fetchall()

    cursor.close()
    conn.close()

    # Rows already have time strings (HH:MM) via TIME_FORMAT and date_record as date object or string
    # Ensure date_record is a string "YYYY-MM-DD"
    for r in rows:
        # some connectors return date objects - convert if needed
        dr = r.get('date_record')
        if hasattr(dr, 'strftime'):
            r['date_record'] = dr.strftime("%Y-%m-%d")
        else:
            # keep as-is (likely already "YYYY-MM-DD")
            r['date_record'] = str(dr) if dr is not None else None

    return jsonify(rows)

@app.route('/announcements', methods=['POST'])
def add_announcement():
    data = request.json
    title = data.get('title')
    target = data.get('target', None)
    discount = int(data.get('discount', 0))
    start = data.get('start')
    end = data.get('end')
    type_ = data.get('type', 'General')

    if not title or not start or not end:
        return jsonify({"error":"Missing required fields"}), 400

    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    if type_ in ['Sale','Promotion'] and target:
        if target.startswith('cat:'):
            category = target.replace('cat:','')
            # Fetch all menus in that category
            cursor.execute("SELECT id, price FROM menu WHERE category=%s", (category,))
            items = cursor.fetchall()
            for item in items:
                original = float(item['price'])
                new_price = round(original*(100-discount)/100,2)
                cursor.execute("""
                    INSERT INTO announcements
                    (title, message, type, menu_id, target, original_price, new_price, discount, start_time, end_time)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (title,f"{discount}% OFF", type_, item['id'], target, original, new_price, discount, start, end))
        else:
            # Specific menu
            menu_id = int(target.replace("item:",""))
            cursor.execute("SELECT price, name FROM menu WHERE id=%s",(menu_id,))
            item = cursor.fetchone()
            original = float(item['price'])
            new_price = round(original*(100-discount)/100,2)
            cursor.execute("""
                INSERT INTO announcements
                (title, message, type, menu_id, target, original_price, new_price, discount, start_time, end_time)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,(title,f"{discount}% OFF",type_,menu_id,target,original,new_price,discount,start,end))
    else:
        # General announcement (no discount)
        cursor.execute("""
            INSERT INTO announcements
            (title, message, type, start_time, end_time)
            VALUES (%s,%s,%s,%s,%s)
        """,(title,title,'General',start,end))

    db.commit()
    cursor.close()
    db.close()
    return jsonify({"message":"✅ Announcement added"})


@app.route('/announcements', methods=['GET'])
def get_announcements():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    # Update status automatically
    cursor.execute("""
        UPDATE announcements
        SET status = CASE
            WHEN NOW() < start_time THEN 'scheduled'
            WHEN NOW() BETWEEN start_time AND end_time THEN 'active'
            ELSE 'expired'
        END
    """)
    db.commit()

    cursor.execute("""
        SELECT 
            a.*,
            NOW() BETWEEN a.start_time AND a.end_time AS is_active,
            m.name AS menu_name
        FROM announcements a
        LEFT JOIN menu m ON a.menu_id = m.id
        ORDER BY a.created_at DESC
    """)
    data = cursor.fetchall()

    # Category-wide announcements → menu_name = None
    for a in data:
        if a['target'] and a['target'].startswith('cat:'):
            a['menu_name'] = None

    cursor.close()
    db.close()
    return jsonify(data)


@app.route('/announcements/<int:announcement_id>', methods=['DELETE'])
def delete_announcement(announcement_id):
    db = get_db_connection()
    cursor = db.cursor()
    try:
        cursor.execute("DELETE FROM announcements WHERE id=%s", (announcement_id,))
        db.commit()
        cursor.close()
        db.close()
        return jsonify({"status":"success"})
    except Exception as e:
        db.rollback()
        cursor.close()
        db.close()
        return jsonify({"status":"error","message":str(e)}), 500


@app.route('/customer/menu', methods=['GET'])
def customer_menu():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT 
            m.id,
            m.name,
            m.category,
            m.image,
            m.price AS original_price,
            COALESCE(a.new_price, m.price) AS display_price,
            a.discount
        FROM menu m
        LEFT JOIN (
            SELECT a1.*
            FROM announcements a1
            JOIN (
                -- Pick the announcement with the highest discount per menu item
                SELECT menu_id, MAX(discount) AS max_discount
                FROM announcements
                WHERE NOW() BETWEEN start_time AND end_time
                GROUP BY menu_id
            ) a2 ON a1.menu_id = a2.menu_id AND a1.discount = a2.max_discount
            WHERE NOW() BETWEEN a1.start_time AND a1.end_time
        ) a ON m.id = a.menu_id
        ORDER BY m.id
    """)

    menu_items = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(menu_items)


if __name__ == '__main__':
    app.run(debug=True)

