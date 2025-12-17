import re
import time
import random
import traceback


def handle_customer_ai_chat(data, get_db_connection):
    """
    Customer AI Chat Logic
    (Pure logic — NO Flask, NO app imports)
    """

    user_message = (data.get("message") or "").strip()
    username = (data.get("username") or "").strip() or "Guest"

    if not user_message:
        return {"reply": "Please type or speak a message."}
        
    thinking_message = "🤖 Thinking..."
    time.sleep(random.uniform(0.3, 0.7))  # simulate AI thinking

    db = get_db_connection()
    cursor = db.cursor()
    reply = []

    msg_lower = user_message.lower()

    try:
        # ---------------- FETCH DATA ----------------
        cursor.execute("SELECT id, name, category, price FROM menu")
        menu = cursor.fetchall()

        cursor.execute("""
            SELECT oi.name, SUM(oi.qty) AS total_qty
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.status='Completed'
            GROUP BY oi.name
            ORDER BY total_qty DESC
        """)
        sales = cursor.fetchall()

        # ---------------- REVIEW ----------------
        # ---------------- REVIEW ----------------
        if msg_lower.startswith("review") or re.match(r"^[1-5]\s*stars?", msg_lower):

            rating = None
            text = None

            # Pattern 1: "Review 5 Amazing food"
            match_review = re.match(r"review\s+([1-5])\s+(.+)", user_message, re.IGNORECASE)

            # Pattern 2: "5 stars Amazing food" OR "1 star bad service"
            match_stars = re.match(r"([1-5])\s*stars?\s+(.+)", user_message, re.IGNORECASE)

            if match_review:
                rating = int(match_review.group(1))
                text = match_review.group(2).strip()

            elif match_stars:
                rating = int(match_stars.group(1))
                text = match_stars.group(2).strip()

            if not rating or not text:
                reply.append(
                    "⭐ **How to leave a review:**\n"
                    "• Review 5 Amazing food\n"
                    "• 5 stars Amazing food"
                )
            else:
                cursor.execute(
                    "INSERT INTO reviews (customer_name, text, rating) VALUES (%s, %s, %s)",
                    (username, text, rating)
                )
                db.commit()

                stars = "⭐" * rating
                reply.append(
                    "✅ **Thank you for your review!**\n"
                    f"{stars} ({rating}/5)\n"
                    f"💬 {text}"
                )


        # ---------------- FEEDBACK ----------------
        elif msg_lower.startswith("feedback"):
            feedback_text = user_message[len("feedback"):].strip()

            if not feedback_text:
                reply.append(
                    "📝 **How to send feedback:**\n"
                    "Feedback Your message here"
                )
            else:
                cursor.execute(
                    "INSERT INTO feedback (feedback) VALUES (%s)",
                    (feedback_text,)
                )
                db.commit()

                reply.append(
                    "🙏 **Thank you for your feedback!**\n"
                    "We appreciate your thoughts and will use them to improve."
                )

        # ---------------- REPEAT LAST ORDER ----------------
        elif "repeat last order" in msg_lower:
            cursor.execute("""
                SELECT oi.menu_id, oi.name, oi.qty, oi.price
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                WHERE o.username=%s
                ORDER BY o.created_at DESC
                LIMIT 1
            """, (username,))
            last_order = cursor.fetchall()

            if last_order:
                total = sum(i['qty'] * i['price'] for i in last_order)

                cursor.execute(
                    "INSERT INTO orders (username,total,status,type,created_at) VALUES (%s,%s,'Pending','Online',NOW())",
                    (username, total)
                )
                new_order_id = cursor.lastrowid

                for i in last_order:
                    cursor.execute(
                        "INSERT INTO order_items (order_id,menu_id,name,qty,price) VALUES (%s,%s,%s,%s,%s)",
                        (new_order_id, i['menu_id'], i['name'], i['qty'], i['price'])
                    )

                db.commit()
                reply.append(f"✅ **Order repeated successfully!**\nOrder ID: {new_order_id}")
            else:
                reply.append("❌ You don’t have any previous orders.")

        # ---------------- PLACE ORDER ----------------
        # ---------------- PLACE ORDER ----------------
        elif "order" in msg_lower:
            matches = re.findall(r"(\d+)\s+([\w\s]+)", user_message)
            if not matches:                    reply.append(
                    "🛒 **To place an order:**\n"
                    "Type the quantity followed by the dish name.\n"
                    "Example: '2 Adobo, 1 Sinigang'\n"
                    "Here are some suggestions from our menu:"
                )
                # Suggest top 3 menu items
                for m in menu[:3]:
                    reply.append(f"• {m['name']} ({m['category']}) — ₱{m['price']:.2f}")
                # Suggest top-selling item
                if sales:
                    top = sales[0]
                    reply.append(f"💡 Customers also love: {top['name']} (ordered {top['total_qty']} times)")
            else:
                items = []
                for qty, name in matches:
                    cursor.execute(
                        "SELECT id, name, price FROM menu WHERE name LIKE %s LIMIT 1",
                        (f"%{name.strip()}%",)
                    )
                    m = cursor.fetchone()
                    if m:
                        items.append({
                            "id": m["id"],
                            "name": m["name"],
                            "qty": int(qty),
                            "price": float(m["price"])
                        })
        
                if items:
                    total = sum(i['qty'] * i['price'] for i in items)
                    cursor.execute(
                        "INSERT INTO orders (username,total,status,type,created_at) VALUES (%s,%s,'Pending','Online',NOW())",
                        (username, total)
                    )
                    order_id = cursor.lastrowid            
                        
                    for i in items:
                        cursor.execute(
                            "INSERT INTO order_items (order_id,menu_id,name,qty,price) VALUES (%s,%s,%s,%s,%s)",
                            (order_id, i['id'], i['name'], i['qty'], i['price'])
                        )
            
                    db.commit()
                    reply.append(f"✅ **Order placed!**\nOrder ID: {order_id}\nTotal: ₱{total:.2f}")
                else:
                    reply.append("❌ I couldn't recognize the items you ordered. Please check the dish names.")
            
            # ---------------- ORDER STATUS ----------------
        elif "status" in msg_lower:
            order_id = re.findall(r"\b\d+\b", user_message)
            
            if not order_id:
                reply.append(
                    "📦 **To check your order status:**\n"
                    "• Type 'status <order_id>' to check a specific order.\n"
                    "• Type 'status' to see your recent orders.\n"
                    "💡 Tip: You can also type 'suggest' or 'recommend' to see popular dishes!"
                )
            
            if order_id:
                oid = int(order_id[0])
                cursor.execute(
                    "SELECT status,total,created_at FROM orders WHERE id=%s AND username=%s",
                    (oid, username)
                )
                order = cursor.fetchone()
            
                if order:
                    reply.append(
                        f"📦 **Order {oid}**\n"
                        f"- Status: {order['status']}\n"
                        f"- Total: ₱{order['total']:.2f}\n"
                        f"- Date: {order['created_at']}"
                    )
                else:
                    reply.append("❌ Order not found.")
            else:
                cursor.execute("""
                    SELECT id,status,total FROM orders
                    WHERE username=%s
                    ORDER BY created_at DESC
                    LIMIT 3
                """, (username,))
                orders = cursor.fetchall()
        
                if orders:
                    reply.append("📦 **Your recent orders:**")
                    for o in orders:
                        reply.append(f"• Order {o['id']} — {o['status']} | ₱{o['total']:.2f}")
                else:
                    reply.append("You have no recent orders.")
            
            # ---------------- RECOMMEND / SUGGEST ----------------
        elif "recommend" in msg_lower or "suggest" in msg_lower:
            reply.append("💡 **Here are some popular dishes:**")
                # Top-selling items first
            if sales:
                for i, top in enumerate(sales[:5], start=1):
                    reply.append(f"{i}. {top['name']} (ordered {top['total_qty']} times)")
            # If no sales data, show menu suggestions
            else:
                for m in menu[:5]:
                    reply.append(f"• {m['name']} ({m['category']}) — ₱{m['price']:.2f}")


        # ---------------- MENU ----------------
        elif "menu" in msg_lower:
            reply.append("🍽 **Menu:**")
            for m in menu:
                reply.append(f"• {m['name']} ({m['category']}) — ₱{m['price']:.2f}")

        # ---------------- RECOMMEND ----------------
        elif "recommend" in msg_lower:
            if sales:
                top = sales[0]
                reply.append(
                    "⭐ **Recommended Dish:**\n"
                    f"• {top['name']} (ordered {top['total_qty']} times)"
                )
            else:
                reply.append("💡 No recommendation data yet.")

        # ---------------- FALLBACK ----------------
        else:
            reply.append(
                "💡 **I can help you with:**\n"
                "• **Menu** — Type 'menu' to see the available dishes.\n"
                "• **Order food** — Example: '2 Adobo, 1 Sinigang'\n"
                "• **Repeat last order** — Type 'repeat last order'\n"
                "• **Order status** — Example: 'status 123' to check a specific order, or 'status' to see recent orders\n"
                "• **Review** — Example: 'Review 5 Amazing food' or '5 stars Amazing food'\n"
                "• **Feedback** — Example: 'Feedback Great service!'"
            )

    except Exception:
        traceback.print_exc()
        reply.append("⚠️ Something went wrong. Please try again.")

    finally:
        cursor.close()
        db.close()

    return {"reply": "\n".join(reply)}



