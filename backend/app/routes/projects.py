from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson.objectid import ObjectId
from app.extensions import projects_collection, users_collection

projects_bp = Blueprint('projects', __name__)

@projects_bp.route('/', methods=['POST', 'GET'])
@jwt_required()
def handle_projects():
    user_id = get_jwt_identity()
    
    if request.method == 'POST':
        data = request.get_json()
        new_project = {
            "name": data.get('name'),
            "description": data.get('description', ''),
            "owner_id": user_id,
            "members": [
                { "user_id": user_id, "role": "Admin", "status": "Joined" }
            ],
            "custom_roles": []
        }
        result = projects_collection.insert_one(new_project)
        return jsonify({"msg": "Project created", "project_id": str(result.inserted_id)}), 201
        
    if request.method == 'GET':
        # Find projects where user is owner or member
        user_projects = projects_collection.find({
            "$or": [
                {"owner_id": user_id},
                {"members.user_id": user_id}
            ]
        })
        
        projects_data = []
        for p in user_projects:
            member_roles = p.get('members', [])
            members_info = []
            
            for m in member_roles:
                m_user_id = m.get('user_id')
                try:
                    user_doc = users_collection.find_one({"_id": ObjectId(m_user_id)})
                    if user_doc:
                        members_info.append({
                            "user_id": m_user_id,
                            "username": user_doc.get('username'),
                            "role": m.get('role', 'Member'),
                            "status": m.get('status', 'Joined')
                        })
                except:
                    pass
                
            projects_data.append({
                "id": str(p['_id']),
                "name": p.get('name'),
                "description": p.get('description'),
                "owner_id": p.get('owner_id'),
                "members": members_info,
                "custom_roles": p.get('custom_roles', [])
            })
        return jsonify(projects_data), 200

@projects_bp.route('/<project_id>', methods=['DELETE'])
@jwt_required()
def delete_project(project_id):
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(project_id)
    except:
        return jsonify({"msg": "Invalid project ID"}), 400
        
    project = projects_collection.find_one({"_id": obj_id})
    if not project:
        return jsonify({"msg": "Project not found"}), 404
        
    # Check if Admin or owner
    is_admin = project.get('owner_id') == user_id
    if not is_admin:
        for m in project.get('members', []):
            if m.get('user_id') == user_id and m.get('role') == 'Admin':
                is_admin = True
                break
                
    if not is_admin:
        return jsonify({"msg": "Unauthorized"}), 403
        
    projects_collection.delete_one({"_id": obj_id})
    
    # Also delete associated tasks
    from app.extensions import tasks_collection
    tasks_collection.delete_many({"project_id": project_id})
    
    return jsonify({"msg": "Project deleted"})

@projects_bp.route('/<project_id>/members', methods=['POST'])
@jwt_required()
def add_member(project_id):
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(project_id)
    except:
        return jsonify({"msg": "Invalid project ID"}), 400
        
    project = projects_collection.find_one({"_id": obj_id})
    if not project:
        return jsonify({"msg": "Project not found"}), 404
        
    # Check if Admin or owner
    is_admin = project.get('owner_id') == user_id
    if not is_admin:
        for m in project.get('members', []):
            if m.get('user_id') == user_id and m.get('role') == 'Admin':
                is_admin = True
                break
                
    if not is_admin:
        return jsonify({"msg": "Unauthorized. Only admins can add members."}), 403
        
    data = request.get_json()
    add_username = data.get('username')
    role = data.get('role', 'Member')
    
    if not add_username:
        return jsonify({"msg": "username is required"}), 400
        
    user_to_add = users_collection.find_one({"username": add_username})
    if not user_to_add:
        return jsonify({"msg": f"User {add_username} not found"}), 404
        
    add_user_id_str = str(user_to_add['_id'])
    
    # Check if already a member
    for m in project.get('members', []):
        if m.get('user_id') == add_user_id_str:
            return jsonify({"msg": "User is already a member"}), 400
            
    projects_collection.update_one(
        {"_id": obj_id},
        {"$push": {"members": { "user_id": add_user_id_str, "role": role, "status": "Pending" }}}
    )
        
    return jsonify({"msg": f"User {add_username} invited to project with role {role}"}), 200

@projects_bp.route('/<project_id>/members/<member_id>/role', methods=['PUT'])
@jwt_required()
def edit_member_role(project_id, member_id):
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(project_id)
    except:
        return jsonify({"msg": "Invalid project ID"}), 400
        
    project = projects_collection.find_one({"_id": obj_id})
    if not project:
        return jsonify({"msg": "Project not found"}), 404
        
    is_admin = project.get('owner_id') == user_id
    if not is_admin:
        for m in project.get('members', []):
            if m.get('user_id') == user_id and m.get('role') == 'Admin':
                is_admin = True
                break
                
    if not is_admin:
        return jsonify({"msg": "Unauthorized"}), 403
        
    data = request.get_json()
    new_role = data.get('role')
    
    # We remove the old and push the new or update using $set and arrayFilters
    projects_collection.update_one(
        {"_id": obj_id, "members.user_id": member_id},
        {"$set": {"members.$.role": new_role}}
    )
    return jsonify({"msg": "Role updated"})

@projects_bp.route('/<project_id>/invite', methods=['PUT'])
@jwt_required()
def handle_invite(project_id):
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(project_id)
    except:
        return jsonify({"msg": "Invalid project ID"}), 400
        
    data = request.get_json()
    action = data.get('action') # "accept" or "decline"
    
    if action == 'accept':
        projects_collection.update_one(
            {"_id": obj_id, "members.user_id": user_id},
            {"$set": {"members.$.status": "Joined"}}
        )
        return jsonify({"msg": "Invite accepted"})
    else:
        projects_collection.update_one(
            {"_id": obj_id},
            {"$pull": {"members": {"user_id": user_id}}}
        )
        return jsonify({"msg": "Invite declined"})

@projects_bp.route('/<project_id>/leave', methods=['POST'])
@jwt_required()
def leave_project(project_id):
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(project_id)
    except:
        return jsonify({"msg": "Invalid project ID"}), 400
        
    project = projects_collection.find_one({"_id": obj_id})
    if not project:
        return jsonify({"msg": "Project not found"}), 404
        
    if project.get('owner_id') == user_id:
        return jsonify({"msg": "Owner cannot leave the project. Delete it instead."}), 400
        
    projects_collection.update_one(
        {"_id": obj_id},
        {"$pull": {"members": {"user_id": user_id}}}
    )
    return jsonify({"msg": "Successfully left the project"})

@projects_bp.route('/<project_id>/roles', methods=['POST'])
@jwt_required()
def create_custom_role(project_id):
    import uuid
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(project_id)
    except:
        return jsonify({"msg": "Invalid project ID"}), 400
        
    project = projects_collection.find_one({"_id": obj_id})
    if not project:
        return jsonify({"msg": "Project not found"}), 404
        
    is_admin = project.get('owner_id') == user_id
    if not is_admin:
        for m in project.get('members', []):
            if m.get('user_id') == user_id and m.get('role') == 'Admin':
                is_admin = True
                break
    if not is_admin:
        return jsonify({"msg": "Unauthorized"}), 403
        
    data = request.get_json()
    name = data.get('name')
    color = data.get('color', '#3B82F6') # default brand-default
    task_id = data.get('task_id')
    
    if not name or not task_id:
        return jsonify({"msg": "Role name and root task ID are required"}), 400
        
    new_role = {
        "id": str(uuid.uuid4()),
        "name": name,
        "color": color,
        "task_id": task_id
    }
    
    projects_collection.update_one(
        {"_id": obj_id},
        {"$push": {"custom_roles": new_role}}
    )
    return jsonify({"msg": "Custom role created", "role": new_role})

@projects_bp.route('/<project_id>/roles/<role_id>', methods=['DELETE'])
@jwt_required()
def delete_custom_role(project_id, role_id):
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(project_id)
    except:
        return jsonify({"msg": "Invalid project ID"}), 400
        
    project = projects_collection.find_one({"_id": obj_id})
    if not project:
        return jsonify({"msg": "Project not found"}), 404
        
    is_admin = project.get('owner_id') == user_id
    if not is_admin:
        for m in project.get('members', []):
            if m.get('user_id') == user_id and m.get('role') == 'Admin':
                is_admin = True
                break
    if not is_admin:
        return jsonify({"msg": "Unauthorized"}), 403
        
    # Optional: Revert members to 'Viewer' if they had this role
    role_to_delete = next((r for r in project.get('custom_roles', []) if r.get('id') == role_id), None)
    if role_to_delete:
         projects_collection.update_many(
             {"_id": obj_id, "members.role": role_to_delete.get('name')},
             {"$set": {"members.$[elem].role": "Viewer"}},
             array_filters=[{"elem.role": role_to_delete.get('name')}]
         )

    projects_collection.update_one(
        {"_id": obj_id},
        {"$pull": {"custom_roles": {"id": role_id}}}
    )
    return jsonify({"msg": "Custom role deleted"})

