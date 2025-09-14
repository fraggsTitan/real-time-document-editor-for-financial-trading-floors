from flask import Flask, render_template, request, jsonify
import os

app = Flask(__name__)

# File path for saved document
SAVE_DIR = os.path.join(app.root_path, "serverFiles")

# Ensure server directory exists
os.makedirs(SAVE_DIR, exist_ok=True)

# ----------------- Routes -----------------

# Serve editor page
@app.route("/")
def index():
    return render_template("index.html")  # your editor HTML


# this recursively lists all files directories and sub dirs and their contents
@app.route("/directories", methods=["GET"])
def get_dirs():
    def build_tree(path):
        items = []
        try:
            for entry in os.listdir(path):
                full_path = os.path.join(path, entry)
                rel_path = os.path.relpath(full_path, SAVE_DIR)  # relative to SAVE_DIR
                if os.path.isfile(full_path):
                    items.append({
                        "name": entry,
                        "type": "file",
                        "path": rel_path
                    })
                elif os.path.isdir(full_path):
                    items.append({
                        "name": entry,
                        "type": "dir",
                        "path": rel_path,
                        "children": build_tree(full_path)
                    })
        except PermissionError:
            pass
        return items

    try:
        tree = build_tree(SAVE_DIR)
        return jsonify({"status": "ok", "files": tree})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/file-info")
def file_info():
    rel_path = request.args.get("path")
    if not rel_path:
        return jsonify({"status": "error", "message": "No file specified"}), 400

    # Construct absolute path safely inside SAVE_DIR
    abs_path = os.path.join(SAVE_DIR, rel_path)
    abs_path = os.path.abspath(abs_path)

    # Ensure the file is still inside SAVE_DIR (prevent path traversal)
    if not abs_path.startswith(os.path.abspath(SAVE_DIR)) or not os.path.isfile(abs_path):
        return jsonify({"status": "error", "message": "Invalid file path"}), 400

    try:
        with open(abs_path, "r", encoding="utf-8") as f:
            content = f.read()
        return jsonify({"status": "ok", "name": os.path.basename(abs_path), "content": content})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    
@app.route("/save-to-file", methods=["POST"])
def save_to_file():
    data = request.json
    text = data.get("content", "")
    file_path = data.get("path")  # Get the file path from request body
    
    if not file_path:
        return jsonify({"status": "error", "message": "No file path specified"}), 400
    
    # Construct absolute path safely inside SAVE_DIR
    abs_path = os.path.join(SAVE_DIR, file_path)
    abs_path = os.path.abspath(abs_path)
    
    # Security check - ensure we're not going outside SAVE_DIR
    if not abs_path.startswith(os.path.abspath(SAVE_DIR)):
        return jsonify({"status": "error", "message": "Invalid file path"}), 400
    
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        
        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(text)
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
# ----------------- Run -----------------
if __name__ == "__main__":
    app.run(debug=True)


