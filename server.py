from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
import os, shutil, uuid
from bson import ObjectId

app = Flask(__name__)
app.secret_key = "super-secret-key"  # change in production

# ---------------- MongoDB ----------------
client = MongoClient("mongodb://localhost:27017/")
db = client["doc_editor"]
companies_col = db["companies"]
users_col = db["users"]

# ---------------- Base directory ----------------
BASE_DIR = os.path.join(app.root_path, "companyFiles")
os.makedirs(BASE_DIR, exist_ok=True)

# ----------------- Helpers -----------------

def get_base_dir():
    """Returns the base directory accessible to the user."""
    role = session.get("role")
    if role == "admin":
        return BASE_DIR  # Admin can see all company folders
    company_id = session.get("company_id")
    if not company_id:
        return None
    return os.path.join(BASE_DIR, company_id)

def is_path_allowed(abs_path):
    """Check if path is within the allowed directory."""
    base_dir = get_base_dir()
    if not base_dir:
        return False
    return abs_path.startswith(os.path.abspath(base_dir))

def build_tree(path, parent_rel=""):
    items = []
    try:
        for entry in os.listdir(path):
            full_path = os.path.join(path, entry)
            rel_path = os.path.join(parent_rel, entry)
            if os.path.isfile(full_path):
                items.append({"name": entry, "type": "file", "path": rel_path})
            elif os.path.isdir(full_path):
                items.append({
                    "name": entry,
                    "type": "dir",
                    "path": rel_path,
                    "children": build_tree(full_path, rel_path)
                })
    except PermissionError:
        pass
    return items

# ----------------- Routes -----------------

@app.route("/")
def index():
    if "user_id" in session:
        return render_template("index.html")
    return redirect(url_for("login_page"))

@app.route("/login", methods=["GET"])
def login_page():
    return render_template("login.html")

# ---------- Logout ----------
@app.route("/logout")
def logout():
    session.clear()  # remove all session data
    return redirect(url_for("login_page"))
# ---------- Company Sign-Up ----------
@app.route("/signup/company", methods=["POST"])
def company_signup():
    data = request.json
    name = data.get("company_name")
    password = str(uuid.uuid4())[:8]  # generate random company password

    if not name:
        return jsonify({"status": "error", "message": "Company name required"}), 400

    if companies_col.find_one({"name": name}):
        return jsonify({"status": "error", "message": "Company already exists"}), 400

    password_hash = generate_password_hash(password)
    company_id = companies_col.insert_one({
        "name": name,
        "password_hash": password_hash
    }).inserted_id

    # Create admin user for company
    users_col.insert_one({
        "name": name + " Admin",
        "email": f"{name.lower().replace(' ','')}_admin@example.com",
        "password_hash": password_hash,
        "company_id": company_id,
        "role": "admin"
    })

    # Create company directory
    company_dir = os.path.join(BASE_DIR, str(company_id))
    os.makedirs(company_dir, exist_ok=True)

    return jsonify({"status": "ok", "company_password": password})

# ---------- Employee Sign-Up ----------
@app.route("/signup/employee", methods=["POST"])
def employee_signup():
    data = request.json
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    company_password = data.get("company_password")

    if not all([name, email, password, company_password]):
        return jsonify({"status": "error", "message": "All fields required"}), 400

    # Find any company that matches the password
    for comp in companies_col.find():
        if check_password_hash(comp["password_hash"], company_password):
            company = comp
            break
    else:
        return jsonify({"status": "error", "message": "Invalid company password"}), 400

    if users_col.find_one({"email": email}):
        return jsonify({"status": "error", "message": "Email already registered"}), 400

    password_hash = generate_password_hash(password)
    users_col.insert_one({
        "name": name,
        "email": email,
        "password_hash": password_hash,
        "company_id": company["_id"],
        "role": "employee"
    })

    return jsonify({"status": "ok", "message": f"{name} registered under {company['name']}"})

# ---------- Login ----------
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    if not all([email, password]):
        return jsonify({"status": "error", "message": "Email and password required"}), 400

    user = users_col.find_one({"email": email})
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"status": "error", "message": "Invalid credentials"}), 400

    session["user_id"] = str(user["_id"])
    session["company_id"] = str(user["company_id"])
    session["role"] = user["role"]

    return jsonify({"status": "ok", "message": "Logged in", "role": user["role"]})

# ---------- Directory Listing ----------
@app.route("/directories", methods=["GET"])
def get_dirs():
    base_dir = get_base_dir()
    if not base_dir:
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    # Admin: list all companies with names
    if session.get("role") == "admin":
        tree = []

        # Include files in root
        root_files = build_tree(BASE_DIR, "")
        for item in root_files:
            # skip company folders (they will be added separately)
            if item["type"] == "dir" and ObjectId.is_valid(item["name"]):
                continue
            tree.append(item)

        # Then include all company folders
        for company_id in os.listdir(BASE_DIR):
            company_path = os.path.join(BASE_DIR, company_id)
            if os.path.isdir(company_path) and ObjectId.is_valid(company_id):
                try:
                    company_obj = companies_col.find_one({"_id": ObjectId(company_id)})
                    display_name = company_obj["name"] if company_obj else company_id
                except:
                    display_name = company_id
                tree.append({
                    "name": display_name,
                    "type": "dir",
                    "path": company_id,
                    "children": build_tree(company_path, company_id)
                })

        return jsonify({"status": "ok", "files": tree})

    # Employee: only their company
    return jsonify({"status": "ok", "files": build_tree(base_dir)})

# ---------- File Info ----------
@app.route("/file-info")
def file_info():
    rel_path = request.args.get("path")
    print(session)
    if not rel_path:
        return jsonify({"status": "error", "message": "No file specified"}), 400

    base_dir = get_base_dir()
    if not base_dir:
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    abs_path = os.path.abspath(os.path.join(base_dir, rel_path))
    if not os.path.isfile(abs_path) or not is_path_allowed(abs_path):
        return jsonify({"status": "error", "message": "Invalid file path"}), 400

    with open(abs_path, "r", encoding="utf-8") as f:
        content = f.read()
    return jsonify({"status": "ok", "name": os.path.basename(abs_path), "content": content})

# ---------- Save File ----------
@app.route("/save-to-file", methods=["POST"])
def save_to_file():
    data = request.json
    text = data.get("content", "")
    rel_path = data.get("path")
    if not rel_path:
        return jsonify({"status": "error", "message": "No file path specified"}), 400

    base_dir = get_base_dir()
    abs_path = os.path.abspath(os.path.join(base_dir, rel_path))

    print("Base dir:", base_dir)
    print("Rel path:", rel_path)
    print("Abs path:", abs_path)
    if not is_path_allowed(abs_path):
        return jsonify({"status": "error", "message": "Invalid path"}), 400

    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "w", encoding="utf-8") as f:
        f.write(text)
    return jsonify({"status": "ok"})

# ---------- Create File ----------
@app.route("/create-file", methods=["POST"])
def create_file():
    data = request.json
    rel_path = data.get("path")
    if not rel_path:
        return jsonify({"status": "error", "message": "No file path specified"}), 400

    base_dir = get_base_dir()
    abs_path = os.path.abspath(os.path.join(base_dir, rel_path))
    if not is_path_allowed(abs_path):
        return jsonify({"status": "error", "message": "Invalid path"}), 400

    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    open(abs_path, "w", encoding="utf-8").close()
    return jsonify({"status": "ok", "message": f"File '{rel_path}' created"})

# ---------- Create Directory ----------
@app.route("/create-directory", methods=["POST"])
def create_directory():
    data = request.json
    rel_path = data.get("path")
    if not rel_path:
        return jsonify({"status": "error", "message": "No directory path specified"}), 400

    base_dir = get_base_dir()
    abs_path = os.path.abspath(os.path.join(base_dir, rel_path))
    if not is_path_allowed(abs_path):
        return jsonify({"status": "error", "message": "Invalid path"}), 400

    os.makedirs(abs_path, exist_ok=True)
    return jsonify({"status": "ok", "message": f"Directory '{rel_path}' created"})

# ---------- Delete File/Directory ----------
@app.route("/delete", methods=["POST"])
def delete_file_or_dir():
    data = request.json
    rel_path = data.get("path")
    base_dir = get_base_dir()
    abs_path = os.path.abspath(os.path.join(base_dir, rel_path))
    if not is_path_allowed(abs_path):
        return jsonify({"status": "error", "message": "Invalid path"}), 400

    if os.path.isfile(abs_path):
        os.remove(abs_path)
    elif os.path.isdir(abs_path):
        shutil.rmtree(abs_path)
    return jsonify({"status": "ok"})

# ---------- Move File/Directory ----------
@app.route("/move", methods=["POST"])
def move_file_or_dir():
    data = request.json
    rel_path = data.get("path")
    new_dir_rel = data.get("newDir")
    base_dir = get_base_dir()

    abs_path = os.path.abspath(os.path.join(base_dir, rel_path))
    new_abs_dir = os.path.abspath(os.path.join(base_dir, new_dir_rel))

    if not (is_path_allowed(abs_path) and is_path_allowed(new_abs_dir)):
        return jsonify({"status": "error", "message": "Invalid path"}), 400

    os.makedirs(new_abs_dir, exist_ok=True)
    shutil.move(abs_path, os.path.join(new_abs_dir, os.path.basename(rel_path)))
    return jsonify({"status": "ok"})

# ----------------- Run App -----------------
if __name__ == "__main__":
    app.run(debug=True)
