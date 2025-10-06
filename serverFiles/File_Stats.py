from pymongo import MongoClient
import os

client = MongoClient("mongodb://localhost:27017/")
db = client["doc_editor"]
file_stats_col = db["file_stats"]

def update_file_stats(file_path, company_id):
    """Update word count and file stats"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            word_count = len(content.split())
            char_count = len(content)
            
        file_stats_col.update_one(
            {"file_path": file_path},
            {
                "$set": {
                    "word_count": word_count,
                    "char_count": char_count, 
                    "last_modified": datetime.now(),
                    "company_id": company_id
                }
            },
            upsert=True
        )
    except:
        pass

def get_file_stats(file_path):
    """Get statistics for a file"""
    return file_stats_col.find_one({"file_path": file_path})