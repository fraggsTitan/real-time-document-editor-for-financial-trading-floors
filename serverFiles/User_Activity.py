from pymongo import MongoClient
from datetime import datetime

client = MongoClient("mongodb://localhost:27017/")
db = client["doc_editor"]
user_activity_col = db["user_activity"]

def log_user_login(user_id, email):
    """Log user login timestamp"""
    user_activity_col.insert_one({
        "user_id": user_id,
        "email": email,
        "action": "login",
        "timestamp": datetime.now()
    })

def log_user_logout(user_id):
    """Log user logout timestamp"""
    user_activity_col.insert_one({
        "user_id": user_id,
        "action": "logout", 
        "timestamp": datetime.now()
    })

def get_user_activity(user_id):
    """Get user's recent activity"""
    return list(user_activity_col.find(
        {"user_id": user_id}).sort("timestamp", -1).limit(10)
    )