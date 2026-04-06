const API_URL = window.location.hostname.includes('vercel.app') || window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:' ? '' : 'http://127.0.0.1:5000';

let token = localStorage.getItem('collabtask_token');
let currentUser = JSON.parse(localStorage.getItem('collabtask_user'));

const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleAuthBtn = document.getElementById('toggle-auth');
const authError = document.getElementById('auth-error');
const userGreeting = document.getElementById('user-greeting');
const logoutBtn = document.getElementById('logout-btn');

let isLogin = true;

function init() {
    if (token) {
        showDashboard();
    } else {
        showAuth();
    }
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    const res = await fetch(`${API_URL}${endpoint}`, config);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.msg || 'API Error');
    }
    return data;
}

function showAuth() {
    authView.classList.remove('hidden-pane');
    dashboardView.classList.add('hidden-pane');
    userGreeting.classList.add('hidden-pane');
    logoutBtn.classList.add('hidden-pane');
}

function showDashboard() {
    authView.classList.add('hidden-pane');
    dashboardView.classList.remove('hidden-pane');
    userGreeting.classList.remove('hidden-pane');
    logoutBtn.classList.remove('hidden-pane');
    
    if (currentUser) {
        userGreeting.innerHTML = `Welcome, <span class="text-indigo-400 font-bold">${currentUser.username}</span>`;
    }
    
    loadTasks();
    loadGroups();
}

toggleAuthBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    authTitle.textContent = isLogin ? 'Welcome Back' : 'Create Account';
    authSubmitBtn.textContent = isLogin ? 'Sign In' : 'Register';
    toggleAuthBtn.textContent = isLogin ? 'Don\'t have an account? Register' : 'Already have an account? Sign in';
    authError.classList.add('hidden-pane');
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    authError.classList.add('hidden-pane');

    authSubmitBtn.textContent = 'Please wait...';
    authSubmitBtn.disabled = true;

    try {
        if (isLogin) {
            const data = await apiCall('/login', 'POST', { username, password });
            token = data.access_token;
            currentUser = { id: data.user_id, username: data.username };
            localStorage.setItem('collabtask_token', token);
            localStorage.setItem('collabtask_user', JSON.stringify(currentUser));
            showDashboard();
        } else {
            await apiCall('/register', 'POST', { username, password });
            isLogin = true;
            authTitle.textContent = 'Welcome Back';
            authSubmitBtn.textContent = 'Sign In';
            toggleAuthBtn.textContent = 'Don\'t have an account? Register';
            authError.classList.remove('hidden-pane');
            authError.textContent = 'Registration successful. Please log in.';
            authError.classList.replace('bg-red-400/10', 'bg-green-400/10');
            authError.classList.replace('text-red-400', 'text-green-400');
            authError.classList.replace('border-red-400/20', 'border-green-400/20');
            document.getElementById('password').value = '';
        }
    } catch (err) {
        authError.classList.remove('hidden-pane');
        authError.classList.replace('bg-green-400/10', 'bg-red-400/10');
        authError.classList.replace('text-green-400', 'text-red-400');
        authError.classList.replace('border-green-400/20', 'border-red-400/20');
        authError.textContent = err.message;
    } finally {
        authSubmitBtn.textContent = isLogin ? 'Sign In' : 'Register';
        authSubmitBtn.disabled = false;
    }
});

logoutBtn.addEventListener('click', () => {
    token = null;
    currentUser = null;
    localStorage.removeItem('collabtask_token');
    localStorage.removeItem('collabtask_user');
    showAuth();
});

async function loadTasks() {
    const taskList = document.getElementById('task-list');
    taskList.innerHTML = '<div class="p-8 text-center text-slate-400 font-medium">Loading your tasks...</div>';
    try {
        const tasks = await apiCall('/tasks');
        if(tasks.length === 0) {
            taskList.innerHTML = '<div class="p-8 text-center text-slate-400 font-medium">No tasks found. Create a new task!</div>';
            return;
        }
        
        const priorityScore = { 'High': 3, 'Medium': 2, 'Low': 1 };
        tasks.sort((a, b) => {
            const scoreA = priorityScore[a.priority] || 0;
            const scoreB = priorityScore[b.priority] || 0;
            if (scoreA !== scoreB) {
                return scoreB - scoreA;
            }
            
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            
            return new Date(a.due_date) - new Date(b.due_date);
        });

        taskList.innerHTML = tasks.map(task => {
            let titleClasses = "text-xl font-bold text-white mb-2 tracking-tight";
            let containerOpacity = "";
            let displayDate = 'No Date';
            
            if (task.due_date) {
                const parts = task.due_date.split('-');
                if (parts.length === 3) {
                    displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                } else {
                    displayDate = task.due_date;
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dueDateObj = new Date(task.due_date);
                dueDateObj.setHours(0, 0, 0, 0);
                
                const diffTime = dueDateObj - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays < 0) {
                    titleClasses += " line-through opacity-60";
                    containerOpacity = "opacity-60 grayscale-[50%]";
                } else if (diffDays <= 3) {
                    titleClasses = titleClasses.replace("text-white", "text-red-400");
                }
            }

            return `
            <div class="glass p-5 rounded-xl card-hover transition-all fade-in priority-${task.priority.toLowerCase()} border-y border-r border-white/5 relative ${containerOpacity}">
                
                ${!task.is_owner ? `
                <div class="absolute top-4 right-4 bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs px-2 py-1 rounded-md font-medium z-10">Shared</div>
                ` : ''}

                <div class="flex gap-4">
                    <div class="flex-1">
                        <h4 class="${titleClasses}">${task.title}</h4>
                        <p class="text-slate-300 text-sm mb-4 leading-relaxed">${task.description || '<em class="opacity-50">No description</em>'}</p>
                        
                        <div class="flex items-center gap-4 text-xs font-semibold">
                            <span class="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-lg border border-indigo-500/20">📅 ${displayDate}</span>
                            <span class="bg-slate-800 text-slate-300 px-3 py-1 rounded-lg border border-white/10">⚡ ${task.priority}</span>
                        </div>
                    </div>
                    ${task.image_url ? `<img src="${task.image_url}" alt="Task" class="w-20 h-20 object-cover rounded-xl shadow-lg ml-4 border border-white/10">` : ''}
                </div>
                ${task.is_owner ? `
                <div class="mt-5 flex gap-3 pt-4 border-t border-white/5 flex-wrap">
                    <button onclick="triggerShareAction(${task.id})" class="text-sm px-4 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/20 transition-colors font-medium flex items-center gap-2">
                        Share (User)
                    </button>
                    <button onclick="triggerShareGroupAction(${task.id})" class="text-sm px-4 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20 transition-colors font-medium">
                        Send to Group
                    </button>
                    <button onclick='triggerEditTask(${JSON.stringify(task).replace(/'/g, "&#39;")})' class="text-sm px-4 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/20 transition-colors font-medium">
                        Edit
                    </button>
                    <button onclick="deleteTask(${task.id})" class="text-sm px-4 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/20 transition-colors font-medium">
                        Delete
                    </button>
                </div>
                ` : ''}
            </div>
            `;
        }).join('');
    } catch (err) {
        taskList.innerHTML = `<div class="p-8 text-center text-red-400 font-semibold">${err.message}</div>`;
        if(err.message.includes('Token has expired')) logoutBtn.click();
    }
}

async function deleteTask(id) {
    customActionPrompt('Delete Task', 'Are you sure you want to delete this task? (Type anything to confirm)', 'Delete', async (val) => {
        if(val !== null) {
            await apiCall(`/tasks/${id}`, 'DELETE');
            loadTasks();
        }
    });
}

function triggerShareAction(id) {
    customActionPrompt('Share Task', 'Enter the Username of the person you want to share this task with:', 'Username', async (usernameStr) => {
        if(usernameStr) {
            await apiCall(`/tasks/${id}/share`, 'POST', { username: usernameStr });
            loadTasks();
            alert('Task successfully shared!');
        }
    });
}

async function loadGroups() {
    const groupList = document.getElementById('group-list');
    groupList.innerHTML = '<div class="p-8 text-center text-slate-400 font-medium">Loading your groups...</div>';
    try {
        const groups = await apiCall('/groups');
        if(groups.length === 0) {
            groupList.innerHTML = '<div class="p-8 text-center text-slate-400 font-medium">You are not part of any groups</div>';
            return;
        }
        groupList.innerHTML = groups.map(group => `
            <div class="glass p-5 rounded-xl card-hover transition-all fade-in border border-white/5">
                <div class="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                    <h4 class="text-lg font-bold text-white flex items-center gap-2">
                        <svg width="18" height="18" fill="none" class="text-purple-400" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        ${group.name}
                    </h4>
                    <span class="text-xs font-bold text-slate-300 bg-white/10 px-2.5 py-1 rounded-md border border-white/10">${group.members.length} Members</span>
                </div>
                <div class="mb-4">
                    <div class="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-wide">Member List</div>
                    <div class="flex flex-wrap gap-2">
                        ${group.members.map(m => `<span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs border border-white/5">${m.username}</span>`).join('')}
                    </div>
                </div>
                ${group.owner_id === currentUser.id ? `
                <button onclick="triggerGroupAddAction(${group.id})" class="w-full btn-secondary py-2 rounded-lg text-sm font-semibold text-white mt-1 border-white/10 hover:border-white/20">
                    + Add Member
                </button>
                ` : ''}
            </div>
        `).join('');
    } catch (err) {
        groupList.innerHTML = `<div class="p-8 text-center text-red-400 font-semibold">${err.message}</div>`;
    }
}

function triggerGroupAddAction(id) {
    customActionPrompt('Add to Group', 'Enter the Username to add them to this group:', 'Username', async (usernameStr) => {
        if(usernameStr) {
            await apiCall(`/groups/${id}/add_user`, 'POST', { username: usernameStr });
            loadGroups();
            alert('User completely added to group!');
        }
    });
}

const taskModal = document.getElementById('task-modal');
const showTaskBtn = document.getElementById('show-task-modal-btn');
const closeTaskBtn = document.getElementById('close-task-modal-btn');
const taskForm = document.getElementById('task-form');

showTaskBtn.addEventListener('click', () => taskModal.classList.remove('hidden-pane'));
closeTaskBtn.addEventListener('click', () => taskModal.classList.add('hidden-pane'));

taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-desc').value,
        due_date: document.getElementById('task-date').value,
        priority: document.getElementById('task-priority').value,
        image_url: document.getElementById('task-image').value
    };
    try {
        await apiCall('/tasks', 'POST', payload);
        taskModal.classList.add('hidden-pane');
        taskForm.reset();
        loadTasks();
    } catch(err) {
        alert(err.message);
    }
});

const editTaskModal = document.getElementById('edit-task-modal');
const closeEditTaskBtn = document.getElementById('close-edit-task-modal-btn');
const editTaskForm = document.getElementById('edit-task-form');

function triggerEditTask(task) {
    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-title').value = task.title;
    document.getElementById('edit-task-desc').value = task.description || '';
    document.getElementById('edit-task-date').value = task.due_date || '';
    document.getElementById('edit-task-priority').value = task.priority || 'Medium';
    document.getElementById('edit-task-image').value = task.image_url || '';
    editTaskModal.classList.remove('hidden-pane');
}

closeEditTaskBtn.addEventListener('click', () => editTaskModal.classList.add('hidden-pane'));

editTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = document.getElementById('edit-task-id').value;
    const payload = {
        title: document.getElementById('edit-task-title').value,
        description: document.getElementById('edit-task-desc').value,
        due_date: document.getElementById('edit-task-date').value,
        priority: document.getElementById('edit-task-priority').value,
        image_url: document.getElementById('edit-task-image').value
    };
    try {
        await apiCall(`/tasks/${taskId}`, 'PUT', payload);
        editTaskModal.classList.add('hidden-pane');
        editTaskForm.reset();
        loadTasks();
    } catch(err) {
        alert(err.message);
    }
});

const shareGroupModal = document.getElementById('share-group-modal');
const closeShareGroupBtn = document.getElementById('close-share-group-modal-btn');
const shareGroupForm = document.getElementById('share-group-form');

async function triggerShareGroupAction(taskId) {
    const select = document.getElementById('share-group-select');
    select.innerHTML = '<option>Loading groups...</option>';
    document.getElementById('share-group-task-id').value = taskId;
    
    shareGroupModal.classList.remove('hidden-pane');
    try {
        const groups = await apiCall('/groups');
        if(groups.length === 0) {
            select.innerHTML = '<option value="" disabled selected>No groups found. Create one first!</option>';
        } else {
            select.innerHTML = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        }
    } catch(err) {
        select.innerHTML = '<option disabled>Failed to load groups</option>';
    }
}

closeShareGroupBtn.addEventListener('click', () => shareGroupModal.classList.add('hidden-pane'));

shareGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = document.getElementById('share-group-task-id').value;
    const groupId = document.getElementById('share-group-select').value;
    if(!groupId) return;
    
    try {
        await apiCall(`/tasks/${taskId}/share_group`, 'POST', { group_id: parseInt(groupId) });
        shareGroupModal.classList.add('hidden-pane');
        alert("Task successfully shared to group!");
        loadTasks();
    } catch(err) {
        alert(err.message);
    }
});

const groupModal = document.getElementById('group-modal');
const showGroupBtn = document.getElementById('show-group-modal-btn');
const closeGroupBtn = document.getElementById('close-group-modal-btn');
const groupForm = document.getElementById('group-form');

showGroupBtn.addEventListener('click', () => groupModal.classList.remove('hidden-pane'));
closeGroupBtn.addEventListener('click', () => groupModal.classList.add('hidden-pane'));

groupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { name: document.getElementById('group-name').value };
    try {
        await apiCall('/groups', 'POST', payload);
        groupModal.classList.add('hidden-pane');
        groupForm.reset();
        loadGroups();
    } catch(err) {
        alert(err.message);
    }
});


const actionModal = document.getElementById('action-modal');
const actionTitle = document.getElementById('action-modal-title');
const actionDesc = document.getElementById('action-modal-desc');
const actionInput = document.getElementById('action-modal-input');
const actionError = document.getElementById('action-modal-error');
const actionConfirmBtn = document.getElementById('action-confirm-btn');
const actionCancelBtn = document.getElementById('action-cancel-btn');

let pendingActionCallback = null;

function customActionPrompt(title, desc, placeholder, callback) {
    actionTitle.textContent = title;
    actionDesc.textContent = desc;
    actionInput.placeholder = placeholder;
    actionInput.value = '';
    actionError.classList.add('hidden-pane');
    actionModal.classList.remove('hidden-pane');
    
    setTimeout(() => actionInput.focus(), 100);

    pendingActionCallback = callback;
}

function closeActionPrompt() {
    actionModal.classList.add('hidden-pane');
    pendingActionCallback = null;
}

actionConfirmBtn.addEventListener('click', async () => {
    const val = actionInput.value.trim();
    if(!val) {
        actionError.textContent = 'This field is required.';
        actionError.classList.remove('hidden-pane');
        return;
    }
    
    if (pendingActionCallback) {
        actionConfirmBtn.disabled = true;
        actionConfirmBtn.textContent = 'Processing...';
        try {
            await pendingActionCallback(val);
            closeActionPrompt();
        } catch (err) {
            actionError.textContent = err.message;
            actionError.classList.remove('hidden-pane');
        } finally {
            actionConfirmBtn.disabled = false;
            actionConfirmBtn.textContent = 'Confirm';
        }
    }
});

actionCancelBtn.addEventListener('click', closeActionPrompt);

actionInput.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') {
        e.preventDefault();
        actionConfirmBtn.click();
    }
});


init();
