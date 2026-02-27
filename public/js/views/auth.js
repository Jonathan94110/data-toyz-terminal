// views/auth.js — Login, registration, password reset

TerminalApp.prototype.renderResetPassword = function(resetToken) {
    this.appEl.innerHTML = `
        <div class="auth-container animate-mount">
            <div class="auth-panel">
                <div class="brand-header">
                    <img src="logo.png" alt="Data Toyz Logo" style="max-height: 120px; width: auto; margin-bottom: 1rem; filter: drop-shadow(0 0 20px rgba(255, 42, 95, 0.4));">
                    <h1 class="glow-text">Data Toyz</h1>
                    <p>Reset Your Password</p>
                </div>
                <form id="resetPasswordForm">
                    <div class="input-group">
                        <label for="newPassword">New Password</label>
                        <input type="password" id="newPassword" placeholder="Enter new password (min 6 chars)..." required minlength="6">
                    </div>
                    <div class="input-group">
                        <label for="confirmPassword">Confirm Password</label>
                        <input type="password" id="confirmPassword" placeholder="Confirm new password..." required minlength="6">
                    </div>
                    <button type="submit" class="btn">Reset Password</button>
                </form>
                <div id="resetMessage" style="margin-top:1rem; text-align:center;"></div>
            </div>
        </div>
    `;

    document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        if (newPassword !== confirmPassword) { alert('Passwords do not match.'); return; }

        try {
            const res = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, newPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            document.getElementById('resetMessage').innerHTML = `<p style="color:var(--success);">${escapeHTML(data.message)}</p><a href="/" style="color:var(--accent);">Return to Login</a>`;
            document.getElementById('resetPasswordForm').style.display = 'none';
        } catch (err) {
            alert(err.message);
        }
    });
};

TerminalApp.prototype.renderLogin = function() {
    this.appEl.innerHTML = `
        <div class="auth-container animate-mount">
            <div class="auth-panel">
                <div class="brand-header">
                    <img src="logo.png" alt="Data Toyz Logo" style="max-height: 120px; width: auto; margin-bottom: 1rem; filter: drop-shadow(0 0 20px rgba(255, 42, 95, 0.4));">
                    <h1 class="glow-text">Data Toyz</h1>
                    <p>Trade Value & Risk Terminal</p>
                </div>

                <div id="loginSection">
                    <form id="loginForm">
                        <div class="input-group">
                            <label for="loginUsername">Username</label>
                            <input type="text" id="loginUsername" name="username" placeholder="Enter your username..." required autocomplete="username">
                        </div>
                        <div class="input-group">
                            <label for="loginPassword">Password</label>
                            <input type="password" id="loginPassword" placeholder="••••••••" required>
                        </div>
                        <button type="submit" class="btn">Authenticate</button>
                        <div style="margin-top:1.5rem; text-align:center; font-size:0.9rem; display:flex; flex-direction:column; gap:0.5rem;">
                            <a href="#" id="showRegisterBtn" style="color:var(--accent); text-decoration:none;">Register Account</a>
                            <a href="#" id="showForgotBtn" style="color:var(--text-muted); text-decoration:none;">Forgot Password?</a>
                        </div>
                    </form>
                </div>

                <div id="registerSection" style="display:none;">
                    <form id="registerForm">
                        <div class="input-group">
                            <label for="regUsername">New Username</label>
                            <input type="text" id="regUsername" required autocomplete="off">
                        </div>
                        <div class="input-group">
                            <label for="regEmail">Secure Email</label>
                            <input type="email" id="regEmail" required autocomplete="email">
                        </div>
                        <div class="input-group">
                            <label for="regPassword">Password</label>
                            <input type="password" id="regPassword" placeholder="••••••••" required>
                        </div>
                        <button type="submit" class="btn" style="background:var(--success); color:#000;">Register Identity</button>
                        <div style="margin-top:1.5rem; text-align:center; font-size:0.9rem;">
                            <a href="#" id="showLoginBtn" style="color:var(--text-secondary); text-decoration:none;">Return to Authentication</a>
                        </div>
                    </form>
                </div>

                <div id="forgotSection" style="display:none;">
                    <form id="forgotForm">
                        <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Enter your registered email. If an account exists, we'll send a reset link.</p>
                        <div class="input-group">
                            <label for="forgotEmail">Registered Email</label>
                            <input type="email" id="forgotEmail" required autocomplete="email">
                        </div>
                        <button type="submit" class="btn" style="background:#eab308; color:#000;">Send Reset Link</button>
                        <div id="forgotMessage" style="margin-top:1rem; text-align:center;"></div>
                        <div style="margin-top:1.5rem; text-align:center; font-size:0.9rem;">
                            <a href="#" id="showLoginFromForgotBtn" style="color:var(--text-secondary); text-decoration:none;">Return to Authentication</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.getElementById('showRegisterBtn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('registerSection').style.display = 'block';
    });

    document.getElementById('showLoginBtn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('registerSection').style.display = 'none';
        document.getElementById('loginSection').style.display = 'block';
    });

    document.getElementById('showForgotBtn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('forgotSection').style.display = 'block';
    });

    document.getElementById('showLoginFromForgotBtn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('forgotSection').style.display = 'none';
        document.getElementById('loginSection').style.display = 'block';
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Authentication Failed');

            this.token = data.token;
            this.user = data;
            localStorage.setItem('terminal_token', data.token);
            await this.loadFigures();

            // Preserve deep-link from URL (e.g. email notification click-through)
            const urlParams = new URLSearchParams(window.location.search);
            const figureParam = urlParams.get('figure');
            if (figureParam) {
                const fId = parseInt(figureParam);
                const target = MOCK_FIGURES.find(f => f.id == fId);
                if (target) { this.currentTarget = target; this.currentView = 'pulse'; }
            }
            // Preserve shared post deep-link
            const postParam = urlParams.get('post');
            if (postParam) {
                sessionStorage.setItem('sharedPostId', postParam);
                this.currentView = 'feed';
            }

            this.renderApp();
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById('forgotForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value.trim();

        try {
            const res = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            document.getElementById('forgotMessage').innerHTML = `<p style="color:var(--success); font-size:0.85rem;">\u2713 ${escapeHTML(data.message)}</p>`;
            document.getElementById('forgotForm').querySelector('button').disabled = true;
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;

        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration Failed');

            this.token = data.token;
            this.user = data;
            localStorage.setItem('terminal_token', data.token);
            await this.loadFigures();
            this.renderApp();
        } catch (err) {
            alert(err.message);
        }
    });
};
