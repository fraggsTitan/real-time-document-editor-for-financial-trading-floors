from pymongo import MongoClient
from datetime import datetime

client = MongoClient("mongodb://localhost:27017/")
db = client["doc_editor"]
recent_files_col = db["recent_files"]

def add_recent_file(user_id, file_path, file_name):
    """Add or update recent file for user (keeps only last 5)"""
    recent_files_col.update_one(
        {"user_id": user_id},
        {
            "$push": {
                "files": {
                    "$each": [{"path": file_path, "name": file_name, "accessed_at": datetime.now()}],
                    "$sort": {"accessed_at": -1},
                    "$slice": 5
                }
            }
        },
        upsert=True
    )

def get_recent_files(user_id):
    """Get user's recent files"""
    result = recent_files_col.find_one({"user_id": user_id})
    return result["files"] if result else []