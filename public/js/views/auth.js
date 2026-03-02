// views/auth.js — Login, registration, password reset

TerminalApp.prototype.renderResetPassword = function (resetToken) {
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

TerminalApp.prototype.renderLogin = function () {
    this.appEl.innerHTML = `
        <div class="auth-container animate-mount">
            <div class="auth-landing">
                <!-- LEFT: Feature Highlights + Top Rated -->
                <div class="auth-showcase">
                    <!-- Feature Highlights -->
                    <div class="showcase-section animate-stagger" style="animation-delay: 0.1s;">
                        <h3 class="showcase-title">\u{1F680} What is Data Toyz?</h3>
                        <p style="color:var(--text-secondary); font-size:0.9rem; line-height:1.6; margin-bottom:1.25rem;">The community-powered platform for tracking action figure trade values in real time.</p>
                        <div class="feature-grid">
                            <div class="feature-card">
                                <div class="feature-icon">\u{1F4CA}</div>
                                <div class="feature-label">Track Values</div>
                                <div class="feature-desc">Real-time trade values and market signals for your collection</div>
                            </div>
                            <div class="feature-card">
                                <div class="feature-icon">\u{1F4DD}</div>
                                <div class="feature-label">Submit Intel</div>
                                <div class="feature-desc">Grade figures and contribute pricing data to the community</div>
                            </div>
                            <div class="feature-card">
                                <div class="feature-icon">\u{1F3C6}</div>
                                <div class="feature-label">Rankings</div>
                                <div class="feature-desc">Leaderboards, top-rated figures, and analyst rankings</div>
                            </div>
                            <div class="feature-card">
                                <div class="feature-icon">\u{1F4E1}</div>
                                <div class="feature-label">Market Signals</div>
                                <div class="feature-desc">Buy, hold, or sell signals driven by community assessments</div>
                            </div>
                        </div>
                    </div>

                    <!-- Top Rated Toys -->
                    <div class="showcase-section animate-stagger" style="animation-delay: 0.25s;">
                        <h3 class="showcase-title">\u{1F3C6} Top Rated Toys</h3>
                        <div id="loginTopRated">
                            <div class="showcase-loading">Loading top rated toys...</div>
                        </div>
                        <a href="#" id="viewFullLeaderboardLink" style="display:block; text-align:center; margin-top:1rem; color:var(--accent); font-size:0.9rem; font-weight:600; text-decoration:none; opacity:0.85; transition:opacity 0.2s;">View Full Leaderboard &rarr;</a>
                    </div>
                </div>

                <!-- RIGHT: Login Panel -->
                <div class="auth-panel">
                    <div class="brand-header">
                        <img src="logo.png" alt="Data Toyz Logo" style="max-height: 120px; width: auto; margin-bottom: 1rem; filter: drop-shadow(0 0 20px rgba(255, 42, 95, 0.4));">
                        <h1 class="glow-text">Data Toyz</h1>
                        <p>Trade Value &amp; Risk Terminal</p>
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
                            <div style="margin-top:1.5rem; padding-top:1.5rem; border-top:1px solid var(--border-light); text-align:center;">
                                <button type="button" id="demoModeBtn" class="btn" style="width:100%; background:linear-gradient(135deg, #6366f1, #a855f7);">Try Demo Mode</button>
                                <p style="margin-top:0.5rem; font-size:0.75rem; color:var(--text-muted);">Explore all features with sample data. No account needed &mdash; nothing is saved.</p>
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
        </div>
    `;

    // --- Fetch and render live public data for the showcase ---
    this._loadLoginShowcase();

    document.getElementById('viewFullLeaderboardLink').addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.setItem('postLoginView', 'figure_leaderboard');
        document.getElementById('loginUsername').focus();
    });

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

    document.getElementById('demoModeBtn').addEventListener('click', () => {
        app.enterDemoMode();
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

            // Check for post-login view redirect (e.g. "View Full Leaderboard" link)
            const postLoginView = sessionStorage.getItem('postLoginView');
            if (postLoginView) {
                this.currentView = postLoginView;
                sessionStorage.removeItem('postLoginView');
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

// --- Login Showcase: fetch and render Top Rated Toys ---
TerminalApp.prototype._loadLoginShowcase = async function () {
    let figures = [];
    try {
        const res = await fetch(`${API_URL}/figures/top-rated`);
        if (res.ok) figures = await res.json();
    } catch (e) {
        console.error('Failed fetching top rated figures', e);
    }

    const el = document.getElementById('loginTopRated');
    if (!el) return;

    if (figures.length === 0) {
        el.innerHTML = '<div class="showcase-loading">No rated toys yet — be the first to submit intel!</div>';
        return;
    }

    const rankIcons = ['🥇', '🥈', '🥉'];
    el.innerHTML = figures.map((fig, i) => {
        const grade = parseFloat(fig.avgGrade);
        const gradeColor = grade >= 85 ? 'var(--success)' : grade >= 70 ? 'var(--neutral)' : grade >= 50 ? '#eab308' : 'var(--danger)';
        const tierClass = (fig.classTie || '').toLowerCase().replace(/\s+/g, '');

        return `
            <div class="tr-row animate-stagger" style="animation-delay: ${0.08 * i}s;">
                <span class="tr-rank">${i < 3 ? rankIcons[i] : '<span class="tr-rank-num">' + (i + 1) + '</span>'}</span>
                <div class="tr-info">
                    <div class="tr-name">${escapeHTML(fig.name)}</div>
                    <div class="tr-meta">
                        <span class="tr-brand">${escapeHTML(fig.brand || '')}</span>
                        <span class="tier-badge ${escapeHTML(tierClass)}">${escapeHTML(fig.classTie || '')}</span>
                    </div>
                </div>
                <div class="tr-score">
                    <span class="tr-grade" style="color:${gradeColor};">${fig.avgGrade}</span>
                    <span class="tr-subs">${fig.submissions} ${fig.submissions === 1 ? 'review' : 'reviews'}</span>
                </div>
            </div>
        `;
    }).join('');
};
