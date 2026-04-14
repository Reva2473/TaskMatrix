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
    'Viewer': 'Read-only access. Can only observe project progress, read tasks, and view remarks.'
};

actionRole.addEventListener('change', (e) => {
    actionRoleDesc.textContent = roleDescriptions[e.target.value] || 'Custom role strictly bound to a task subtree.';
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
    
    // Populate Role options
    const p = activeProjectId ? allProjects.find(x => x.id === activeProjectId) : null;
    let customRoleHtml = '';
    if(p && p.custom_roles) {
        customRoleHtml = p.custom_roles.map(cr => `<option value="${cr.name}">${cr.name}</option>`).join('');
    }
    actionRole.innerHTML = `
        <option value="Admin">Admin</option>
        <option value="Viewer">Viewer</option>
        ${customRoleHtml}
    `;
    
    if(actionType === 'checkbox') {
        actionCheckboxSec.classList.remove('hidden-pane');
        actionCheckbox.checked = false;
    } else if(actionType === 'input_role') {
        actionInputSec.classList.remove('hidden-pane');
        actionRoleSec.classList.remove('hidden-pane');
        actionInput.value = '';
        actionRole.value = 'Viewer';
        actionRoleDesc.textContent = roleDescriptions['Viewer'];
    } else if(actionType === 'edit_role') {
        actionRoleSec.classList.remove('hidden-pane');
        actionRole.value = config.defaultRole || 'Viewer';
        actionRoleDesc.textContent = roleDescriptions[actionRole.value] || 'Custom role strictly bound to a task subtree.';
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

function renderRoles(roles) {
    const list = document.getElementById('project-roles-list');
    
    if (!roles || roles.length === 0) {
        list.innerHTML = '<div class="text-xs text-dark-muted italic text-center p-8 bg-dark-base/50 rounded-lg border border-dashed border-dark-border">No custom roles created.</div>';
        return;
    }

    list.innerHTML = roles.map(r => {
        // Find matching task for this role
        const taskObj = allTasks.find(t => t.id === r.task_id);
        const taskName = taskObj ? taskObj.title : (r.task_id ? `Task ID: ${r.task_id}` : "Missing Task/Branch");
        
        // Find members assigned to this role (excluding admin/viewer)
        const p = activeProjectId ? allProjects.find(x => x.id === activeProjectId) : null;
        const roleMembers = p ? p.members.filter(m => m.role === r.name) : [];
        const memberListHtml = roleMembers.length > 0 
           ? `<div class="mt-3 bg-dark-panel p-2.5 rounded-lg border border-dark-border/50">
                <div class="text-[9px] text-dark-muted mb-2 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75"></path></svg>
                    Assigned Members (${roleMembers.length})
                </div>
                <div class="flex flex-wrap gap-1.5">
                    ${roleMembers.map(m => `
                        <div class="flex items-center gap-1.5 bg-dark-base border border-dark-hover px-2 py-1 rounded-md shadow-sm">
                            <div class="w-1.5 h-1.5 rounded-full" style="background-color: ${r.color}"></div>
                            <span class="text-[10px] text-white font-medium">${m.username}</span>
                        </div>
                    `).join('')}
                </div>
              </div>`
           : `<div class="mt-3 text-[10px] text-dark-muted italic px-1 flex items-center gap-1.5">
                <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                No users assigned to this role yet.
              </div>`;

        return `
        <div class="bg-dark-base border border-dark-border p-4 rounded-xl flex flex-col gap-3 shadow-md hover:border-dark-hover transition-colors group">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-3.5 h-3.5 rounded-full border border-white/20" style="background-color: ${r.color}"></div>
                    <span class="text-xs font-bold text-white uppercase tracking-tight">${r.name}</span>
                </div>
                <button onclick="deleteCustomRole('${r.id}')" class="text-dark-muted group-hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg transition-all" title="Delete Role">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
            <div class="pt-2 border-t border-dark-border/50">
                <div class="text-[10px] text-dark-muted mb-1 font-bold uppercase tracking-wider">Root Access</div>
                <div class="flex items-center gap-2 bg-dark-panel p-2 rounded-lg border border-dark-border group-hover:bg-dark-base transition-colors overflow-hidden">
                    <svg class="text-brand-default shrink-0" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    <span class="text-[11px] text-white truncate font-medium">${taskName}</span>
                </div>
            </div>
            ${memberListHtml}
        </div>
        `;
    }).join("");
}

window.switchTab = function(tabName) {
    const workflowBtn = document.getElementById('tab-btn-workflow');
    const manageBtn = document.getElementById('tab-btn-manage');
    const paneWorkflow = document.getElementById('pane-workflow');
    const paneManage = document.getElementById('pane-manage');

    if(tabName === 'workflow') {
        workflowBtn.className = "text-sm font-bold border-b-2 border-brand-default text-brand-default px-1 py-3 transition-colors text-white";
        manageBtn.className = "text-sm font-medium border-b-2 border-transparent text-dark-muted hover:text-white px-1 py-3 transition-colors";
        paneWorkflow.classList.remove('hidden-pane');
        paneManage.classList.add('hidden-pane');
    } else {
        workflowBtn.className = "text-sm font-medium border-b-2 border-transparent text-dark-muted hover:text-white px-1 py-3 transition-colors";
        manageBtn.className = "text-sm font-bold border-b-2 border-brand-default text-brand-default px-1 py-3 transition-colors text-white";
        paneWorkflow.classList.add('hidden-pane');
        paneManage.classList.remove('hidden-pane');
    }
}

