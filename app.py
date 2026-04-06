from flask import Flask, request, jsonify, send_from_directory
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from pymongo import MongoClient
from bson.objectid import ObjectId
import datetime
import os

app = Flask(__name__)

app.config['JWT_SECRET_KEY'] = 'super-secret-collabtask-key' 
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = datetime.timedelta(days=1)

bcrypt = Bcrypt(app)
jwt = JWTManager(app)
CORS(app) # Essential for frontend communication

# Connect to MongoDB
MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://127.0.0.1:27017/')
client = MongoClient(MONGO_URI)
db = client.get_database('collabtask')

# Collections
users_collection = db.users
tasks_collection = db.tasks
groups_collection = db.groups


@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if users_collection.find_one({"username": username}):
        return jsonify({"msg": "Username already exists"}), 400
        
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = {
        "username": username,
        "password_hash": hashed_password
    }
    users_collection.insert_one(new_user)
    return jsonify({"msg": "User created successfully"}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = users_collection.find_one({"username": username})
    if user and bcrypt.check_password_hash(user['password_hash'], password):
        user_id_str = str(user['_id'])
        access_token = create_access_token(identity=user_id_str) 
        return jsonify(access_token=access_token, user_id=user_id_str, username=user['username']), 200
        
    return jsonify({"msg": "Invalid username or password"}), 401

@app.route('/users', methods=['GET'])
@jwt_required()
def get_users():
    users = users_collection.find()
    return jsonify([{"id": str(u['_id']), "username": u['username']} for u in users]), 200


@app.route('/tasks', methods=['POST'])
@jwt_required()
def create_task():
    user_id = get_jwt_identity() # This is a string representation of the ObjectID
    data = request.get_json()
    
    new_task = {
        "title": data.get('title'),
        "description": data.get('description'),
        "due_date": data.get('due_date'),
        "priority": data.get('priority', 'Medium'),
        "image_url": data.get('image_url'),
        "owner_id": user_id,
        "shared_with": [],      # List of user_id strings
        "shared_groups": []     # List of group_id strings
    }
    result = tasks_collection.insert_one(new_task)
    return jsonify({"msg": "Task created successfully", "task_id": str(result.inserted_id)}), 201

@app.route('/tasks', methods=['GET'])
@jwt_required()
def get_tasks():
    user_id = get_jwt_identity() # String
    
    # 1. Find all groups the user is a member of or owns
    user_groups = groups_collection.find({
        "$or": [
            {"owner_id": user_id},
            {"members": user_id}
        ]
    })
    group_ids = [str(g['_id']) for g in user_groups]
    
    # 2. Find tasks based on ownership or sharing
    query = {
        "$or": [
            {"owner_id": user_id},
            {"shared_with": user_id},
            {"shared_groups": {"$in": group_ids}}
        ]
    }
    
    user_tasks = tasks_collection.find(query)
    
    tasks_data = []
    for t in user_tasks:
        tasks_data.append({
            "id": str(t['_id']),
            "title": t.get('title'),
            "description": t.get('description'),
            "due_date": t.get('due_date'),
            "priority": t.get('priority'),
            "image_url": t.get('image_url'),
            "is_owner": t.get('owner_id') == user_id,
            "owner_id": t.get('owner_id')
        })
        
    return jsonify(tasks_data), 200

@app.route('/tasks/<task_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def update_delete_task(task_id):
    user_id = get_jwt_identity()
    
    try:
        obj_id = ObjectId(task_id)
    except:
        return jsonify({"msg": "Invalid task ID"}), 400
        
    task = tasks_collection.find_one({"_id": obj_id})
    if not task:
        return jsonify({"msg": "Task not found"}), 404
        
    if task.get('owner_id') != user_id:
        return jsonify({"msg": "Unauthorized"}), 403
        
    if request.method == 'DELETE':
        tasks_collection.delete_one({"_id": obj_id})
        return jsonify({"msg": "Task deleted"})
        
    if request.method == 'PUT':
        data = request.get_json()
        update_fields = {}
        if 'title' in data: update_fields['title'] = data['title']
        if 'description' in data: update_fields['description'] = data['description']
        if 'due_date' in data: update_fields['due_date'] = data['due_date']
        if 'priority' in data: update_fields['priority'] = data['priority']
        if 'image_url' in data: update_fields['image_url'] = data['image_url']
        
        if update_fields:
            tasks_collection.update_one({"_id": obj_id}, {"$set": update_fields})
            
        return jsonify({"msg": "Task updated"})


@app.route('/tasks/<task_id>/share', methods=['POST'])
@jwt_required()
def share_task(task_id):
    user_id = get_jwt_identity()
    
    try:
        obj_id = ObjectId(task_id)
    except:
        return jsonify({"msg": "Invalid task ID"}), 400
        
    task = tasks_collection.find_one({"_id": obj_id})
    if not task:
        return jsonify({"msg": "Task not found"}), 404
        
    if task.get('owner_id') != user_id:
        return jsonify({"msg": "Unauthorized. Only owner can share."}), 403
        
    data = request.get_json()
    share_with_username = data.get('username')
    
    if not share_with_username:
        return jsonify({"msg": "username is required"}), 400
        
    user_to_share = users_collection.find_one({"username": share_with_username})
    if not user_to_share:
        return jsonify({"msg": f"User {share_with_username} not found"}), 404
        
    share_user_id_str = str(user_to_share['_id'])
    
    # Add to shared_with array if not already there
    tasks_collection.update_one(
        {"_id": obj_id},
        {"$addToSet": {"shared_with": share_user_id_str}}
    )
    
    return jsonify({"msg": f"Task shared with user {share_with_username} successfully"}), 200

@app.route('/tasks/<task_id>/share_group', methods=['POST'])
@jwt_required()
def share_to_group(task_id):
    user_id = get_jwt_identity()
    
    try:
        obj_id = ObjectId(task_id)
    except:
        return jsonify({"msg": "Invalid task ID"}), 400
        
    task = tasks_collection.find_one({"_id": obj_id})
    if not task:
        return jsonify({"msg": "Task not found"}), 404
        
    if task.get('owner_id') != user_id:
        return jsonify({"msg": "Unauthorized. Only owner can share."}), 403
        
    data = request.get_json()
    group_id_str = data.get('group_id')
    
    try:
        group_obj_id = ObjectId(group_id_str)
    except:
        return jsonify({"msg": "Invalid group ID"}), 400
    
    group = groups_collection.find_one({"_id": group_obj_id})
    if not group:
        return jsonify({"msg": "Group not found"}), 404
        
    # Add group id to shared_groups array
    tasks_collection.update_one(
        {"_id": obj_id},
        {"$addToSet": {"shared_groups": group_id_str}}
    )
        
    return jsonify({"msg": f"Task shared to group {group.get('name')} successfully"}), 200

@app.route('/groups', methods=['POST', 'GET'])
@jwt_required()
def handle_groups():
    user_id = get_jwt_identity()
    
    if request.method == 'POST':
        data = request.get_json()
        new_group = {
            "name": data.get('name'),
            "owner_id": user_id,
            "members": [user_id] # Owner is added as member automatically
        }
        result = groups_collection.insert_one(new_group)
        return jsonify({"msg": "Group created", "group_id": str(result.inserted_id)}), 201
        
    if request.method == 'GET':
        # Find groups where user is owner or member
        user_groups = groups_collection.find({
            "$or": [
                {"owner_id": user_id},
                {"members": user_id}
            ]
        })
        
        groups_data = []
        for g in user_groups:
            # Fetch member usernames for the frontend
            member_ids = g.get('members', [])
            members_info = []
            
            # Fetch all members in one query
            member_obj_ids = []
            for mid in member_ids:
                try:
                    member_obj_ids.append(ObjectId(mid))
                except:
                    pass # Not an ObjectId
            
            # Fetch members matching either the ObjectId or the fallback string (for older SQLite-style IDs)
            members = users_collection.find({
                "$or": [
                    {"_id": {"$in": member_obj_ids}},
                    {"_id": {"$in": member_ids}} 
                ]
            })
            for m in members:
                members_info.append({"id": str(m['_id']), "username": m.get('username')})
                
            groups_data.append({
                "id": str(g['_id']),
                "name": g.get('name'),
                "owner_id": g.get('owner_id'),
                "members": members_info
            })
        return jsonify(groups_data), 200

@app.route('/groups/<group_id>/add_user', methods=['POST'])
@jwt_required()
def add_to_group(group_id):
    user_id = get_jwt_identity()
    
    try:
        obj_id = ObjectId(group_id)
    except:
        return jsonify({"msg": "Invalid group ID"}), 400
        
    group = groups_collection.find_one({"_id": obj_id})
    if not group:
        return jsonify({"msg": "Group not found"}), 404
        
    if group.get('owner_id') != user_id:
        return jsonify({"msg": "Unauthorized. Only the group owner can add members."}), 403
        
    data = request.get_json()
    add_username = data.get('username')
    
    if not add_username:
        return jsonify({"msg": "username is required"}), 400
        
    user_to_add = users_collection.find_one({"username": add_username})
    if not user_to_add:
        return jsonify({"msg": f"User {add_username} not found"}), 404
        
    add_user_id_str = str(user_to_add['_id'])
    
    groups_collection.update_one(
        {"_id": obj_id},
        {"$addToSet": {"members": add_user_id_str}}
    )
        
    return jsonify({"msg": f"User {add_username} added to group"}), 200

if __name__ == '__main__':
    app.run(debug=True)
