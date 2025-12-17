# customer_app.py
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash
import time
import random
from datetime import datetime, timedelta
from customer_ai import handle_customer_ai_chat
from mailer import send_message

app = Flask(__name__, template_folder="main")  # if your HTML is in a folder called 'main'
CORS(app)  # allow the frontend to talk to this server

# DB connection helper - adjust credentials if necessary
def get_db_connection():
    return mysql.connector.connect(
        host="switchyard.proxy.rlwy.net",
        port=39390,
        user="root",             # replace if your Railway user is different
        password="sXeDPzMNsNACCqmHxGXjHWyPgrpgELDX", # replace with your Railway DB password
        database="railway"
    )
@app.route('/')
def home():
    return render_template('index.html') 

@app.route("/customer_auth")
def customer_auth():
    return render_template("customer_auth.html")

@app.route("/customer")
def customer():
    return render_template("customer.html")

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat()}), 200

@app.route("/signup", methods=["POST"])
def signup():
    """
    Expects JSON:
    { username, password, address, contact, accepted_terms: true/false }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status":"error", "message":"Invalid JSON"}), 400

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    address = (data.get("address") or "").strip()
    contact = (data.get("contact") or "").strip()
    accepted_terms = data.get("accepted_terms", False)

    # Basic validation
    if not username or not password:
        return jsonify({"status":"error","message":"Username and password are required"}), 400
    if not accepted_terms:
        return jsonify({"status":"error","message":"You must accept the Terms & Privacy to register."}), 400
    if len(password) < 6:
        return jsonify({"status":"error","message":"Password must be at least 6 characters."}), 400

    # Hash password
    password_hash = generate_password_hash(password)

    # Insert into DB (check duplicate username)
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        # check existing username
        cur.execute("SELECT customer_id FROM customers WHERE username = %s", (username,))
        if cur.fetchone():
            return jsonify({"status":"error","message":"Username already taken"}), 409

        cur.execute(
            "INSERT INTO customers (username, password_hash, address, contact) VALUES (%s, %s, %s, %s)",
            (username, password_hash, address, contact)
        )
        db.commit()
        new_id = cur.lastrowid
        cur.close()
        db.close()
        return jsonify({"status":"success", "message":"Account created successfully", "customer_id": new_id}), 201
    except Exception as e:
        db.rollback()
        cur.close()
        db.close()
        return jsonify({"status":"error","message":"Internal server error", "detail": str(e)}), 500

@app.route("/login", methods=["POST"])
def login():
    """
    Expects JSON: { username, password }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status":"error","message":"Invalid JSON"}), 400

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"status":"error","message":"Username and password required"}), 400

    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT customer_id, username, password_hash, address, contact FROM customers WHERE username = %s", (username,))
        user = cur.fetchone()
        cur.close()
        db.close()
        if not user:
            return jsonify({"status":"error","message":"Invalid username or password"}), 401

        if not check_password_hash(user['password_hash'], password):
            return jsonify({"status":"error","message":"Invalid username or password"}), 401

        # You may return a JWT or session token here. For simplicity we return user info (NO password)
        return jsonify({
            "status":"success",
            "message":"Login successful",
            "user": {
                "customer_id": user["customer_id"],
                "username": user["username"],
                "address": user["address"],
                "contact": user["contact"]
            }
        }), 200
    except Exception as e:
        cur.close()
        db.close()
        return jsonify({"status":"error","message":"Internal server error", "detail": str(e)}), 500

@app.route("/get_user", methods=["GET"])
def get_user():
    username = request.args.get("username")
    if not username:
        return jsonify({"status":"error", "message":"Username is required"}), 400

    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT customer_id, username, address, contact FROM customers WHERE username=%s",
            (username,)
        )
        user = cur.fetchone()
        cur.close()
        db.close()

        if not user:
            return jsonify({"status":"error", "message":"User not found"}), 404

        return jsonify({"status":"success", "user": user}), 200
    except Exception as e:
        cur.close()
        db.close()
        return jsonify({"status":"error", "message":"Internal server error", "detail": str(e)}), 500

@app.route("/customer_menu", methods=["GET"])
def customer_menu():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT 
            m.id,
            MAX(m.name) AS name,
            MAX(m.category) AS category,
            MAX(m.price) AS original_price,
        
            COALESCE(
                MAX(CASE WHEN menu_announce.discount > 0 THEN m.price * (1 - menu_announce.discount/100) END),
                MAX(CASE WHEN cat_announce.discount > 0 THEN m.price * (1 - cat_announce.discount/100) END),
                MAX(CASE WHEN global_announce.discount > 0 THEN m.price * (1 - global_announce.discount/100) END),
                MAX(m.price)
            ) AS display_price,
        
            COALESCE(
                MAX(menu_announce.discount),
                MAX(cat_announce.discount),
                MAX(global_announce.discount),
                0
            ) AS discount,
        
            MAX(COALESCE(
                menu_announce.start_time,
                cat_announce.start_time,
                global_announce.start_time
            )) AS start_date,
        
            MAX(COALESCE(
                menu_announce.end_time,
                cat_announce.end_time,
                global_announce.end_time
            )) AS end_date,
        
            MAX(m.image) AS image,
            COALESCE(SUM(oi.qty), 0) AS orders_count
        
        FROM menu m
        LEFT JOIN announcements menu_announce
            ON menu_announce.menu_id = m.id
            AND menu_announce.type='sale'
            AND NOW() BETWEEN menu_announce.start_time AND menu_announce.end_time
        
        LEFT JOIN announcements cat_announce
            ON cat_announce.target = CONCAT('cat:', m.category)
            AND cat_announce.type='sale'
            AND NOW() BETWEEN cat_announce.start_time AND cat_announce.end_time
        
        LEFT JOIN announcements global_announce
            ON global_announce.target = 'all'
            AND global_announce.type='sale'
            AND NOW() BETWEEN global_announce.start_time AND global_announce.end_time
        
        LEFT JOIN order_items oi ON m.id = oi.menu_id
        GROUP BY m.id;

    """)

    menus = cursor.fetchall()
    cursor.close()
    db.close()

    # Group by category (unchanged behavior)
    menu_by_category = {}
    for item in menus:
        cat = item['category'] or "Other"
        if cat not in menu_by_category:
            menu_by_category[cat] = []
        menu_by_category[cat].append(item)

    return jsonify(menu_by_category)



@app.route("/popular_menu", methods=["GET"])
def popular_menu():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT 
            m.id,
            MAX(m.name) AS name,
            MAX(m.category) AS category,
            MAX(m.price) AS price,
            MAX(m.image) AS image,
            COALESCE(SUM(oi.qty),0) AS total_ordered
        FROM menu m
        LEFT JOIN order_items oi ON m.id = oi.menu_id
        GROUP BY m.id
        ORDER BY total_ordered DESC
        LIMIT 3;
    """)
    popular = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(popular)

@app.route('/checkout', methods=['POST'])
def checkout():
    db = get_db_connection()
    data = request.json
    username = data.get('username')  # customer
    cart = data.get('cart')  # list of {id, name, qty, price}

    if not cart or not username:
        return jsonify({"status":"error","message":"Missing data"}), 400

    total = sum(item['qty'] * item['price'] for item in cart)

    cursor = db.cursor()

    # Insert order with status 'Pending' and order_type NULL for online orders
    cursor.execute(
        "INSERT INTO orders (username, total, status, type, order_type, table_number, created_at) "
        "VALUES (%s, %s, %s, %s, %s, %s, NOW())",
        (username, total, 'Pending', 'Online', None, None)
    )
    order_id = cursor.lastrowid

    # Insert items, all linked to this order_id
    for item in cart:
        cursor.execute(
            "INSERT INTO order_items (order_id, menu_id, name, qty, price) VALUES (%s,%s,%s,%s,%s)",
            (order_id, item['id'], item['name'], item['qty'], item['price'])
        )

    db.commit()
    cursor.close()

    return jsonify({"status":"success", "order_id": order_id})


@app.route('/my_orders/<username>', methods=['GET'])
def my_orders(username):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT o.id as order_id, o.total, o.status, o.created_at,
               oi.menu_id, oi.name as item_name, oi.qty, oi.price
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.username = %s
        ORDER BY o.created_at DESC
    """, (username,))
    
    rows = cursor.fetchall()
    orders_dict = {}
    for r in rows:
        oid = r['order_id']
        if oid not in orders_dict:
            orders_dict[oid] = {
                "order_id": oid,
                "total": r['total'],
                "status": r['status'],
                "created_at": r['created_at'].isoformat(),
                "items": []
            }
        orders_dict[oid]["items"].append({
            "menu_id": r['menu_id'],
            "name": r['item_name'],
            "qty": r['qty'],
            "price": float(r['price'])
        })
    
    cursor.close()
    return jsonify(list(orders_dict.values()))

@app.route('/cancel_order/<int:order_id>', methods=['POST'])
def cancel_order(order_id):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    # Check order exists and is within 3 minutes
    cursor.execute("SELECT created_at, status FROM orders WHERE id=%s", (order_id,))
    order = cursor.fetchone()
    if not order:
        return jsonify({"status":"error", "message":"Order not found."})

    from datetime import datetime, timedelta
    if order['status'].lower() != 'pending':
        return jsonify({"status":"error", "message":"Cannot cancel this order."})
    if datetime.now() - order['created_at'] > timedelta(minutes=3):
        return jsonify({"status":"error", "message":"Cancellation period expired."})

    # Update status
    cursor.execute("UPDATE orders SET status='cancelled' WHERE id=%s", (order_id,))
    db.commit()
    cursor.close()
    return jsonify({"status":"success"})

@app.route('/customer_ai_chat', methods=['POST'])
def customer_ai_chat():
    data = request.get_json(silent=True) or {}
    result = handle_customer_ai_chat(data, get_db_connection)
    return jsonify(result)



@app.route("/customer_announcements", methods=["GET"])
def customer_announcements():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT 
            a.id, a.title, a.message, a.type, a.menu_id, a.target, a.discount,
            m.name AS menu_name
        FROM announcements a
        LEFT JOIN menu m ON a.menu_id = m.id
        WHERE NOW() BETWEEN a.start_time AND a.end_time
        ORDER BY a.start_time ASC
    """)
    data = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(data)

def get_order_status_list(username):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT id, status, total, created_at
        FROM orders
        WHERE username=%s
        ORDER BY created_at DESC
        LIMIT 3
    """, (username,))

    orders = cursor.fetchall()
    cursor.close()
    db.close()
    return orders


def get_order_by_id(order_id, username):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT status, total, created_at
        FROM orders
        WHERE id=%s AND username=%s
    """, (order_id, username))

    order = cursor.fetchone()
    cursor.close()
    db.close()
    return order

@app.route("/send_message", methods=["POST"])
def send_message():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"success": False, "message": "Invalid data"}), 400

    try:
        send_message(
            name=data.get("name"),
            customer_email=data.get("email"),
            message=data.get("message")
        )
        return jsonify({
            "success": True,
            "message": "Message sent successfully!"
        })
    except Exception as e:
        print("Mailer error:", e)
        return jsonify({
            "success": False,
            "message": "Failed to send email"
        }), 500


if __name__ == '__main__':
    app.run(debug=True)





