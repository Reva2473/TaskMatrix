
let allTasks = [];

async function loadTasks() {
    if (!activeProjectId) return;
    try {
        allTasks = await apiCall(`/tasks/project/${activeProjectId}`);
        renderTaskTree();
        const project = allProjects.find(p => p.id === activeProjectId);
        if(project) renderMembers(project.members);
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
                                ${hasChildren ? `
                                <button onclick="toggleSubtask('${node.id}')" class="text-dark-muted hover:text-white transition-colors">
                                    <svg id="subtask-icon-${node.id}" width="16" height="16" viewBox="0 0 24 24" fill="none" class="transform transition-transform rotate-180" stroke="currentColor" stroke-width="2"><path d="M19 9l-7 7-7-7"></path></svg>
                                </button>
                                ` : ''}
                                <h4 class="text-sm font-bold text-white ${node.is_done ? 'line-through' : ''}">${node.title}</h4>
                                
                                <div class="relative group cursor-help text-dark-muted hover:text-brand-default transition-colors">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4m0-4h.01"></path></svg>
                                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-3 py-2 bg-black border border-dark-border text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                        <div class="mb-1 text-dark-muted uppercase font-bold text-[8px] tracking-wider">Task Info</div>
                                        <div><span class="text-dark-muted">Created By:</span> ${node.owner_username || 'Unknown'}</div>
                                        <div><span class="text-dark-muted">Created On:</span> ${node.created_at ? new Date(node.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}</div>
                                        <div><span class="text-dark-muted">Completed On:</span> ${node.completed_at ? new Date(node.completed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Pending'}</div>
                                    </div>
                                </div>
                                
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
                            <button onclick="toggleDone('${node.id}', ${!node.is_done})" class="px-2 py-1 rounded border transition-colors font-medium text-xs ${node.is_done ? 'bg-brand-default text-white border-brand-default hover:bg-brand-hover' : 'bg-dark-hover border-dark-border text-green-400 hover:text-green-300'}">
                                ${node.is_done ? 'Unmark' : 'Done ✓'}
                            </button>
                            ` : ''}
                            ${userRoleInProject !== 'Viewer' ? `
                            <button onclick="triggerNewTask('${node.id}')" class="px-2 py-1 rounded bg-brand-default/10 border border-brand-default/20 text-xs text-brand-default hover:bg-brand-default/20 transition-colors font-medium" title="Add Subtask">
                                +
                            </button>
                            <button onclick="triggerEditTask('${node.id}')" class="p-1.5 rounded border border-dark-border text-dark-muted hover:text-white hover:bg-dark-hover transition-colors" title="Edit">
                                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button onclick="deleteTask('${node.id}')" class="p-1.5 rounded border border-dark-border text-red-500 hover:bg-red-500/10 transition-colors" title="Delete">
                                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                ${hasChildren ? `<div id="subtasks-${node.id}" class="tree-children">${buildHtml(node.children, depth + 1)}</div>` : ''}
            </div>
            `;
        });
        return str;
    }
    html = buildHtml(tree, 0);
    container.innerHTML = html;
}

window.toggleSubtask = function(taskId) {
    const el = document.getElementById(`subtasks-${taskId}`);
    const icon = document.getElementById(`subtask-icon-${taskId}`);
    if(el.classList.contains('hidden-pane')) {
        el.classList.remove('hidden-pane');
        icon.classList.add('rotate-180');
    } else {
        el.classList.add('hidden-pane');
        icon.classList.remove('rotate-180');
    }
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
        const project = allProjects.find(p => p.id === activeProjectId);
        list.innerHTML = task.remarks.map(r => {
            const isMe = r.user_id === currentUser.id;
            let roleStr = 'Unknown';
            if(project) {
                if(project.owner_id === r.user_id) roleStr = 'Admin';
                else {
                    const m = project.members.find(x => x.user_id === r.user_id);
                    if(m) roleStr = m.role;
                }
            }
            const roleTag = getRoleHtml(roleStr, 'text-[9px]');
            const ts = new Date(r.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

            return `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <div class="${isMe ? 'bg-brand-default/20 border-brand-default/30 rounded-tr-sm' : 'bg-dark-base border-dark-border rounded-tl-sm'} border p-3 rounded-xl w-[85%] relative shadow-lg">
                    <div class="flex items-center gap-2 mb-1.5">
                        <div class="font-bold text-xs ${isMe ? 'text-white' : 'text-brand-default'}">${isMe ? 'You' : r.username}</div>
                        ${roleTag}
                    </div>
                    <div class="text-sm text-white leading-relaxed">${r.text}</div>
                    <div class="text-[9px] text-dark-muted mt-2 text-right opacity-75">${ts}</div>
                </div>
            </div>
            `;
        }).join('');
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



function renderRoles(roles) {
    const list = document.getElementById('project-roles-list');
    if(!roles || roles.length === 0) {
        list.innerHTML = '<div class="text-xs text-dark-muted italic text-center p-8 bg-dark-base/50 rounded-lg border border-dashed border-dark-border">No custom roles created.</div>';
        return;
    }
    list.innerHTML = roles.map(r => {
        const taskObj = allTasks.find(t => t.id === r.task_id);
        const taskName = taskObj ? taskObj.title : 'Deleted Task';
        return `
        <div class="bg-dark-base border border-dark-border p-4 rounded-xl flex flex-col gap-3 shadow-md">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full" style="background-color: ${r.color}"></div>
                    <span class="text-xs font-bold text-white uppercase tracking-tight">${r.name}</span>
                </div>
                <button onclick="deleteCustomRole('${r.id}')" class="text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors" title="Delete Role">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
            <div class="pt-2 border-t border-dark-border/50">
                <div class="text-[10px] text-dark-muted mb-1 font-bold uppercase tracking-wider">Root Access</div>
                <div class="flex items-center gap-2 bg-dark-panel p-2 rounded-lg border border-dark-border">
                    <svg class="text-brand-default" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    <span class="text-[11px] text-white truncate font-medium">${taskName}</span>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

window.deleteCustomRole = async function(roleId) {
    if(confirm('Are you sure you want to delete this role? Members with this role will become Viewers.')) {
        await apiCall(`/projects/${activeProjectId}/roles/${roleId}`, 'DELETE');
        loadProjects(); // this will refresh the UI
    }
}

window.triggerCreateRole = function() {
    document.getElementById('role-form').reset();
    const taskSelect = document.getElementById('role-task');
    if(allTasks.length === 0) {
        taskSelect.innerHTML = '<option disabled selected value="">No tasks available</option>';
    } else {
        taskSelect.innerHTML = allTasks.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
    }
    
    // EXCLUDE TAKEN COLORS
    const p = allProjects.find(x => x.id === activeProjectId);
    const takenColors = p && p.custom_roles ? p.custom_roles.map(r => r.color.toUpperCase()) : [];
    const dots = document.querySelectorAll('#role-color-picker div');
    let firstAvailable = null;

    dots.forEach(dot => {
        // Get hex from onclick string
        const match = dot.getAttribute('onclick').match(/#(?:[0-9a-fA-F]{3}){1,2}/);
        const hex = match ? match[0].toUpperCase() : '';
        if(takenColors.includes(hex)) {
            dot.classList.add('opacity-10', 'pointer-events-none', 'grayscale');
        } else {
            dot.classList.remove('opacity-10', 'pointer-events-none', 'grayscale');
            if(!firstAvailable) firstAvailable = { hex, el: dot };
        }
    });

    document.getElementById('role-modal').classList.remove('hidden-pane');
    
    // Reset color picker to first available color
    if(firstAvailable) selectRoleColor(firstAvailable.hex, firstAvailable.el);
}

window.toggleProjectSettings = function() {
    const sec = document.getElementById('project-settings-sec');
    if(sec.classList.contains('hidden-pane')) {
        sec.classList.remove('hidden-pane');
    } else {
        sec.classList.add('hidden-pane');
    }
}

window.updateProjectDetails = async function() {
    const name = document.getElementById('edit-proj-name').value;
    const description = document.getElementById('edit-proj-desc').value;
    try {
        await apiCall(`/projects/${activeProjectId}`, 'PUT', { name, description });
        toggleProjectSettings(); // close modal
        loadProjects();
    } catch(err) { alert(err.message); }
}

window.selectRoleColor = function(hex, el) {
    document.getElementById('role-color').value = hex;
    // Update UI highlights
    const items = document.querySelectorAll('#role-color-picker div');
    items.forEach(item => {
        item.classList.remove('border-white', 'ring-2', 'ring-brand-default/40');
        item.classList.add('border-transparent');
        item.style.transform = 'scale(1)';
    });
    el.classList.add('border-white', 'ring-2', 'ring-brand-default/40');
    el.classList.remove('border-transparent');
    el.style.transform = 'scale(1.1)';
}

document.getElementById('role-form').addEventListener('submit', async(e) => {
    e.preventDefault();
    const payload = {
        name: document.getElementById('role-name').value,
        color: document.getElementById('role-color').value,
        task_id: document.getElementById('role-task').value
    };
    try {
        await apiCall(`/projects/${activeProjectId}/roles`, 'POST', payload);
        document.getElementById('role-modal').classList.add('hidden-pane');
        loadProjects();
    } catch(err) { alert(err.message); }
});

