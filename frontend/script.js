const API_URL = window.location.hostname.includes('vercel.app') || (window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:') ? '/api' : 'http://127.0.0.1:5000/api';

let token = localStorage.getItem('collabtask_token');
let currentUser = JSON.parse(localStorage.getItem('collabtask_user'));

// Auth Elements
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const toggleAuthBtn = document.getElementById('toggle-auth');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');

const togglePasswordBtn = document.getElementById('toggle-password');
const passwordInput = document.getElementById('password');
const confirmPasswordContainer = document.getElementById('confirm-password-container');
const confirmPasswordInput = document.getElementById('confirm-password');

let isLogin = true;
let activeProjectId = null;
let projectMembers = []; // Cache members of active project for task assignments
let userRoleInProject = 'Viewer';

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
    let data;
    try { data = await res.json(); } catch(e) { throw new Error('Backend crash or non-JSON response.') }
    
    if (!res.ok) throw new Error(data.msg || 'API Error');
    return data;
}

// -------------------------
// Authentication
// -------------------------
function showAuth() {
    authView.classList.remove('hidden-pane');
    dashboardView.classList.add('hidden-pane');
}

function showDashboard() {
    authView.classList.add('hidden-pane');
    dashboardView.classList.remove('hidden-pane');
    
    if (currentUser) {
        document.getElementById('user-greeting').textContent = currentUser.username;
        document.getElementById('user-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
    }
    
    loadProjects();
}

toggleAuthBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    authTitle.textContent = isLogin ? 'Sign In to NexGen' : 'Register for NexGen';
    authSubmitBtn.textContent = isLogin ? 'Sign In' : 'Register';
    toggleAuthBtn.textContent = isLogin ? 'Need an account? Register' : 'Already have an account? Sign in';
    authError.classList.add('hidden-pane');
    
    if (isLogin) {
        confirmPasswordContainer.classList.add('hidden-pane');
        confirmPasswordInput.required = false;
    } else {
        confirmPasswordContainer.classList.remove('hidden-pane');
        confirmPasswordInput.required = true;
    }
});

togglePasswordBtn.addEventListener('click', () => {
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        togglePasswordBtn.innerHTML = '<span class="text-sm font-medium">Hide</span>';
    } else {
        passwordInput.type = 'password';
        togglePasswordBtn.innerHTML = '<span class="text-sm font-medium">Show</span>';
    }
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    authError.classList.add('hidden-pane');

    if (!isLogin && password !== confirmPassword) {
        showError("Passwords do not match.");
        return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Please wait...';

    try {
        if (isLogin) {
            const data = await apiCall('/auth/login', 'POST', { username, password });
            token = data.access_token;
            currentUser = { id: data.user_id, username: data.username };
            localStorage.setItem('collabtask_token', token);
            localStorage.setItem('collabtask_user', JSON.stringify(currentUser));
            showDashboard();
        } else {
            await apiCall('/auth/register', 'POST', { username, password });
            isLogin = true;
            authTitle.textContent = 'Sign In to NexGen';
            authSubmitBtn.textContent = 'Sign In';
            toggleAuthBtn.textContent = 'Need an account? Register';
            confirmPasswordContainer.classList.add('hidden-pane');
            confirmPasswordInput.required = false;
            passwordInput.value = '';
            confirmPasswordInput.value = '';
            showError("Registration successful. Please log in.", true);
        }
    } catch (err) {
        showError(err.message);
    } finally {
        authSubmitBtn.textContent = isLogin ? 'Sign In' : 'Register';
        authSubmitBtn.disabled = false;
    }
});

function showError(msg, isSuccess = false) {
    authError.textContent = msg;
    authError.classList.remove('hidden-pane');
    if(isSuccess) {
        authError.classList.replace('bg-red-500/10', 'bg-green-500/10');
        authError.classList.replace('border-red-500/20', 'border-green-500/20');
        authError.classList.replace('text-red-400', 'text-green-400');
    } else {
        authError.classList.replace('bg-green-500/10', 'bg-red-500/10');
        authError.classList.replace('border-green-500/20', 'border-red-500/20');
        authError.classList.replace('text-green-400', 'text-red-400');
    }
}

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('collabtask_token');
    localStorage.removeItem('collabtask_user');
    token = null;
    currentUser = null;
    activeProjectId = null;
    showAuth();
});

// -------------------------
// Projects Navigation
// -------------------------
let allProjects = [];

async function loadProjects() {
    try {
        allProjects = await apiCall('/projects/');
        const list = document.getElementById('projects-list');
        
        // Filter out pending projects for sidebar
        const activeProjects = [];
        const pendingProjects = [];
        
        for(let p of allProjects) {
            let myMem = p.members.find(x => x.user_id === currentUser.id);
            if(myMem && myMem.status === 'Pending') {
                pendingProjects.push(p);
            } else {
                activeProjects.push(p);
            }
        }
        
        handleNotifications(pendingProjects);
        
        if (activeProjects.length === 0) {
            list.innerHTML = '<div class="text-xs text-dark-muted p-3">No active projects.</div>';
            return;
        }
        
        list.innerHTML = activeProjects.map(p => {
            const isActive = p.id === activeProjectId;
            return `
                <button onclick="selectProject('${p.id}')" class="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-brand-default/10 text-brand-default' : 'text-dark-muted hover:bg-dark-hover hover:text-white'}">
                    <span class="truncate block">${p.name}</span>
                </button>
            `;
        }).join('');
        
        if (activeProjectId && activeProjects.find(x=>x.id===activeProjectId)) {
            selectProject(activeProjectId);
        } else {
            document.getElementById('no-project-state').classList.remove('hidden-pane');
            document.getElementById('active-project-state').classList.add('hidden-pane');
        }
    } catch (err) {
        if(err.message.includes('Token has expired')) document.getElementById('logout-btn').click();
    }
}

function handleNotifications(pendingArray) {
    const badge = document.getElementById('notif-badge');
    const notifBtn = document.getElementById('notification-btn');
    const notifList = document.getElementById('notif-list');
    
    if(pendingArray.length > 0) {
        badge.classList.remove('hidden-pane');
    } else {
        badge.classList.add('hidden-pane');
    }
    
    if(pendingArray.length === 0) {
        notifList.innerHTML = '<div class="text-sm text-dark-muted text-center p-4">You have no pending invitations.</div>';
    } else {
        notifList.innerHTML = pendingArray.map(p => `
            <div class="bg-dark-base border border-dark-border p-4 rounded-xl">
                <div class="font-bold text-sm text-white mb-1">Invited to '${p.name}'</div>
                <div class="text-xs text-dark-muted mb-3">You have been invited to join this project.</div>
                <div class="flex gap-2">
                    <button onclick="respondInvite('${p.id}', 'accept')" class="px-3 py-1.5 bg-brand-default text-white hover:bg-brand-hover rounded-lg text-xs font-semibold w-full transition-colors">Accept</button>
                    <button onclick="respondInvite('${p.id}', 'decline')" class="px-3 py-1.5 bg-dark-hover text-red-400 hover:bg-red-500/10 border border-dark-border hover:border-red-500/20 rounded-lg text-xs font-semibold w-full transition-colors">Decline</button>
                </div>
            </div>
        `).join('');
    }
}

document.getElementById('notification-btn').addEventListener('click', () => {
    document.getElementById('notif-modal').classList.remove('hidden-pane');
});

window.respondInvite = async function(projectId, action) {
    try {
        await apiCall(`/projects/${projectId}/invite`, 'PUT', { action });
        document.getElementById('notif-modal').classList.add('hidden-pane');
        loadProjects();
    } catch(err) { alert(err.message); }
}

function getRoleColor(role) {
    switch(role) {
        case 'Admin': return 'text-red-400 bg-red-400/10 border-red-400/20';
        case 'Member': return 'text-blue-400 bg-brand-default/10 border-brand-default/20';
        default: return 'text-dark-muted bg-dark-hover border-dark-border';
    }
}

function selectProject(id) {
    activeProjectId = id;
    const project = allProjects.find(p => p.id === id);
    if (!project) return;
    
    // Refresh sidebar highlights
    const listBtns = document.getElementById('projects-list').children;
    Array.from(listBtns).forEach(btn => {
        if(btn.textContent.trim() === project.name) {
            btn.className = "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors bg-brand-default/10 text-brand-default";
        } else {
            btn.className = "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors text-dark-muted hover:bg-dark-hover hover:text-white";
        }
    });

    document.getElementById('no-project-state').classList.add('hidden-pane');
    document.getElementById('active-project-state').classList.remove('hidden-pane');
    
    document.getElementById('active-project-name').textContent = project.name;
    document.getElementById('active-project-desc').textContent = project.description || 'No description provided.';
    
    // Determine Role
    userRoleInProject = 'Viewer';
    if (project.owner_id === currentUser.id) userRoleInProject = 'Admin';
    else {
        const m = project.members.find(x => x.user_id === currentUser.id);
        if (m) userRoleInProject = m.role;
    }
    
    const roleSpan = document.getElementById('active-project-role');
    roleSpan.textContent = userRoleInProject;
    roleSpan.className = `px-2 py-0.5 rounded text-xs font-semibold border ${getRoleColor(userRoleInProject)}`;
    
    // UI toggles based on role
    const delBtn = document.getElementById('delete-project-btn');
    const leaveBtn = document.getElementById('leave-project-btn');
    const addBtn = document.getElementById('show-add-member-btn');
    
    delBtn.classList.add('hidden-pane');
    leaveBtn.classList.add('hidden-pane');
    addBtn.classList.add('hidden-pane');
    
    if (userRoleInProject === 'Admin') {
        delBtn.classList.remove('hidden-pane');
        addBtn.classList.remove('hidden-pane');
    } else {
        leaveBtn.classList.remove('hidden-pane');
    }
    
    const rootTaskBtn = document.getElementById('new-root-task-btn');
    if (userRoleInProject === 'Viewer') {
        rootTaskBtn.classList.add('hidden-pane');
    } else {
        rootTaskBtn.classList.remove('hidden-pane');
    }
    
    // filter so tasks can only be assigned to "Joined" members
    projectMembers = project.members.filter(m => m.status === 'Joined');
    renderMembers(project.members);
    loadTasks();
}

function renderMembers(members) {
    const list = document.getElementById('project-members-list');
    list.innerHTML = members.map(m => {
        const rc = getRoleColor(m.role);
        // Only show edit prompt if current user is admin, AND the member is NOT themselves
        const canEdit = userRoleInProject === 'Admin' && m.user_id !== currentUser.id;
        
        return `
        <div class="flex flex-col gap-1 p-2 rounded-lg ${canEdit ? 'hover:bg-dark-hover cursor-pointer group transition-colors' : ''}" ${canEdit ? `onclick="triggerEditMemberRole('${m.user_id}', '${m.username}', '${m.role}')"` : ''}>
            <div class="flex items-center gap-2">
                <div class="flex-1 overflow-hidden flex justify-between items-center">
                    <span class="text-sm text-white truncate ${m.status === 'Pending' ? 'opacity-50' : ''}">${m.username} ${m.status === 'Pending' ? '(Pending)' : ''}</span>
                    <span class="text-[10px] uppercase font-bold border px-1.5 py-0.5 rounded ${rc}">${m.role}</span>
                </div>
            </div>
            ${canEdit ? `<div class="text-[10px] text-brand-default opacity-0 group-hover:opacity-100 transition-opacity">Click to modify role</div>` : ''}
        </div>
    `}).join('');
}


// -------------------------
// Action Triggers
// -------------------------
document.getElementById('show-project-modal-btn').addEventListener('click', () => {
    document.getElementById('project-modal').classList.remove('hidden-pane');
});

document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('project-name').value;
    const desc = document.getElementById('project-desc').value;
    try {
        await apiCall('/projects/', 'POST', { name, description: desc });
        document.getElementById('project-modal').classList.add('hidden-pane');
        document.getElementById('project-form').reset();
        await loadProjects();
    } catch(err) { alert(err.message); }
});

document.getElementById('delete-project-btn').addEventListener('click', () => {
    customAction('Delete Project', 'Are you sure you want to delete this project?', { type: 'checkbox' }, async (val) => {
        if(val) {
            await apiCall(`/projects/${activeProjectId}`, 'DELETE');
            activeProjectId = null;
            loadProjects();
        }
    });
});

document.getElementById('leave-project-btn').addEventListener('click', () => {
    customAction('Leave Project', 'Are you sure you want to leave?', { type: 'checkbox' }, async (val) => {
        if(val) {
            await apiCall(`/projects/${activeProjectId}/leave`, 'POST');
            activeProjectId = null;
            loadProjects();
        }
    });
});

document.getElementById('show-add-member-btn').addEventListener('click', () => {
    customAction('Invite Member', 'Enter username to invite:', { type: 'input_role' }, async (data) => {
        if(data.input) {
            await apiCall(`/projects/${activeProjectId}/members`, 'POST', { username: data.input, role: data.role });
            loadProjects();
        }
    });
});

window.triggerEditMemberRole = function(userId, username, currentRole) {
    customAction(`Edit Role for ${username}`, '', { type: 'edit_role', defaultRole: currentRole }, async (data) => {
        if(data.role) {
            await apiCall(`/projects/${activeProjectId}/members/${userId}/role`, 'PUT', { role: data.role });
            loadProjects();
        }
    });
}

// -------------------------
// Tasks Core
// -------------------------

let allTasks = [];

async function loadTasks() {
    if (!activeProjectId) return;
    try {
        allTasks = await apiCall(`/tasks/project/${activeProjectId}`);
        renderTaskTree();
    } catch (err) {
        document.getElementById('tasks-tree-container').innerHTML = `<div class="text-red-400 p-4">${err.message}</div>`;
    }
}

function extractTree(tasks, parentId = null) {
    const nodes = tasks.filter(t => t.parent_task_id === parentId);
    for (let current of nodes) {
        current.children = extractTree(tasks, current.id);
        // Calculate progress based on children
        let total = 0; let done = 0;
        
        function calcStats(node) {
            if (node.children && node.children.length > 0) {
                for(let c of node.children) {
                    calcStats(c);
                    total++;
                    if(c.is_done) done++;
                }
            }
        }
        calcStats(current);
        
        current.progressTotal = total;
        current.progressDone = done;
        current.progressPct = total === 0 ? (current.is_done ? 100 : 0) : Math.round((done/total)*100);
    }
    return nodes;
}

function renderTaskTree() {
    const container = document.getElementById('tasks-tree-container');
    const tree = extractTree(allTasks, null);
    
    if (tree.length === 0) {
        container.innerHTML = `<div class="text-center p-8 border border-dashed border-dark-border rounded-xl text-dark-muted">No tasks yet. Create one!</div>`;
        return;
    }
    
    let html = '';
    function buildHtml(nodes, depth) {
        let str = '';
        nodes.forEach(node => {
            const hasChildren = node.children.length > 0;
            const borderCol = node.priority === 'High' ? 'border-l-red-500' : (node.priority === 'Medium' ? 'border-l-orange-500' : 'border-l-green-500');
            
            // Check permissions for mark as done
            const isAssigned = node.assignees && node.assignees.some(a => a.user_id === currentUser.id);
            const canMarkDone = userRoleInProject === 'Admin' || isAssigned;
            
            str += `
            <div class="tree-node-wrapper w-full">
                ${depth > 0 && hasChildren ? '<div class="tree-line"></div>' : ''}
                <div class="tree-node bg-dark-panel border border-dark-border ${borderCol} border-l-4 rounded-xl p-4 mb-3 ${node.is_done ? 'opacity-50 grayscale' : ''}">
                    <div class="flex justify-between items-start gap-4">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-1">
                                <h4 class="text-sm font-bold text-white ${node.is_done ? 'line-through' : ''}">${node.title}</h4>
                                ${node.progressTotal > 0 ? `<span class="text-[10px] font-bold text-brand-default px-2 py-0.5 bg-brand-default/10 rounded">${node.progressPct}%</span>` : ''}
                            </div>
                            <p class="text-xs text-dark-muted mb-3">${node.description || 'No description'}</p>
                            
                            <div class="flex flex-wrap items-center gap-3 text-[10px] font-medium text-dark-muted uppercase tracking-wider">
                                ${node.priority ? `<div class="flex items-center gap-1 border border-dark-border px-2 py-1 rounded bg-dark-base ${node.priority === 'High' ? 'text-red-400' : ''}"><span>⚡ ${node.priority}</span></div>` : ''}
                                ${node.due_date ? `<div class="flex items-center gap-1 border border-dark-border px-2 py-1 rounded bg-dark-base text-orange-200"><span>📅 ${node.due_date}</span></div>` : ''}
                                ${node.assignees && node.assignees.length > 0 ? 
                                    `<div class="flex items-center gap-1 border border-dark-border px-2 py-1 rounded bg-dark-base">
                                        👥 ${node.assignees.map(a => a.username).join(', ')}
                                     </div>` : ''
                                }
                                <button onclick="openRemarks('${node.id}')" class="flex items-center gap-1 border border-dark-border px-2 py-1 rounded hover:bg-dark-border hover:text-white transition-colors cursor-pointer">
                                    💬 Remarks (${node.remarks ? node.remarks.length : 0})
                                </button>
                            </div>
                            
                            ${node.progressTotal > 0 ? `
                            <div class="mt-4 progress-bar-bg">
                                <div class="progress-bar-fill" style="width: ${node.progressPct}%"></div>
                            </div>
                            ` : ''}
                        </div>
                        
                        <!-- Actions -->
                        <div class="flex items-center gap-2">
                            ${canMarkDone ? `
                            <button onclick="toggleDone('${node.id}', ${!node.is_done})" class="px-2 py-1 rounded bg-dark-hover border border-dark-border text-xs ${node.is_done ? 'text-dark-muted' : 'text-green-400 hover:text-green-300'} transition-colors font-medium">
                                ${node.is_done ? 'Unmark' : 'Done ✓'}
                            </button>
                            ` : ''}
                            ${userRoleInProject !== 'Viewer' ? `
                            <button onclick="triggerNewTask('${node.id}')" class="px-2 py-1 rounded bg-brand-default/10 border border-brand-default/20 text-xs text-brand-default hover:bg-brand-default/20 transition-colors font-medium">
                                + Subtask
                            </button>
                            <button onclick="triggerEditTask('${node.id}')" class="px-2 py-1 rounded border border-dark-border text-xs text-dark-muted hover:text-white hover:bg-dark-hover transition-colors font-medium">
                                Edit
                            </button>
                            <button onclick="deleteTask('${node.id}')" class="px-2 py-1 rounded border border-dark-border text-xs text-red-500 hover:bg-red-500/10 transition-colors font-medium">
                                Del
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                ${hasChildren ? `<div class="tree-children">${buildHtml(node.children, depth + 1)}</div>` : ''}
            </div>
            `;
        });
        return str;
    }
    html = buildHtml(tree, 0);
    container.innerHTML = html;
}

window.triggerNewTask = function(parentId = null) {
    document.getElementById('task-form').reset();
    document.getElementById('task-action-mode').value = 'create';
    document.getElementById('task-parent-id').value = parentId || '';
    document.getElementById('task-modal-title').textContent = parentId ? 'Create Subtask' : 'Create Root Task';
    
    // Populate Assignees selector
    const container = document.getElementById('task-assignees-container');
    if (projectMembers.length === 0) {
        container.innerHTML = '<div class="text-dark-muted text-xs italic">No members available to assign.</div>';
    } else {
        container.innerHTML = projectMembers.map(m => `
            <label class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-dark-hover cursor-pointer transition-all border border-transparent hover:border-dark-border/50 group">
                <input type="checkbox" name="task-assignee" value="${m.user_id}" class="w-5 h-5 rounded-lg border-dark-border bg-dark-base text-brand-default focus:ring-brand-default transition-all cursor-pointer accent-brand-default">
                <span class="text-sm text-dark-muted group-hover:text-white transition-colors flex-1">${m.username}</span>
            </label>
        `).join('');
    }
    
    document.getElementById('task-modal').classList.remove('hidden-pane');
}

window.triggerEditTask = function(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if(!task) return;
    
    document.getElementById('task-action-mode').value = 'edit';
    document.getElementById('task-target-id').value = taskId;
    document.getElementById('task-modal-title').textContent = 'Edit Task';
    
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-desc').value = task.description || '';
    document.getElementById('task-date').value = task.due_date || '';
    document.getElementById('task-priority').value = task.priority || 'Medium';
    
    // Populate Assignees selector
    const container = document.getElementById('task-assignees-container');
    if (projectMembers.length === 0) {
        container.innerHTML = '<div class="text-dark-muted text-xs italic">No members available to assign.</div>';
    } else {
        container.innerHTML = projectMembers.map(m => {
            const isChecked = task.assignees.some(a => a.user_id === m.user_id) ? 'checked' : '';
            return `
                <label class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-dark-hover cursor-pointer transition-all border border-transparent hover:border-dark-border/50 group">
                    <input type="checkbox" name="task-assignee" value="${m.user_id}" ${isChecked} class="w-5 h-5 rounded-lg border-dark-border bg-dark-base text-brand-default focus:ring-brand-default transition-all cursor-pointer accent-brand-default">
                    <span class="text-sm ${isChecked ? 'text-white font-medium' : 'text-dark-muted'} group-hover:text-white transition-colors flex-1">${m.username}</span>
                </label>
            `;
        }).join('');
    }
    
    document.getElementById('task-modal').classList.remove('hidden-pane');
}

document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const mode = document.getElementById('task-action-mode').value;
    const targetId = document.getElementById('task-target-id').value;
    
    const checkboxes = document.querySelectorAll('input[name="task-assignee"]:checked');
    const selectedAssignees = Array.from(checkboxes).map(cb => cb.value);
    
    const pId = document.getElementById('task-parent-id').value;
    
    const payload = {
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-desc').value,
        due_date: document.getElementById('task-date').value,
        priority: document.getElementById('task-priority').value,
        assignees: selectedAssignees
    };
    
    try {
        if(mode === 'create') {
            payload.project_id = activeProjectId;
            payload.parent_task_id = pId ? pId : null;
            await apiCall('/tasks/', 'POST', payload);
        } else {
            // Edit
            await apiCall(`/tasks/${targetId}`, 'PUT', payload);
        }
        document.getElementById('task-modal').classList.add('hidden-pane');
        document.getElementById('task-form').reset();
        loadTasks();
    } catch(err) { alert(err.message); }
});

window.toggleDone = async function(id, status) {
    await apiCall(`/tasks/${id}`, 'PUT', { is_done: status });
    loadTasks();
}

window.deleteTask = function(id) {
    customAction('Delete Task', 'This will also delete all subtasks.', { type: 'checkbox' }, async (val) => {
        if(val) {
            await apiCall(`/tasks/${id}`, 'DELETE');
            loadTasks();
        }
    });
}

window.openRemarks = function(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if(!task) return;
    
    document.getElementById('remark-task-id').value = taskId;
    const list = document.getElementById('remark-list');
    
    if(!task.remarks || task.remarks.length === 0) {
        list.innerHTML = '<div class="text-sm text-dark-muted text-center p-4">No remarks yet.</div>';
    } else {
        list.innerHTML = task.remarks.map(r => `
            <div class="bg-dark-base border border-dark-border p-3 rounded-xl rounded-tl-sm w-[85%] relative">
                <div class="font-bold text-xs text-brand-default mb-1">${r.username}</div>
                <div class="text-sm text-white">${r.text}</div>
            </div>
        `).join('');
    }
    
    document.getElementById('remark-modal').classList.remove('hidden-pane');
    // scroll to bottom
    list.scrollTop = list.scrollHeight;
}

document.getElementById('remark-form').addEventListener('submit', async(e) => {
    e.preventDefault();
    const taskId = document.getElementById('remark-task-id').value;
    const text = document.getElementById('remark-input').value;
    
    try {
        await apiCall(`/tasks/${taskId}/remark`, 'POST', { text });
        document.getElementById('remark-input').value = '';
        await loadTasks(); // reload data
        openRemarks(taskId); // re-render remarks window
    } catch(err) { alert(err.message); }
});


// -------------------------
// Custom Modal
// -------------------------
const actionModal = document.getElementById('action-modal');
const actionTitle = document.getElementById('action-title');
const actionDesc = document.getElementById('action-desc');
const actionInputSec = document.getElementById('action-input-section');
const actionInput = document.getElementById('action-input');
const actionRoleSec = document.getElementById('action-role-section');
const actionRole = document.getElementById('action-role');
const actionRoleDesc = document.getElementById('action-role-desc');
const actionCheckboxSec = document.getElementById('action-checkbox-section');
const actionCheckbox = document.getElementById('action-checkbox');
const actionError = document.getElementById('action-error');
const actionConfirm = document.getElementById('action-confirm-btn');

const roleDescriptions = {
    'Admin': 'Full access. Can assign roles, manage members, delete projects, and edit or mark any tasks as done.',
    'Member': 'Standard access. Can interact with tasks assigned to them, create new subtasks, and leave remarks.',
    'Viewer': 'Read-only access. Can only observe project progress, read tasks, and view remarks.'
};

actionRole.addEventListener('change', (e) => {
    actionRoleDesc.textContent = roleDescriptions[e.target.value] || '';
});

let actionCallback = null;
let actionType = null;

function customAction(title, desc, config, callback) {
    actionTitle.textContent = title;
    actionDesc.textContent = desc;
    actionType = config.type;
    actionError.classList.add('hidden-pane');
    actionInputSec.classList.add('hidden-pane');
    actionRoleSec.classList.add('hidden-pane');
    actionCheckboxSec.classList.add('hidden-pane');
    
    if(actionType === 'checkbox') {
        actionCheckboxSec.classList.remove('hidden-pane');
        actionCheckbox.checked = false;
    } else if(actionType === 'input_role') {
        actionInputSec.classList.remove('hidden-pane');
        actionRoleSec.classList.remove('hidden-pane');
        actionInput.value = '';
        actionRole.value = 'Member';
        actionRoleDesc.textContent = roleDescriptions['Member'];
    } else if(actionType === 'edit_role') {
        actionRoleSec.classList.remove('hidden-pane');
        actionRole.value = config.defaultRole || 'Member';
        actionRoleDesc.textContent = roleDescriptions[actionRole.value];
    }
    
    actionCallback = callback;
    actionModal.classList.remove('hidden-pane');
}

actionConfirm.addEventListener('click', async () => {
    let result = null;
    if(actionType === 'checkbox') {
        if(!actionCheckbox.checked) {
            actionError.textContent = "You must confirm to proceed.";
            actionError.classList.remove('hidden-pane');
            return;
        }
        result = true;
    } else if(actionType === 'input_role') {
        const val = actionInput.value.trim();
        if(!val) return;
        result = { input: val, role: actionRole.value };
    } else if (actionType === 'edit_role') {
        result = { role: actionRole.value };
    }
    
    actionConfirm.disabled = true;
    try {
        await actionCallback(result);
        actionModal.classList.add('hidden-pane');
    } catch(err) {
        actionError.textContent = err.message || "Failed";
        actionError.classList.remove('hidden-pane');
    } finally {
        actionConfirm.disabled = false;
    }
});

document.getElementById('action-cancel-btn').addEventListener('click', () => {
    actionModal.classList.add('hidden-pane');
});

init();
