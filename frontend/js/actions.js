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

