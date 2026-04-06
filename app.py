from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
import datetime
import os

app = Flask(__name__)

if os.environ.get('VERCEL') == '1':
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////tmp/collabtask.db'
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///collabtask.db'
    
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = 'super-secret-collabtask-key' 
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = datetime.timedelta(days=1)

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)
CORS(app) # Essential for frontend communication

shared_tasks = db.Table('shared_tasks',
    db.Column('task_id', db.Integer, db.ForeignKey('task.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True)
)

group_members = db.Table('group_members',
    db.Column('group_id', db.Integer, db.ForeignKey('group.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True)
)

group_tasks = db.Table('group_tasks',
    db.Column('group_id', db.Integer, db.ForeignKey('group.id'), primary_key=True),
    db.Column('task_id', db.Integer, db.ForeignKey('task.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    
    tasks = db.relationship('Task', backref='owner', lazy=True)
    owned_groups = db.relationship('Group', backref='owner', lazy=True)
    
    shared_tasks = db.relationship('Task', secondary=shared_tasks, lazy='subquery',
        backref=db.backref('shared_with', lazy=True))
    groups = db.relationship('Group', secondary=group_members, lazy='subquery',
        backref=db.backref('members', lazy=True))

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    due_date = db.Column(db.String(20), nullable=True) 
    priority = db.Column(db.String(20), default='Medium')
    image_url = db.Column(db.String(255), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    tasks = db.relationship('Task', secondary=group_tasks, lazy='subquery',
        backref=db.backref('group_shares', lazy=True))

with app.app_context():
    db.create_all()



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
    
    if User.query.filter_by(username=username).first():
        return jsonify({"msg": "Username already exists"}), 400
        
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(username=username, password_hash=hashed_password)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"msg": "User created successfully"}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    if user and bcrypt.check_password_hash(user.password_hash, password):
        access_token = create_access_token(identity=str(user.id)) 
        return jsonify(access_token=access_token, user_id=user.id, username=user.username), 200
        
    return jsonify({"msg": "Invalid username or password"}), 401

@app.route('/users', methods=['GET'])
@jwt_required()
def get_users():
    users = User.query.all()
    return jsonify([{"id": u.id, "username": u.username} for u in users]), 200


@app.route('/tasks', methods=['POST'])
@jwt_required()
def create_task():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    new_task = Task(
        title=data.get('title'),
        description=data.get('description'),
        due_date=data.get('due_date'),
        priority=data.get('priority', 'Medium'),
        image_url=data.get('image_url'),
        owner_id=user_id
    )
    db.session.add(new_task)
    db.session.commit()
    return jsonify({"msg": "Task created successfully", "task_id": new_task.id}), 201

@app.route('/tasks', methods=['GET'])
@jwt_required()
def get_tasks():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    
    owned_tasks = Task.query.filter_by(owner_id=user_id).all()
    shared = user.shared_tasks
    
    group_shared_tasks = []
    for g in user.groups + user.owned_groups:
        group_shared_tasks.extend(g.tasks)
    
    all_tasks = owned_tasks + shared + group_shared_tasks
    all_tasks = list({t.id: t for t in all_tasks}.values())
    
    tasks_data = []
    for t in all_tasks:
        tasks_data.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "due_date": t.due_date,
            "priority": t.priority,
            "image_url": t.image_url,
            "is_owner": t.owner_id == user_id,
            "owner_id": t.owner_id
        })
        
    return jsonify(tasks_data), 200

@app.route('/tasks/<int:task_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def update_delete_task(task_id):
    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    
    if task.owner_id != user_id:
        return jsonify({"msg": "Unauthorized"}), 403
        
    if request.method == 'DELETE':
        db.session.delete(task)
        db.session.commit()
        return jsonify({"msg": "Task deleted"})
        
    if request.method == 'PUT':
        data = request.get_json()
        task.title = data.get('title', task.title)
        task.description = data.get('description', task.description)
        task.due_date = data.get('due_date', task.due_date)
        task.priority = data.get('priority', task.priority)
        task.image_url = data.get('image_url', task.image_url)
        db.session.commit()
        return jsonify({"msg": "Task updated"})


@app.route('/tasks/<int:task_id>/share', methods=['POST'])
@jwt_required()
def share_task(task_id):
    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    
    if task.owner_id != user_id:
        return jsonify({"msg": "Unauthorized. Only owner can share."}), 403
        
    data = request.get_json()
    share_with_username = data.get('username')
    
    if not share_with_username:
        return jsonify({"msg": "username is required"}), 400
        
    user_to_share = User.query.filter_by(username=share_with_username).first()
    if not user_to_share:
        return jsonify({"msg": f"User {share_with_username} not found"}), 404
        
    if task not in user_to_share.shared_tasks:
        user_to_share.shared_tasks.append(task)
        db.session.commit()
        
    return jsonify({"msg": f"Task shared with user {user_to_share.username} successfully"}), 200

@app.route('/tasks/<int:task_id>/share_group', methods=['POST'])
@jwt_required()
def share_to_group(task_id):
    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    
    if task.owner_id != user_id:
        return jsonify({"msg": "Unauthorized. Only owner can share."}), 403
        
    data = request.get_json()
    group_id = data.get('group_id')
    
    group = Group.query.get(group_id)
    if not group:
        return jsonify({"msg": "Group not found"}), 404
        
    if task not in group.tasks:
        group.tasks.append(task)
        db.session.commit()
        
    return jsonify({"msg": f"Task shared to group {group.name} successfully"}), 200

@app.route('/groups', methods=['POST', 'GET'])
@jwt_required()
def handle_groups():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    
    if request.method == 'POST':
        data = request.get_json()
        new_group = Group(name=data.get('name'), owner_id=user_id)
        db.session.add(new_group)
        new_group.members.append(user)
        db.session.commit()
        return jsonify({"msg": "Group created", "group_id": new_group.id}), 201
        
    if request.method == 'GET':
        owned_groups = Group.query.filter_by(owner_id=user_id).all()
        member_groups = user.groups
        
        all_groups = owned_groups + member_groups
        all_groups = list({g.id: g for g in all_groups}.values())
        
        groups_data = []
        for g in all_groups:
            members = [{"id": m.id, "username": m.username} for m in g.members]
            groups_data.append({
                "id": g.id,
                "name": g.name,
                "owner_id": g.owner_id,
                "members": members
            })
        return jsonify(groups_data), 200

@app.route('/groups/<int:group_id>/add_user', methods=['POST'])
@jwt_required()
def add_to_group(group_id):
    user_id = int(get_jwt_identity())
    group = Group.query.get_or_404(group_id)
    
    if group.owner_id != user_id:
        return jsonify({"msg": "Unauthorized. Only the group owner can add members."}), 403
        
    data = request.get_json()
    add_username = data.get('username')
    
    if not add_username:
        return jsonify({"msg": "username is required"}), 400
        
    user_to_add = User.query.filter_by(username=add_username).first()
    if not user_to_add:
        return jsonify({"msg": f"User {add_username} not found"}), 404
        
    if user_to_add not in group.members:
        group.members.append(user_to_add)
        db.session.commit()
        
    return jsonify({"msg": f"User {user_to_add.username} added to group"}), 200

if __name__ == '__main__':
    app.run(debug=True)
