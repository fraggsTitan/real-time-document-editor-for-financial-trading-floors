from flask import Flask, render_template, request, jsonify
import os

app = Flask(__name__)

# Serve the editor page
@app.route("/")
def index():
    return render_template("index.html")  # serves the editor page

# Save endpoint
@app.route("/save", methods=["POST"])
def save():
    data = request.json
    text = data.get("content", "")  # matches the key sent from editor.js
    with open("saved_doc.txt", "w", encoding="utf-8") as f:
        f.write(text)
    return jsonify({"status": "ok"})

# Load endpoint
@app.route("/load", methods=["GET"])
def load():
    if os.path.exists("saved_doc.txt"):
        with open("saved_doc.txt", "r", encoding="utf-8") as f:
            text = f.read()
    else:
        text = ""
    return jsonify({"text": text})

if __name__ == "__main__":
    app.run(debug=True)
