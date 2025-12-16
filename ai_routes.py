from flask import Blueprint, request, jsonify, session
from datetime import datetime
import time, random
import mysql.connector
import qrcode
import os


QR_FOLDER = "static/qrcodes" 

ai_bp = Blueprint("ai", __name__, url_prefix="/ai")

# -----------------------------
# DB CONNECTION
# -----------------------------
def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="",
        database="restaurant_db"
    )

# -----------------------------
# DATA FETCHERS
# -----------------------------
def fetch_inventory(db):
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT name, quantity, threshold, unit, category FROM inventory")
    data = cur.fetchall()
    cur.close()
    return data

def fetch_inventory_alerts(db):
    cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT name, quantity, threshold, unit
        FROM inventory
        WHERE quantity <= threshold
    """)
    alerts = cur.fetchall()
    cur.close()
    return alerts

def fetch_menu(db):
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT id, name, price FROM menu")
    data = cur.fetchall()
    cur.close()
    return data

def fetch_active_sales(db):
    cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT title, discount
        FROM announcements
        WHERE type='Sale'
        AND NOW() BETWEEN start_time AND end_time
    """)
    data = cur.fetchall()
    cur.close()
    return data

def fetch_sales_stats(db, days=30):
    cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT oi.name, SUM(oi.qty) AS total_qty
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.status='Completed'
        AND o.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        GROUP BY oi.name
        ORDER BY total_qty DESC
    """, (days,))
    data = cur.fetchall()
    cur.close()
    return data

def fetch_total_sales(db, days=30):
    cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT SUM(total) AS total_sales
        FROM orders
        WHERE status='Completed'
        AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
    """, (days,))
    total = float(cur.fetchone()["total_sales"] or 0)
    cur.close()
    return total

def fetch_peak_hours(db):
    cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT HOUR(created_at) AS hour, COUNT(*) AS orders_count
        FROM orders
        WHERE status='Completed'
        GROUP BY hour
        ORDER BY orders_count DESC
        LIMIT 3
    """)
    data = cur.fetchall()
    cur.close()
    return data

def predict_stock_depletion(db):
    cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT i.name, i.quantity, i.threshold, i.unit,
        IFNULL(SUM(oi.qty)/30,0) AS daily_avg
        FROM inventory i
        LEFT JOIN order_items oi ON i.name = oi.name
        LEFT JOIN orders o ON oi.order_id = o.id
        WHERE o.status='Completed'
        GROUP BY i.name
    """)
    data = cur.fetchall()
    cur.close()
    return data

def fetch_current_staff(db):
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT COUNT(*) AS total_staff FROM staff WHERE status='Active'")
    staff_count = cur.fetchone()["total_staff"]
    cur.close()
    return staff_count

def start_menu_confirmation(name, category, price, inventory):
    # Suggest ingredients
    suggested = [
        i["name"] for i in inventory
        if i["category"].lower() == category
    ]

    return (
        f"🍽 MENU CONFIRMATION\n\n"
        f"Name: {name}\n"
        f"Category: {category.capitalize()}\n"
        f"Price: ₱{price}\n\n"
        f"📸 Select an image for this menu item (image collector activated).\n"
        f"🧂 Suggested ingredients & check quantities needed:\n"
        + ("\n".join(f"• {i}" for i in suggested) if suggested else "• No suggestions found")
        + "\n\n"
        "Type `confirm menu` to save, or `cancel menu` to abort.\n"
        "After selecting ingredients, just specify the quantities in the format:\n"
        "`ingredient_name quantity`"
    )


# -----------------------------
# AI LOGIC ENGINE
# -----------------------------

def format_ampm(hour):
    if hour == 0:
        return "12 AM"
    elif hour < 12:
        return f"{hour} AM"
    elif hour == 12:
        return "12 PM"
    else:
        return f"{hour-12} PM"
    
import re
from datetime import datetime

def parse_time_flexible(time_str):
    time_str = time_str.strip().upper()
    time_str = time_str.replace(".", "")  # remove dots like p.m.

    formats = [
        "%I:%M %p",   # 7:30 PM
        "%I %p",      # 7 PM
        "%H:%M",      # 19:30
        "%H"          # 19
    ]

    for fmt in formats:
        try:
            return datetime.strptime(time_str, fmt).strftime("%H:%M:%S")
        except ValueError:
            continue

    raise ValueError("Invalid time format. Use 6:30 PM or 18:30")



def extract_table_number(text):
    text = text.lower()

    if "whole restaurant" in text:
        return None

    match = re.search(r"table\s*(no\.?|number)?\s*(\d+)", text)
    if match:
        return int(match.group(2))

    return None


def generate_owner_reply(message):
    msg = message.lower()
    reply = []
    db = get_db_connection()

    try:
        inventory = fetch_inventory(db)
        alerts = fetch_inventory_alerts(db)
        sales = fetch_sales_stats(db, days=30)
        total_sales = fetch_total_sales(db, days=30)
        active_sales = fetch_active_sales(db)
        menu = fetch_menu(db)
        peak_hours = fetch_peak_hours(db)
        staff_count = fetch_current_staff(db)

        # -------------------------------
# ADD COMMAND MODE (TOP PRIORITY)
# -------------------------------

        if msg.strip() == "add":
            return (
                "🧠 ADD COMMAND MODE\n\n"
                "Type `add <module>` to see instructions:\n\n"
                "• add menu\n"
                "• add inventory\n"
                "• add staff\n"
                "• add announcement\n"
                "• add reservation"
            )

        elif msg.startswith("add "):
            parts = message.split()
            action = parts[1].lower()

            # ---------------------------
            # MODULE-SPECIFIC HELP
            # ---------------------------
            if len(parts) == 2:
                if action == "menu":
                    return (
                        "🍽 ADD MENU\n"
                        "You can add a initial menu by following the format below.\n"
                        "Format:\n"
                        "add menu &lt;name&gt; &lt;category&gt; &lt;price&gt;\n"
                        "Example:\n"
                        "add menu &lt;Burger&gt; &lt;Meals&gt; &lt;120&gt;"
                    )

                if action == "inventory":
                    return (
                        "📦 ADD INVENTORY\n"
                        "Format:\n"
                        "add inventory &lt;name&gt; &lt;quantity&gt; &lt;unit&gt; &lt;threshold&gt;\n"
                        "Example:\n"
                        "add inventory Sugar 5 kg 2"
                    )

                if action == "staff":
                    return (
                        "👨‍🍳 ADD STAFF\n"
                        "Format:\n"
                        "add staff &lt;name&gt; &lt;position&gt; &lt;contact&gt; &lt;status&gt;\n"
                        "Example:\n"
                        "add staff Juan Waiter 091234567 Active"
                    )

                if action == "announcement":
                    return (
                        "🏷 ADD ANNOUNCEMENT\n"
                        "Format:\n"
                        "add announcement &lt;title&gt; &lt;discount%&gt; &lt;target&gt; &lt;start_date&gt; &lt;end_date&gt;\n"
                        "Example:\n"
                        "add announcement HolidaySale 20 cat:Drinks 2025-12-01 2025-12-31"
                    )

                if action == "reservation":
                    return (
                        "📅 ADD RESERVATION\n"
                        "Format:\n"
                        "add reservation &lt;customer_name&gt; &lt;contact_number&gt; &lt;date&gt; &lt;time&gt; &lt;num_guests&gt;\n\n"
                        "Example:\n"
                        "add reservation JuanDelaCruz 09123456789 2025-12-20 18:30 4\n\n"
                        "Notes:\n"
                        "- table_number is optional\n"
                        "- status defaults to Active"
                    )



                return "❌ Unknown add module. Type `add` to see available options."

            # ---------------------------
            # EXECUTION MODE
            # ---------------------------
            try:
                if action == "menu" and len(parts) == 5:
                    name = parts[2]
                    category = parts[3].strip().lower()
                    price = float(parts[4])

                    # Store only basic info in session
                    session["pending_menu"] = {
                        "name": name,
                        "category": category,
                        "price": price
                    }

                    return (
                        f"🍽 MENU CONFIRMATION\n\n"
                        f"Name: {name}\n"
                        f"Category: {category.capitalize()}\n"
                        f"Price: ₱{price}\n\n"
                        "Type `confirm menu` to save, or `cancel menu` to abort."
                    )

            

                if action == "inventory" and len(parts) == 6:
                    return ai_add_inventory(db, parts[2], float(parts[3]), parts[4], float(parts[5]))

                if action == "staff" and len(parts) == 6:
                    return ai_add_staff(db, parts[2], parts[3], parts[4], parts[5])

                if action == "announcement" and len(parts) == 7:
                    return ai_add_announcement(
                        db, parts[2], int(parts[3]), parts[4], parts[5], parts[6]
                    )

                if action == "reservation":
                    raw = message.lower()

                    # Remove commas (natural typing)
                    raw = raw.replace(",", "")

                    # --- Extract table
                    table_no = extract_table_number(raw)

                    # --- Extract guests
                    guests = extract_guest_count(raw) or 1

                    # --- Clean text
                    cleaned = re.sub(r"table\s*(no\.?|number)?\s*\d+", "", raw)
                    cleaned = re.sub(r"no\s*of\s*guests?\s*\d+", "", cleaned)
                    cleaned = re.sub(r"guests?\s*\d+", "", cleaned)
                    cleaned = cleaned.replace("whole restaurant", "")

                    tokens = cleaned.split()

                    try:
                        # Name (first word after 'add reservation')
                        name = tokens[2].capitalize()

                        # Contact number
                        contact = next(t for t in tokens if t.isdigit() and len(t) >= 10)

                        # Date
                        date = next(t for t in tokens if "-" in t)

                        # Time
                        date_index = tokens.index(date)
                        time_raw = tokens[date_index + 1]

                        if date_index + 2 < len(tokens) and tokens[date_index + 2] in ["am", "pm"]:
                            time_raw += " " + tokens[date_index + 2]

                        time_24 = parse_time_flexible(time_raw)

                        return ai_add_reservation(
                            db,
                            customer_name=name,
                            contact=contact,
                            date=date,
                            time_=time_24,
                            guests=guests,
                            table_no=table_no
                        )

                    except Exception as e:
                        return f"❌ Reservation error: {str(e)}"




                return "❌ Invalid format. Type `add <module>` to see correct usage."

            except Exception as e:
                return f"❌ Failed to process add command: {str(e)}"

        # -------------------------------
# MENU CONFIRMATION HANDLING
# -------------------------------
# -------------------------------
# HANDLE INGREDIENT QUANTITIES

        if msg == "confirm menu":
            pending = session.get("pending_menu")
            if not pending:
                return "❌ No pending menu to confirm."

            cur = db.cursor()
            cur.execute(
                "INSERT INTO menu (name, category, price) VALUES (%s,%s,%s)",
                (pending["name"], pending["category"].capitalize(), pending["price"])
            )
            db.commit()
            cur.close()
            session.pop("pending_menu", None)

            return f"✅ Menu '{pending['name']}' added!"



        if msg == "cancel menu":
            session.pop("pending_menu", None)
            return "❌ Menu creation cancelled."

        # -------------------------------
        # INVENTORY ALERT - only once per session
        # -------------------------------
        if ("inventory" in msg or "stock" in msg) and not session.get("inventory_alert_shown"):
            session["inventory_alert_shown"] = True
            if alerts:
                reply.append("🚨 INVENTORY ALERT (shown once per session):")
                for a in alerts:
                    reply.append(f"⚠️ {a['name']} is below threshold ({a['quantity']}{a['unit']} remaining).")
                reply.append("👉 Immediate restocking recommended.\n")
            reply.append(f"📦 Inventory Overview: Total ingredients: {len(inventory)}")
            return "\n".join(reply)

        # -------------------------------
        # PROMOTIONS
        # -------------------------------
        if "promotion" in msg or "promotions" in msg or "promo" in msg:
            reply.append("🏷 Active Promotions & Suggestions:")
            if active_sales:
                for s in active_sales:
                    reply.append(f"   • {s['title']} ({s['discount']}% OFF)")
            else:
                reply.append("💡 No active promotions. Consider running combos or discounts.")
            
            # Suggest new promotions based on slow-selling items
            if sales:
                slow_items = [s['name'] for s in sales[-3:]]  # last 3 slowest
                reply.append("💡 Suggested Promotions based on sales trends:")
                for item in slow_items:
                    reply.append(f"   - Promote '{item}' with a bundle or discount to increase sales.")
            
            # Suggest promotions avoiding low-stock items
            low_stock = [i['name'] for i in inventory if i['quantity'] <= i['threshold']]
            if low_stock:
                reply.append("⚠️ Avoid promotions using low-stock items:")
                for item in low_stock:
                    reply.append(f"   - {item}")
            return "\n".join(reply)

        # -------------------------------
        # STAFF MANAGEMENT
        # -------------------------------
        if "staff" in msg or "employee" in msg or "schedule" in msg:
            reply.append("💡 Staff Handling Suggestions:")
            reply.append(f"- Current number of active staff: {staff_count}")
            
            if peak_hours:
                peak_str = ", ".join([format_ampm(h['hour']) for h in peak_hours])
                reply.append(f"- Peak hours are: {peak_str} — assign more staff accordingly.")
            else:
                reply.append("- Monitor orders and adjust staff shifts as needed.")
            
            reply.append("- Ensure proper rotation and training to handle busy periods efficiently.")
            reply.append("- Schedule staff breaks during off-peak hours to maintain service quality.")
            return "\n".join(reply)


        # -------------------------------
        # INSIGHTS & SUGGESTIONS
        # -------------------------------
        if "insight" in msg or "suggestion" in msg or "recommend" in msg:
            reply.append("💡 AI Insights & Recommendations:")
            
            # Sales insights
            if sales:
                top = sales[0]
                slow = sales[-1]
                reply.append(f"- Top-selling item: {top['name']} ({top['total_qty']} sold)")
                reply.append(f"- Slow-selling item: {slow['name']}")
                reply.append(f"- Consider bundling '{slow['name']}' or running limited-time discounts to boost sales.")
            
            # Staff insights
            if peak_hours:
                peak_str = ", ".join([format_ampm(h['hour']) for h in peak_hours])
                reply.append(f"- Peak hours: {peak_str} — optimize staff allocation and schedule promotions accordingly.")
            
            # Inventory insights
            low_stock = [i['name'] for i in inventory if i['quantity'] <= i['threshold']]
            if low_stock:
                reply.append("- Low-stock items detected. Restock urgently to avoid service disruption.")
            
            # Menu suggestions
            if menu:
                reply.append("- Review menu items for popularity and adjust offerings if necessary.")
            
            # Promotions
            if not active_sales:
                reply.append("- Launch weekend or happy-hour promotions to increase sales.")
            
            return "\n".join(reply)

        # -------------------------------
        # MENU
        # -------------------------------
        if "menu" in msg or "dish" in msg:
            reply.append(f"🍽 Menu Summary ({len(menu)} items):")
            for m in menu[:8]:
                reply.append(f"   • {m['name']} – ₱{m['price']}")
            if len(menu) > 8:
                reply.append("   ...and more")
            return "\n".join(reply)

        # -------------------------------
        # SALES
        # -------------------------------
        if "sales" in msg:
            if sales:
                top = sales[0]
                slow = sales[-1]
                reply.append(f"🔥 Top Seller: {top['name']} ({top['total_qty']} sold)")
                reply.append(f"📉 Slow Seller: {slow['name']}")
                reply.append("💡 Suggestion: Consider bundles or discounts for slow-selling items.")
            reply.append(f"💰 Total Revenue (Last 30 days): ₱{total_sales:,.2f}")
            if peak_hours:
                peak_str = ", ".join([format_ampm(h['hour']) for h in peak_hours])
                reply.append(f"⏰ Peak Hours: {peak_str}")
                reply.append("💡 Align staff and promotions with peak hours.")
            return "\n".join(reply)
                
        # -------------------------------
# SALES / REVENUE ONLY
# -------------------------------
        if "revenue" in msg:
            # Show only total revenue
            reply.append(f"💰 Total Revenue (Last 30 days): ₱{total_sales:,.2f}")
            
            # Add a suggestion
            if sales:
                slow = sales[-1]
                reply.append(f"💡 Suggestion: Consider running promotions or bundles for slow-selling item '{slow['name']}' to boost revenue.")
            else:
                reply.append("💡 Suggestion: Launch promotions or discounts to increase sales.")

            return "\n".join(reply)
        
        if "order" in msg or "orders" in msg:
            cursor = db.cursor(dictionary=True)
            cursor.execute("""
                SELECT type, order_type
                FROM orders
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            """)
            rows = cursor.fetchall()
            cursor.close()

            order_type_counts = {"Online": 0, "Dine-in": 0, "Takeout": 0}
            for r in rows:
                type_field = (r['type'] or "").strip().lower()
                order_type_field = (r['order_type'] or "").strip().lower()

                if type_field == "online":
                    order_type_counts["Online"] += 1
                elif order_type_field in ["dine-in", "dinein", "dining"]:
                    order_type_counts["Dine-in"] += 1
                elif order_type_field in ["takeout", "take-out", "pickup"]:
                    order_type_counts["Takeout"] += 1

            reply.append("📊 Orders in the last 30 days:")
            for key in ["Online", "Dine-in", "Takeout"]:
                reply.append(f"- {key}: {order_type_counts[key]} orders")

            return "\n".join(reply)
                # -------------------------------
        # AI COMMAND MODE (ADD OPERATIONS)
        # -------------------------------

                # -------------------------------
        # ADD COMMAND HELP
        # -------------------------------
        

        # -------------------------------
        # FALLBACK
        # -------------------------------
        reply.append("I can provide insights on inventory, sales, menu, promotions, staff, and suggestions. Ask me a specific question.")

    except Exception as e:
        reply.append(f"❌ Error analyzing data: {str(e)}")
    finally:
        db.close()

    return "\n".join(reply)


# -----------------------------
# API ROUTES
# -----------------------------
@ai_bp.route("/owner_chat", methods=["POST"])
def owner_chat():
    try:
        payload = request.get_json(silent=True) or {}
        msg = payload.get("message", "").strip()
        if not msg:
            return jsonify({"error": "Message required"}), 400

        time.sleep(random.uniform(0.6, 1.1))  # thinking delay
        reply = generate_owner_reply(msg)

        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": "Server error", "details": str(e)}), 500

@ai_bp.route("/inventory_alerts", methods=["GET"])
def inventory_alerts():
    db = get_db_connection()
    alerts = fetch_inventory_alerts(db)
    db.close()
    return jsonify({"count": len(alerts), "items": alerts})

# -----------------------------
# AI ACTION HELPERS (ADD ONLY)
# -----------------------------

def ai_add_menu(db, name, category, price):
    cur = db.cursor()
    cur.execute(
        "INSERT INTO menu (name, category, price) VALUES (%s,%s,%s)",
        (name, category, price)
    )
    db.commit()
    cur.close()
    return f"✅ Menu item '{name}' added (₱{price}) under {category}"

def ai_add_inventory(db, name, quantity, unit, threshold):
    cur = db.cursor()
    cur.execute("""
        INSERT INTO inventory (name, quantity, unit, threshold)
        VALUES (%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
    """, (name, quantity, unit, threshold))
    db.commit()
    cur.close()
    return f"✅ Inventory '{name}' updated: +{quantity}{unit}"

def ai_add_staff(db, name, position, contact, status):
    try:
        cur = db.cursor()
        # Insert staff
        cur.execute("""
            INSERT INTO staff (name, position, contact, status)
            VALUES (%s,%s,%s,%s)
        """, (name, position, contact, status))
        staff_id = cur.lastrowid

        # Generate QR
        qr_filename = generate_staff_qr(staff_id, name)

# Save only filename in DB
        cur.execute("UPDATE staff SET qr_code=%s WHERE id=%s", (qr_filename, staff_id))

        db.commit()
        cur.close()
        return f"✅ Staff '{name}' added successfully with QR code."
    except Exception as e:
        return f"❌ Failed to add staff: {str(e)}"


def ai_add_announcement(db, title, discount, target, start, end):
    cur = db.cursor()
    cur.execute("""
        INSERT INTO announcements
        (title, message, type, target, discount, start_time, end_time)
        VALUES (%s,%s,'Sale',%s,%s,%s,%s)
    """, (title, f"{discount}% OFF", target, discount, start, end))
    db.commit()
    cur.close()
    return f"✅ Announcement '{title}' added ({discount}% OFF)"

def ai_add_reservation(db, customer_name, contact, date, time_, guests, table_no=None):
    cur = db.cursor()

    cur.execute("""
        INSERT INTO reservations
        (customer_name, contact_number, reservation_date, reservation_time, table_number, num_guests)
        VALUES (%s,%s,%s,%s,%s,%s)
    """, (customer_name, contact, date, time_, table_no, guests))

    db.commit()
    cur.close()

    table_msg = f"🪑 Table {table_no}" if table_no else "🪑 Table: Not specified"

    return (
        f"✅ Reservation added\n"
        f"👤 {customer_name}\n"
        f"📞 {contact}\n"
        f"📅 {date} at {time_}\n"
        f"👥 {guests} guests\n"
        f"{table_msg}"
    )

def extract_guest_count(text):
    text = text.lower()

    patterns = [
        r"no\s*of\s*guests?\s*,?\s*(\d+)",
        r"guests?\s*,?\s*(\d+)"
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))

    return None
def generate_staff_qr(staff_id, staff_name):
    if not os.path.exists(QR_FOLDER):
        os.makedirs(QR_FOLDER)
    
    filename = f"staff_{staff_id}.png"
    qr_path = os.path.join(QR_FOLDER, filename)
    qr_data = f"STAFF ID: {staff_id}\nName: {staff_name}"
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(qr_path)
    
    return filename  # return only filename
