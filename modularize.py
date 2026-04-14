import os
import re

src = "frontend/script.js"
with open(src, "r", encoding="utf-8") as f:
    content = f.read()

# We will use normal modules but bind everything to window to preserve compatibility
# Actually, exporting shared state and functions explicitly is better.

# To be safe, we'll split by major sections if they exist in the comments:
# // Auth Elements
# // -------------------------
# // Authentication
# // -------------------------
# // Projects Navigation
# // -------------------------
# // Action Triggers
# // -------------------------
# // Tasks Core
# // -------------------------
# // Custom Modal
# // -------------------------

sections = {
    "globals": """
export const API_URL = window.location.hostname.includes('vercel.app') || (window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:') ? '/api' : 'http://127.0.0.1:5000/api';

export const state = {
    token: localStorage.getItem('collabtask_token'),
    currentUser: JSON.parse(localStorage.getItem('collabtask_user')),
    isLogin: true,
    activeProjectId: null,
    projectMembers: [],
    userRoleInProject: 'Viewer',
    allProjects: [],
    allTasks: []
};
""",
}
