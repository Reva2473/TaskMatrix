from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson.objectid import ObjectId
from app.extensions import tasks_collection, projects_collection, users_collection
import datetime

tasks_bp = Blueprint('tasks', __name__)

@tasks_bp.route('/', methods=['POST'])
@jwt_required()
def create_task():
    user_id = get_jwt_identity()
    data = request.get_json()
    
    project_id = data.get('project_id')
    if not project_id:
        return jsonify({"msg": "Project ID is required"}), 400
        
    try:
        project_obj = ObjectId(project_id)
        # Verify access
        project = projects_collection.find_one({"_id": project_obj})
        if not project:
            return jsonify({"msg": "Project not found"}), 404
            
        allowed = False
        user_role = 'Viewer'
        if project.get('owner_id') == user_id:
            allowed = True
            user_role = 'Admin'
        else:
            for m in project.get('members', []):
                if m.get('user_id') == user_id:
                    allowed = True
                    user_role = m.get('role', 'Viewer')
                    break
        if not allowed or user_role == 'Viewer':
            return jsonify({"msg": "Viewers cannot create tasks"}), 403
            
    except:
        return jsonify({"msg": "Invalid Project ID"}), 400

    new_task = {
        "title": data.get('title'),
        "description": data.get('description'),
        "due_date": data.get('due_date'),
        "priority": data.get('priority', 'Medium'),
        "image_url": data.get('image_url'),
        "is_done": False,
        "created_at": datetime.datetime.utcnow().isoformat() + 'Z',
        "completed_at": None,
        "owner_id": user_id,
        "project_id": project_id,
        "parent_task_id": data.get('parent_task_id', None),
        "assignees": data.get('assignees', []),
        "remarks": []
    }
    result = tasks_collection.insert_one(new_task)
    return jsonify({"msg": "Task created", "task_id": str(result.inserted_id)}), 201

@tasks_bp.route('/project/<project_id>', methods=['GET'])
@jwt_required()
def get_tasks_for_project(project_id):
    user_id = get_jwt_identity()
    
    try:
        # Check permissions
        project = projects_collection.find_one({"_id": ObjectId(project_id)})
        if not project:
            return jsonify({"msg": "Project not found"}), 404
            
        allowed = project.get('owner_id') == user_id
        if not allowed:
            for m in project.get('members', []):
                if m.get('user_id') == user_id:
                    allowed = True
                    break
        if not allowed:
            return jsonify({"msg": "Not allowed"}), 403
            
    except:
        return jsonify({"msg": "Invalid Project ID"}), 400

    user_tasks = tasks_collection.find({"project_id": project_id})
    tasks_data = []
    
    for t in user_tasks:
        owner_username = "Unknown"
        owner_str = t.get('owner_id')
        if owner_str:
            try:
                owner = users_collection.find_one({"_id": ObjectId(owner_str)})
                if owner:
                    owner_username = owner.get('username')
            except:
                pass
                
        assignees_info = []
        for a_id in t.get('assignees', []):
            try:
                a_user = users_collection.find_one({"_id": ObjectId(a_id)})
                if a_user:
                    assignees_info.append({"user_id": a_id, "username": a_user.get('username')})
            except:
                 pass

        tasks_data.append({
            "id": str(t['_id']),
            "title": t.get('title'),
            "description": t.get('description'),
            "due_date": t.get('due_date'),
            "priority": t.get('priority'),
            "image_url": t.get('image_url'),
            "is_done": t.get('is_done', False),
            "created_at": t.get('created_at'),
            "completed_at": t.get('completed_at'),
            "owner_id": t.get('owner_id'),
            "owner_username": owner_username,
            "project_id": t.get('project_id'),
            "parent_task_id": t.get('parent_task_id'),
            "assignees": assignees_info,
            "remarks": t.get('remarks', [])
        })
        
    return jsonify(tasks_data), 200

@tasks_bp.route('/<task_id>', methods=['PUT', 'DELETE'])
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
        
    # Check user role in the project
    project = projects_collection.find_one({"_id": ObjectId(task.get('project_id'))})
    user_role = 'Viewer'
    if project:
        if project.get('owner_id') == user_id:
            user_role = 'Admin'
        else:
            for m in project.get('members', []):
                if m.get('user_id') == user_id:
                    user_role = m.get('role', 'Viewer')
                    break

    if request.method == 'DELETE':
        if user_role != 'Admin':
            return jsonify({"msg": "Only admins can delete tasks"}), 403
        tasks_collection.delete_one({"_id": obj_id})
        # Delete subtasks
        tasks_collection.delete_many({"parent_task_id": task_id})
        return jsonify({"msg": "Task deleted"})
        
    if request.method == 'PUT':
        data = request.get_json()
        # Members can only update is_done if they are assigned. Admins can update anything.
        if user_role == 'Viewer':
            return jsonify({"msg": "Viewers cannot edit tasks"}), 403

        if user_role == 'Member':
            # Check if they are trying to edit something other than is_done
            if any(k in data for k in ['title', 'description', 'due_date', 'priority', 'assignees']):
                return jsonify({"msg": "Members cannot edit task details"}), 403
            
            # They CAN toggle is_done, but ONLY if they are assigned
            if 'is_done' in data:
                is_assigned = user_id in task.get('assignees', [])
                if not is_assigned:
                    return jsonify({"msg": "Members can only mark assigned tasks as done"}), 403

        update_fields = {}
        if 'title' in data: update_fields['title'] = data['title']
        if 'description' in data: update_fields['description'] = data['description']
        if 'due_date' in data: update_fields['due_date'] = data['due_date']
        if 'priority' in data: update_fields['priority'] = data['priority']
        if 'is_done' in data: 
            update_fields['is_done'] = data['is_done']
            update_fields['completed_at'] = datetime.datetime.utcnow().isoformat() + 'Z' if data['is_done'] else None
        if 'assignees' in data: update_fields['assignees'] = data['assignees']
        
        if update_fields:
            tasks_collection.update_one({"_id": obj_id}, {"$set": update_fields})
            
        return jsonify({"msg": "Task updated"})

@tasks_bp.route('/<task_id>/remark', methods=['POST'])
@jwt_required()
def add_remark(task_id):
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(task_id)
    except:
        return jsonify({"msg": "Invalid task ID"}), 400
        
    task = tasks_collection.find_one({"_id": obj_id})
    if not task:
        return jsonify({"msg": "Task not found"}), 404
        
    project = projects_collection.find_one({"_id": ObjectId(task.get('project_id'))})
    user_role = 'Viewer'
    if project:
        if project.get('owner_id') == user_id:
            user_role = 'Admin'
        else:
            for m in project.get('members', []):
                if m.get('user_id') == user_id:
                    user_role = m.get('role', 'Viewer')
                    break

    if user_role == 'None': # Unreachable typically, but allows Viewers
        return jsonify({"msg": "Unauthorized"}), 403

    data = request.get_json()
    text = data.get('text')
    if not text:
         return jsonify({"msg": "Text is required"}), 400
         
    author = users_collection.find_one({"_id": ObjectId(user_id)})
    username = author.get('username') if author else 'Unknown'

    new_remark = {
        "user_id": user_id,
        "username": username,
        "text": text,
        "timestamp": datetime.datetime.utcnow().isoformat() + 'Z'
    }
    
    tasks_collection.update_one(
        {"_id": obj_id},
        {"$push": {"remarks": new_remark}}
    )
    
    return jsonify({"msg": "Remark added"}), 201
