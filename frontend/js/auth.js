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

