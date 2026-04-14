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

