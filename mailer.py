from flask import Flask, request, jsonify
from flask_cors import CORS
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

EMAIL_ADDRESS = "sachikia7@gmail.com"
EMAIL_PASSWORD = "ppjwklzgaecmmrko"  # Replace with your Gmail App Password

app = Flask(__name__)
CORS(app)

@email_app.route("/send_message", methods=["POST"])
def send_message():
    data = request.json
    name = data.get("name")
    customer_email = data.get("email")
    message = data.get("message")

    # Create the email
    msg = MIMEMultipart()
    msg["From"] = EMAIL_ADDRESS          # your Gmail
    msg["To"] = EMAIL_ADDRESS            # where you receive the messages
    msg["Reply-To"] = customer_email     # customer email
    msg["Subject"] = f"New Contact Message from {name}"

    # Email body
    body = f"""
You received a new message from your website contact form:

Name: {name}
Email: {customer_email}

Message:
{message}
"""
    msg.attach(MIMEText(body, "plain"))

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        return jsonify({
            "success": True,
            "message": f"Message sent successfully! You can now check your inbox. Reply will go to {customer_email}"
        })
    except Exception as e:
        print("Email error:", e)
        return jsonify({"success": False, "message": "Failed to send email"}), 500

if __name__ == "__main__":
    email_app.run(host="0.0.0.0", port=5002, debug=True)

