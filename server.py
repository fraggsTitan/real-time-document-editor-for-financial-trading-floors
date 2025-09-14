from flask import Flask, render_template, request, jsonify
import os

app = Flask(__name__)

# File path for saved document
SAVE_DIR = os.path.join(app.root_path, "serverFiles")
SAVE_PATH = os.path.join(SAVE_DIR, "saved_doc.txt")

# Ensure server directory exists
os.makedirs(SAVE_DIR, exist_ok=True)

# ----------------- Routes -----------------

# Serve editor page
@app.route("/")
def index():
    return render_template("index.html")  # your editor HTML

# Save document
@app.route("/save", methods=["POST"])
def save():
    data = request.json
    text = data.get("content", "")

    try:
        with open(SAVE_PATH, "w", encoding="utf-8") as f:
            f.write(text)
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Load document
@app.route("/load", methods=["GET"])
def load():
    if os.path.exists(SAVE_PATH):
        try:
            with open(SAVE_PATH, "r", encoding="utf-8") as f:
                text = f.read()
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    else:
        text = ""
    return jsonify({"status": "ok", "text": text})
# this recursively lists all files directories and sub dirs and their contents
@app.route("/directories", methods=["GET"])
def get_dirs():
    def build_tree(path):
        items = []
        try:
            for entry in os.listdir(path):
                full_path = os.path.join(path, entry)
                if os.path.isfile(full_path):
                    items.append({"name": entry, "type": "file"})
                elif os.path.isdir(full_path):
                    items.append({
                        "name": entry,
                        "type": "dir",
                        "children": build_tree(full_path)  # recursive
                    })
        except PermissionError:
            pass  # skip folders you cannot access
        return items

    try:
        tree = build_tree(SAVE_DIR)
        return jsonify({"status": "ok", "files": tree})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    
# ----------------- Run -----------------
if __name__ == "__main__":
    app.run(debug=True)


