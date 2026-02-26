// app.js

const API_URL = '/api';
let MOCK_FIGURES = [];

// PWA: Unregister stale service workers (SW disabled during active development)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
    });
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

// PWA: Capture install prompt
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Show install button in sidebar if it exists
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) installBtn.style.display = 'flex';
});

// Render @mentions as clickable links (runs AFTER escapeHTML for XSS safety)
function renderMentions(text) {
    return escapeHTML(text).replace(/@(\w+)/g, (match, username) => {
        return `<span class="mention-link user-link" onclick="event.stopPropagation(); app.viewUserProfile('${username}')" style="color:var(--accent); cursor:pointer; font-weight:600;">@${username}</span>`;
    });
}

// S-6: XSS Prevention — escape HTML entities in user-generated content
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

class TerminalApp {
    get currentView() {
        return sessionStorage.getItem('terminalView') || 'feed';
    }
    set currentView(val) {
        sessionStorage.setItem('terminalView', val);
    }

    get currentTarget() {
        const t = sessionStorage.getItem('terminalTarget');
        return t ? JSON.parse(t) : null;
    }
    set currentTarget(val) {
        if (val) sessionStorage.setItem('terminalTarget', JSON.stringify(val));
        else sessionStorage.removeItem('terminalTarget');
    }

    constructor() {
        this.appEl = document.getElementById('app');

        // Theme init
        const savedTheme = localStorage.getItem('terminal_theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);

        this.token = localStorage.getItem('terminal_token') || null;
        this.user = null;
        this.previousView = null;
        this.editingSubmission = null;

        // Clean up old storage format
        localStorage.removeItem('terminal_user');

        this.init();
    }

    async init() {
        // Check for password reset token in URL
        const urlParams = new URLSearchParams(window.location.search);
        const resetToken = urlParams.get('reset');
        if (resetToken) {
            this.renderResetPassword(resetToken);
            return;
        }

        if (!this.token) {
            this.renderLogin();
            return;
        }

        try {
            const res = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (!res.ok) throw new Error('Session expired');
            this.user = await res.json();
            await this.loadFigures();

            // Deep-link support: ?figure=ID
            const figureParam = urlParams.get('figure');
            if (figureParam) {
                const fId = parseInt(figureParam);
                const target = MOCK_FIGURES.find(f => f.id == fId);
                if (target) {
                    this.currentTarget = target;
                    this.currentView = 'pulse';
                }
            }

            // Deep-link support: ?post=ID (shared post link)
            const postParam = urlParams.get('post');
            if (postParam) {
                sessionStorage.setItem('sharedPostId', postParam);
                this.currentView = 'feed';
            }

            this.renderApp();
        } catch (e) {
            this.token = null;
            this.user = null;
            localStorage.removeItem('terminal_token');
            this.renderLogin();
        }
    }

    // Authenticated fetch helper
    async authFetch(url, options = {}) {
        if (!options.headers) options.headers = {};
        if (this.token && !(options.body instanceof FormData)) {
            if (!options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
        }
        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }
        const res = await fetch(url, options);
        if (res.status === 401) {
            this.token = null;
            this.user = null;
            localStorage.removeItem('terminal_token');
            this.renderLogin();
            throw new Error('Session expired. Please log in again.');
        }
        return res;
    }

    async loadFigures() {
        try {
            const res = await fetch(`${API_URL}/figures`);
            if (res.ok) MOCK_FIGURES = await res.json();
        } catch (e) {
            console.error("Failed to fetch figure catalog from backend", e);
        }
    }

    async compressImage(file, maxWidth = 1200, quality = 0.8) {
        return new Promise((resolve) => {
            if (!file || !file.type.startsWith('image/')) { resolve(file); return; }
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let w = img.width, h = img.height;
                if (w <= maxWidth) { resolve(file); return; }
                const ratio = maxWidth / w;
                w = maxWidth;
                h = Math.round(h * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    if (!blob || blob.size >= file.size) { resolve(file); return; }
                    const compressed = new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
                    resolve(compressed);
                }, 'image/webp', quality);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    }

    skeletonHTML(type, count = 4) {
        const s = (cls, style = '') => `<div class="skeleton ${cls}" ${style ? `style="${style}"` : ''}></div>`;
        if (type === 'cards') return `<div class="grid-2">${Array(count).fill(s('skeleton-card')).join('')}</div>`;
        if (type === 'feed') return Array(count).fill(s('skeleton-card', 'height:200px')).join('');
        if (type === 'rooms') return Array(count).fill(s('skeleton-room')).join('');
        if (type === 'stats') return `<div class="grid-2">${Array(count).fill(s('skeleton-stat')).join('')}</div>`;
        if (type === 'rows') return Array(count).fill(s('skeleton-row')).join('');
        if (type === 'profile') return `<div style="max-width:600px; margin:0 auto;"><div class="skeleton skeleton-avatar" style="margin:0 auto 1rem;"></div><div class="skeleton skeleton-line medium" style="margin:0 auto 0.5rem;"></div><div class="skeleton skeleton-line short" style="margin:0 auto;"></div><div class="skeleton skeleton-card" style="margin-top:2rem;height:200px;"></div></div>`;
        return s('skeleton-card');
    }

    renderResetPassword(resetToken) {
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
    }

    renderLogin() {
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
                document.getElementById('forgotMessage').innerHTML = `<p style="color:var(--success); font-size:0.85rem;">✓ ${escapeHTML(data.message)}</p>`;
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
    }

    renderApp() {
        this.appEl.innerHTML = `
            <div class="app-layout animate-mount">
                <aside class="sidebar">
                    <div class="sidebar-brand" style="cursor:pointer; display: flex; flex-direction: column; align-items: center; text-align: center;" onclick="app.currentView='feed'; app.renderApp();">
                        <img src="logo.png" alt="Data Toyz Logo" style="max-height: 120px; width: auto; margin-bottom: 0.5rem; filter: drop-shadow(0 0 10px rgba(255, 42, 95, 0.3));">

                    </div>
                    <nav class="sidebar-nav">
                        <div class="nav-item ${this.currentView === 'feed' ? 'active' : ''}" data-view="feed">
                            Comms Feed
                        </div>
                        <div class="nav-item ${this.currentView === 'rooms' || this.currentView === 'room_chat' ? 'active' : ''}" data-view="rooms" style="position:relative;">
                            Breakout Rooms
                            <span id="roomsBadge" style="display:none; position:absolute; right:1rem; top:50%; transform:translateY(-50%); background:var(--danger); color:#fff; font-size:0.6rem; font-weight:800; padding:1px 5px; border-radius:10px; min-width:16px; text-align:center;"></span>
                        </div>
                        <div class="nav-item ${this.currentView === 'market_pulse' ? 'active' : ''}" data-view="market_pulse">
                            Market Pulse
                        </div>
                        <div class="nav-item ${this.currentView === 'search' ? 'active' : ''}" data-view="search">
                            Target Search
                        </div>
                        <div class="nav-item ${this.currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
                            My Intel History
                        </div>
                        <div class="nav-item ${this.currentView === 'leaderboards' ? 'active' : ''}" data-view="leaderboards">
                            Global Leaderboard
                        </div>
                        <div class="nav-item ${this.currentView === 'profile' ? 'active' : ''}" data-view="profile">
                            Profile Settings
                        </div>
                        <div class="nav-item ${this.currentView === 'docs' ? 'active' : ''}" data-view="docs">
                            Documentation
                        </div>
                        ${(this.user.role === 'admin' || this.user.username === 'Prime Dynamixx') ? `
                        <div class="nav-item ${this.currentView === 'admin' ? 'active' : ''}" data-view="admin" style="margin-top:1rem; border-top:1px solid var(--border-light); padding-top:1rem;">
                            ⚙️ Admin Panel
                        </div>
                        ` : ''}
                        <div id="pwaInstallBtn" class="nav-item" style="margin-top:auto; border-top:1px solid var(--border-light); padding-top:1rem; display:${deferredInstallPrompt ? 'flex' : 'none'}; color:var(--accent);">
                            📲 Install App
                        </div>
                        <div id="themeToggle" class="nav-item" style="${deferredInstallPrompt ? '' : 'margin-top:auto; '}border-top:1px solid var(--border-light); padding-top:1rem; opacity:0.7;">
                            ${document.body.getAttribute('data-theme') === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
                        </div>
                    </nav>
                </aside>
                
                <div class="sidebar-overlay" id="sidebarOverlay"></div>
                <main class="main-content">
                    <header class="topbar">
                        <button class="hamburger-btn" id="hamburgerBtn" aria-label="Toggle menu">☰</button>
                        <div class="user-profile">
                            <div id="notifBell" style="position:relative; cursor:pointer; margin-right:1rem; padding:0.5rem;">
                                <span style="font-size:1.3rem;">🔔</span>
                                <span id="notifBadge" style="display:none; position:absolute; top:0; right:0; background:var(--danger); color:#fff; font-size:0.6rem; font-weight:800; padding:1px 5px; border-radius:10px; min-width:16px; text-align:center;"></span>
                                <div id="notifDropdown" class="notif-dropdown" style="display:none;"></div>
                            </div>
                            ${this.user.avatar ? `<img src="${this.user.avatar}" class="user-avatar" style="object-fit:cover; border:none; background:transparent;" onerror="this.onerror=null; this.outerHTML='<div class=\\'user-avatar\\'>${escapeHTML(this.user.username).charAt(0).toUpperCase()}</div>';">` : `<div class="user-avatar">${escapeHTML(this.user.username).charAt(0).toUpperCase()}</div>`}
                            <div style="line-height:1.2;">
                                <div style="font-weight:600; font-size:0.95rem;">${escapeHTML(this.user.username)}</div>
                                <div style="font-size:0.75rem; color:${(this.user.role === 'admin' || this.user.username === 'Prime Dynamixx') ? '#fbbf24' : 'var(--accent)'}; text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">${(this.user.role === 'admin' || this.user.username === 'Prime Dynamixx') ? '★ Admin' : 'Analyst'}</div>
                            </div>
                            <button id="logoutBtn" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; margin-left:1.5rem; font-size:0.85rem; transition:color 0.2s;">[ Exit ]</button>
                        </div>
                    </header>
                    <div class="content-area" id="mainContent">
                    </div>
                </main>
            </div>
        `;

        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.addEventListener('click', (e) => {
                this.currentView = e.currentTarget.dataset.view;
                this.renderApp();
            });
        });

        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // PWA Install button
        const pwaBtn = document.getElementById('pwaInstallBtn');
        if (pwaBtn) {
            pwaBtn.addEventListener('click', async () => {
                if (!deferredInstallPrompt) return;
                deferredInstallPrompt.prompt();
                const { outcome } = await deferredInstallPrompt.userChoice;
                if (outcome === 'accepted') {
                    deferredInstallPrompt = null;
                    pwaBtn.style.display = 'none';
                }
            });
        }

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', (e) => {
            e.stopPropagation();
            const current = document.body.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', next);
            localStorage.setItem('terminal_theme', next);
            this.renderApp();
        });

        // Notification bell
        const bell = document.getElementById('notifBell');
        const dropdown = document.getElementById('notifDropdown');
        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.style.display === 'none') {
                this.loadNotifications();
                dropdown.style.display = 'block';
            } else {
                dropdown.style.display = 'none';
            }
        });
        document.addEventListener('click', () => { dropdown.style.display = 'none'; }, { once: true });

        // Mobile hamburger menu
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const sidebar = document.querySelector('.sidebar');
        if (hamburgerBtn && sidebar) {
            hamburgerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('open');
                sidebarOverlay.classList.toggle('active');
            });
            sidebarOverlay.addEventListener('click', () => {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            });
        }
        // Close sidebar on nav-item click (mobile)
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.addEventListener('click', () => {
                if (sidebar) sidebar.classList.remove('open');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            });
        });

        // Poll notifications
        if (this._notifInterval) clearInterval(this._notifInterval);
        this._notifInterval = setInterval(() => this.updateNotifBadge(), 30000);
        this.updateNotifBadge();

        // Poll rooms unread badge
        if (this._roomsPollInterval) clearInterval(this._roomsPollInterval);
        this._roomsPollInterval = setInterval(() => this.updateRoomsBadge(), 15000);
        this.updateRoomsBadge();

        this.renderCurrentView();
    }

    renderCurrentView() {
        const contentArea = document.getElementById('mainContent');
        // Clear chat polling when leaving room_chat
        if (this.currentView !== 'room_chat' && this._chatPollInterval) {
            clearInterval(this._chatPollInterval);
            this._chatPollInterval = null;
        }

        if (this.currentView === 'feed') this.renderFeed(contentArea);
        else if (this.currentView === 'rooms') this.renderRoomsList(contentArea);
        else if (this.currentView === 'room_chat') this.renderRoomChat(contentArea);
        else if (this.currentView === 'market_pulse') this.renderMarketPulse(contentArea);
        else if (this.currentView === 'search') this.renderSearch(contentArea);
        else if (this.currentView === 'dashboard') this.renderDashboard(contentArea);
        else if (this.currentView === 'leaderboards') this.renderLeaderboards(contentArea);
        else if (this.currentView === 'pulse') this.renderPulse(contentArea);
        else if (this.currentView === 'submission') this.renderSubmission(contentArea);
        else if (this.currentView === 'add_target') this.renderAddTarget(contentArea);
        else if (this.currentView === 'profile') this.renderProfile(contentArea);
        else if (this.currentView === 'user_profile') this.renderUserProfile(contentArea);
        else if (this.currentView === 'docs') this.renderDocs(contentArea);
        else if (this.currentView === 'admin' && (this.user.role === 'admin' || this.user.username === 'Prime Dynamixx')) this.renderAdmin(contentArea);
    }

    async renderFeed(container) {
        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('feed', 3)}</div>`;

        let posts = [];
        try {
            // Use authFetch so admin users get flag counts
            const res = await this.authFetch(`${API_URL}/posts`);
            if (res.ok) posts = await res.json();
        } catch (e) {
            console.error("Failed fetching posts", e);
        }

        // Handle shared post deep-link
        let sharedPostId = sessionStorage.getItem('sharedPostId');
        if (sharedPostId) {
            sessionStorage.removeItem('sharedPostId');
            const sharedIdx = posts.findIndex(p => p.id == sharedPostId);
            if (sharedIdx > 0) {
                const [shared] = posts.splice(sharedIdx, 1);
                posts.unshift(shared);
            }
        }

        let feedHtml = `
            <div style="max-width: 600px; margin: 0 auto; padding-bottom: 3rem;">
                <div style="margin-bottom:2rem; text-align:center;">
                    <h2 style="font-size:2.5rem; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em;">Global Comms</h2>
                    <p style="color:var(--text-secondary); font-size:1.1rem;">Live operative intelligence chatter and market sentiment.</p>
                </div>

                <!-- NEW POST FORM -->
                <div class="card" style="margin-bottom:3rem; padding:1.5rem;">
                    <form id="postForm">
                        <textarea id="postContent" required placeholder="Broadcast your field observations... (e.g., 'Just handled the new DX9 test shot. Joints are incredibly tight.')" style="width:100%; height:100px; padding:1rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); margin-bottom:1rem; font-family:var(--font-body); resize:vertical;"></textarea>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                            <div>
                                <label for="postImage" style="cursor:pointer; padding:0.5rem 1rem; border:1px solid var(--border-light); border-radius:var(--radius-sm); font-size:0.9rem; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-light)'">
                                    📸 Attach Evidence
                                </label>
                                <input type="file" id="postImage" accept="image/*" style="display:none;" onchange="document.getElementById('imgName').innerText = this.files[0] ? this.files[0].name : ''">
                                <span id="imgName" style="margin-left:0.5rem; font-size:0.8rem; color:var(--accent);"></span>
                            </div>
                            
                            <div class="segmented-control" style="margin:0; min-width:300px;">
                                <label class="risk-bullish" style="padding:0.5rem;">
                                    <input type="radio" name="sentiment" value="fire" required>
                                    <span style="font-size:1.1rem; white-space:nowrap;">🔥 HOT</span>
                                </label>
                                <label class="risk-neutral" style="padding:0.5rem;">
                                    <input type="radio" name="sentiment" value="fence" required>
                                    <span style="font-size:1.1rem; white-space:nowrap;">🤷 FENCE</span>
                                </label>
                                <label class="risk-bearish" style="padding:0.5rem;">
                                    <input type="radio" name="sentiment" value="ice" required>
                                    <span style="font-size:1.1rem; white-space:nowrap;">🧊 NOT</span>
                                </label>
                            </div>
                        </div>
                        
                        <button type="submit" class="btn" style="width:100%;">Transmit Broadcast</button>
                    </form>
                </div>

                <!-- TIMELINE FEED -->
                <div id="timeline">
        `;

        if (posts.length === 0) {
            feedHtml += `<div style="text-align:center; color:var(--text-muted); padding:2rem;" class="animate-mount">No broadcasts detected on the secure network.</div>`;
        } else {
            posts.forEach((p, index) => {
                const isFire = p.sentiment === 'fire';
                const isFence = p.sentiment === 'fence';
                const badgeColor = isFire ? '#ef4444' : isFence ? '#f59e0b' : '#3b82f6';
                const badgeGlow = isFire ? 'rgba(239, 68, 68, 0.2)' : isFence ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                const badgeIcon = isFire ? '🔥' : isFence ? '🤷' : '🧊';
                const dateStr = new Date(p.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

                let commentsHtml = '';
                if (p.comments && p.comments.length > 0) {
                    commentsHtml = '<div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-light);">';
                    p.comments.forEach(c => {
                        const cDate = new Date(c.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                        commentsHtml += `
                            <div style="margin-bottom: 0.75rem; padding-left: 1rem; border-left: 2px solid var(--border-light);">
                                <div style="display:flex; justify-content:space-between; margin-bottom: 0.25rem;">
                                    <span style="font-weight:700; font-size: 0.9rem; color:${this.user.username === c.author ? 'var(--accent)' : 'var(--text-primary)'};" class="user-link" onclick="event.stopPropagation(); app.viewUserProfile('${escapeHTML(c.author).replace(/'/g, "\\'")}')">${escapeHTML(c.author)}</span>
                                    <span style="font-size:0.7rem; color:var(--text-muted);">${cDate}</span>
                                </div>
                                <div style="font-size:0.9rem; color:var(--text-secondary); white-space:pre-wrap;">${renderMentions(c.content)}</div>
                            </div>
                        `;
                    });
                    commentsHtml += '</div>';
                }

                let likes = 0, hearts = 0, lmaos = 0, sads = 0, mehs = 0;
                let myReaction = null;
                if (p.reactions) {
                    p.reactions.forEach(r => {
                        if (r.emoji === 'like') likes++;
                        else if (r.emoji === 'heart') hearts++;
                        else if (r.emoji === 'lmao') lmaos++;
                        else if (r.emoji === 'sad') sads++;
                        else if (r.emoji === 'meh') mehs++;

                        if (r.author === this.user.username) myReaction = r.emoji;
                    });
                }

                const rBtnStyle = (type) => `
                    background: ${myReaction === type ? 'var(--bg-panel)' : 'transparent'};
                    border: 1px solid ${myReaction === type ? 'var(--accent)' : 'var(--border-light)'};
                    color: ${myReaction === type ? 'var(--accent)' : 'var(--text-secondary)'};
                    padding: 0.35rem 0.6rem;
                    border-radius: 1rem;
                    font-size: 0.9rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.3rem;
                    transition: all 0.2s;
                `;

                const reactionsHtml = `
                    <div style="display:flex; gap:0.5rem; margin-top:1rem; padding-top:0.75rem; flex-wrap:wrap;">
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="like" style="${rBtnStyle('like')}">👍 ${likes}</button>
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="heart" style="${rBtnStyle('heart')}">❤️ ${hearts}</button>
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="lmao" style="${rBtnStyle('lmao')}">😂 ${lmaos}</button>
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="sad" style="${rBtnStyle('sad')}">😢 ${sads}</button>
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="meh" style="${rBtnStyle('meh')}">😐 ${mehs}</button>
                    </div>
                `;

                const replyFormHtml = `
                    <form class="replyForm" data-postid="${p.id}" style="margin-top:1rem; display:flex; gap:0.5rem;">
                        <input type="text" class="replyContent" required placeholder="Write a reply..." style="flex:1; padding:0.5rem 0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.9rem;">
                        <button type="submit" class="btn" style="padding:0.5rem 1rem; font-size:0.85rem; background:var(--bg-surface); border:1px solid var(--border-light); color:var(--text-secondary);">Reply</button>
                    </form>
                `;

                const isSharedPost = sharedPostId && p.id == sharedPostId;
                const isMyPost = p.author === this.user.username;
                const isAdmin = this.user.role === 'admin';

                // Post action buttons (edit/delete for author, admin delete, flag, share)
                let postActionsHtml = '<div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">';
                if (isMyPost) {
                    postActionsHtml += `
                        <button class="editPostBtn" data-postid="${p.id}" style="background:none; border:1px solid var(--border-light); color:var(--text-muted); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;">✏️ Edit</button>
                        <button class="deletePostBtn" data-postid="${p.id}" style="background:none; border:1px solid var(--border-light); color:var(--text-muted); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;">🗑️</button>
                    `;
                } else if (isAdmin) {
                    postActionsHtml += `
                        <button class="deletePostBtn" data-postid="${p.id}" style="background:none; border:1px solid var(--danger, #ef4444); color:var(--danger, #ef4444); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;">🗑️ Admin</button>
                    `;
                }
                if (!isMyPost) {
                    postActionsHtml += `<button class="flagPostBtn" data-postid="${p.id}" style="background:none; border:none; color:var(--text-muted); font-size:0.75rem; cursor:pointer; padding:0.25rem 0;">🚩 Report</button>`;
                }
                postActionsHtml += `<button class="sharePostBtn" data-postid="${p.id}" style="background:none; border:none; color:var(--text-muted); font-size:0.75rem; cursor:pointer; padding:0.25rem 0;">📋 Share</button>`;
                if (isAdmin && p.flagCount) {
                    postActionsHtml += `<span style="color:var(--danger, #ef4444); font-size:0.75rem; font-weight:600; margin-left:auto;">⚠️ ${p.flagCount} flag${p.flagCount > 1 ? 's' : ''}</span>`;
                }
                postActionsHtml += '</div>';

                feedHtml += `
                    <div class="card feed-item animate-stagger" style="margin-bottom:1.5rem; padding:1.5rem; border-left: 4px solid ${badgeColor}; animation-delay: ${index * 0.08}s;${isSharedPost ? ' box-shadow: 0 0 20px rgba(255, 42, 95, 0.3); border: 1px solid var(--accent);' : ''}">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                            <div>
                                <div style="font-weight:800; font-size:1.1rem; color:${this.user.username === p.author ? 'var(--accent)' : 'var(--text-primary)'};" class="user-link" onclick="event.stopPropagation(); app.viewUserProfile('${escapeHTML(p.author).replace(/'/g, "\\'")}')">${escapeHTML(p.author)}</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">${dateStr}${p.editedAt ? ' <span style="color:var(--text-muted); font-style:italic;">(edited)</span>' : ''}</div>
                            </div>
                            <div style="background:${badgeGlow}; color:${badgeColor}; border:1px solid ${badgeColor}; padding:0.25rem 0.75rem; border-radius:1rem; font-weight:800; font-size:0.85rem; box-shadow: 0 0 10px ${badgeGlow}; text-transform:uppercase;">
                                ${badgeIcon} ${escapeHTML(p.sentiment)}
                            </div>
                        </div>
                        <p class="post-content" style="font-size:1rem; line-height:1.6; color:var(--text-primary); margin-bottom:${p.imagePath ? '1rem' : '0'}; white-space:pre-wrap;">${renderMentions(p.content)}</p>
                        ${p.imagePath ? `<img src="${p.imagePath}" style="max-width:100%; border-radius:var(--radius-sm); border:1px solid var(--border); max-height:400px; object-fit:contain; background:var(--bg-surface); display:block;">` : ''}
                        ${postActionsHtml}
                        ${reactionsHtml}
                        ${commentsHtml}
                        ${replyFormHtml}
                    </div>
                `;
            });
        }

        feedHtml += `
            </div></div>
        `;

        container.innerHTML = feedHtml;

        document.getElementById('postForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = document.getElementById('postContent').value.trim();
            const sentiment = document.querySelector('input[name="sentiment"]:checked').value;
            let imageFile = document.getElementById('postImage').files[0];
            if (imageFile) imageFile = await this.compressImage(imageFile, 1200, 0.8);

            const formData = new FormData();
            formData.append('content', content);
            formData.append('sentiment', sentiment);
            if (imageFile) formData.append('image', imageFile);

            try {
                const btn = e.target.querySelector('button');
                btn.disabled = true;
                btn.innerText = "Transmitting...";

                const res = await this.authFetch(`${API_URL}/posts`, { method: 'POST', body: formData });
                if (!res.ok) throw new Error("Broadcast failed.");
                this.renderFeed(container);
            } catch (err) {
                alert(err.message);
                e.target.querySelector('button').disabled = false;
                e.target.querySelector('button').innerText = "Transmit Broadcast";
            }
        });

        // Threaded Reply Handlers
        document.querySelectorAll('.replyForm').forEach(form => {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const postId = form.dataset.postid;
                const content = form.querySelector('.replyContent').value.trim();

                try {
                    const btn = form.querySelector('button');
                    btn.disabled = true;
                    btn.innerText = "...";

                    const res = await this.authFetch(`${API_URL}/posts/${postId}/comments`, {
                        method: 'POST',
                        body: JSON.stringify({ content })
                    });
                    if (!res.ok) throw new Error("Reply failed.");
                    this.renderFeed(container); // refresh feed completely
                } catch (err) {
                    alert(err.message);
                    form.querySelector('button').disabled = false;
                    form.querySelector('button').innerText = "Reply";
                }
            });
        });

        // Emoji Reaction Handlers — in-place update (no full re-render)
        document.querySelectorAll('.reactBtn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const postId = btn.dataset.postid;
                const emoji = btn.dataset.emoji;
                try {
                    btn.style.opacity = '0.5';
                    const res = await this.authFetch(`${API_URL}/posts/${postId}/react`, {
                        method: 'POST',
                        body: JSON.stringify({ emoji })
                    });
                    if (!res.ok) throw new Error("Reaction failed.");
                    const result = await res.json();

                    // Find all reaction buttons for this post
                    const postBtns = document.querySelectorAll(`.reactBtn[data-postid="${postId}"]`);
                    const emojiMap = { like: '👍', heart: '❤️', lmao: '😂', sad: '😢', meh: '😐' };

                    postBtns.forEach(b => {
                        const bEmoji = b.dataset.emoji;
                        const currentText = b.textContent.trim();
                        const currentCount = parseInt(currentText.replace(/[^\d]/g, '')) || 0;
                        const wasActive = b.style.borderColor.includes('accent') || b.style.color.includes('accent') ||
                                          b.style.cssText.includes('var(--accent)');

                        if (bEmoji === emoji) {
                            if (result.action === 'removed') {
                                // User un-reacted this emoji
                                b.textContent = `${emojiMap[bEmoji]} ${Math.max(0, currentCount - 1)}`;
                                b.style.background = 'transparent';
                                b.style.borderColor = 'var(--border-light)';
                                b.style.color = 'var(--text-secondary)';
                            } else {
                                // User added or switched TO this emoji
                                const newCount = result.action === 'added' ? currentCount + 1 : currentCount + 1;
                                b.textContent = `${emojiMap[bEmoji]} ${newCount}`;
                                b.style.background = 'var(--bg-panel)';
                                b.style.borderColor = 'var(--accent)';
                                b.style.color = 'var(--accent)';
                            }
                        } else if (result.action === 'updated' && wasActive) {
                            // User switched FROM this emoji to another
                            b.textContent = `${emojiMap[bEmoji]} ${Math.max(0, currentCount - 1)}`;
                            b.style.background = 'transparent';
                            b.style.borderColor = 'var(--border-light)';
                            b.style.color = 'var(--text-secondary)';
                        }
                        b.style.opacity = '1';
                    });
                } catch (err) {
                    console.error(err);
                    btn.style.opacity = '1';
                }
            });
        });

        // Edit Post Handlers
        document.querySelectorAll('.editPostBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const postId = btn.dataset.postid;
                const postCard = btn.closest('.feed-item');
                const contentEl = postCard.querySelector('.post-content');
                const currentText = contentEl.textContent;

                contentEl.innerHTML = `
                    <textarea class="editTextarea" style="width:100%; min-height:80px; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--accent); color:var(--text-primary); border-radius:var(--radius-sm); font-family:var(--font-body); resize:vertical; font-size:1rem;">${escapeHTML(currentText)}</textarea>
                    <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                        <button class="saveEditBtn btn" style="padding:0.4rem 1rem; font-size:0.85rem;">Save</button>
                        <button class="cancelEditBtn" style="padding:0.4rem 1rem; font-size:0.85rem; background:none; border:1px solid var(--border-light); color:var(--text-secondary); border-radius:var(--radius-sm); cursor:pointer;">Cancel</button>
                    </div>
                `;

                contentEl.querySelector('.saveEditBtn').addEventListener('click', async () => {
                    const newContent = contentEl.querySelector('.editTextarea').value.trim();
                    if (!newContent) return;
                    try {
                        const res = await app.authFetch(`${API_URL}/posts/${postId}`, {
                            method: 'PUT',
                            body: JSON.stringify({ content: newContent })
                        });
                        if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                        app.renderFeed(container);
                    } catch (err) { alert(err.message); }
                });

                contentEl.querySelector('.cancelEditBtn').addEventListener('click', () => {
                    app.renderFeed(container);
                });
            });
        });

        // Delete Post Handlers
        document.querySelectorAll('.deletePostBtn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const postId = btn.dataset.postid;
                if (!confirm('Are you sure you want to purge this broadcast? This cannot be undone.')) return;
                try {
                    const res = await app.authFetch(`${API_URL}/posts/${postId}`, { method: 'DELETE' });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                    app.renderFeed(container);
                } catch (err) { alert(err.message); }
            });
        });

        // Flag Post Handlers
        document.querySelectorAll('.flagPostBtn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const postId = btn.dataset.postid;
                const reason = prompt('Why are you reporting this broadcast? (optional)');
                if (reason === null) return;
                try {
                    btn.disabled = true;
                    btn.textContent = 'Reporting...';
                    const res = await app.authFetch(`${API_URL}/posts/${postId}/flag`, {
                        method: 'POST',
                        body: JSON.stringify({ reason: reason || '' })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    btn.textContent = '✓ Reported';
                    btn.style.color = 'var(--success, #22c55e)';
                } catch (err) {
                    alert(err.message);
                    btn.disabled = false;
                    btn.textContent = '🚩 Report';
                }
            });
        });

        // Share Post Handlers
        document.querySelectorAll('.sharePostBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const postId = btn.dataset.postid;
                const url = `${window.location.origin}${window.location.pathname}?post=${postId}`;
                navigator.clipboard.writeText(url).then(() => {
                    btn.textContent = '✓ Link Copied!';
                    setTimeout(() => { btn.textContent = '📋 Share'; }, 2000);
                }).catch(() => {
                    btn.textContent = '✗ Failed';
                    setTimeout(() => { btn.textContent = '📋 Share'; }, 2000);
                });
            });
        });
    }


    async renderSearch(container) {
        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('cards', 4)}</div>`;

        // Fetch ranked figures with submission counts + grades
        let rankedFigures = MOCK_FIGURES;
        try {
            const res = await fetch(`${API_URL}/figures/ranked`);
            if (res.ok) rankedFigures = await res.json();
        } catch (e) { /* fallback to MOCK_FIGURES */ }

        let currentSort = sessionStorage.getItem('searchSort') || 'name';
        let currentTier = '';
        let currentGradeMin = 0;
        let currentBrand = '';
        const uniqueBrands = [...new Set(rankedFigures.map(f => f.brand))].sort();
        const uniqueTiers = [...new Set(rankedFigures.map(f => f.classTie).filter(Boolean))].sort();

        container.innerHTML = `
            <div class="search-container animate-mount">
                <div style="margin-bottom:2rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">Acquire Target</h2>
                        <p style="color:var(--text-secondary); font-size:1.1rem;">Search central database to initiate Trade Value Assessment.</p>
                    </div>
                    ${this.token ? `<button class="btn" style="padding: 0.75rem 1.5rem;" onclick="app.currentView='add_target'; app.renderApp();">+ Add New Target</button>` : ''}
                </div>

                <div class="search-bar">
                    <input type="text" id="searchInput" placeholder="Search by name, brand, or line (e.g. FT-55, Optimus, XTB)...">
                    <button class="btn" style="width: auto; padding: 0 2rem;" id="searchBtn">SEARCH</button>
                </div>

                <div class="search-filters" style="margin-bottom:1rem; display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
                    <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Brands:</span>
                    <span class="badge brandFilter" data-brand="" style="border-color:var(--accent); color:var(--accent); font-weight:700; cursor:pointer;">ALL</span>
                    ${uniqueBrands.map(b => `<span class="badge brandFilter" data-brand="${escapeHTML(b)}" style="cursor:pointer;">${escapeHTML(b)}</span>`).join('')}
                </div>

                <div style="margin-bottom:1rem; display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
                    <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Class:</span>
                    <span class="badge tierFilter" data-tier="" style="border-color:var(--accent); color:var(--accent); font-weight:700; cursor:pointer;">ALL</span>
                    ${uniqueTiers.map(t => `<span class="badge tierFilter" data-tier="${escapeHTML(t)}" style="cursor:pointer;">${escapeHTML(t)}</span>`).join('')}
                </div>

                <div style="margin-bottom:1.5rem; display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center;">
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Grade:</span>
                        <select id="gradeFilter" style="background:var(--bg-panel); color:var(--text-primary); border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:0.4rem 0.75rem; font-size:0.85rem; cursor:pointer;">
                            <option value="0">Any Grade</option>
                            <option value="50">50+</option>
                            <option value="60">60+</option>
                            <option value="70">70+</option>
                            <option value="80">80+</option>
                            <option value="90">90+</option>
                        </select>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Sort:</span>
                        <span class="badge sortBtn ${currentSort === 'name' ? 'active' : ''}" data-sort="name" style="${currentSort === 'name' ? 'border-color:var(--accent); color:var(--accent); font-weight:700;' : ''} cursor:pointer;">Name</span>
                        <span class="badge sortBtn ${currentSort === 'grade' ? 'active' : ''}" data-sort="grade" style="${currentSort === 'grade' ? 'border-color:var(--accent); color:var(--accent); font-weight:700;' : ''} cursor:pointer;">Grade</span>
                        <span class="badge sortBtn ${currentSort === 'submissions' ? 'active' : ''}" data-sort="submissions" style="${currentSort === 'submissions' ? 'border-color:var(--accent); color:var(--accent); font-weight:700;' : ''} cursor:pointer;">Most Reviewed</span>
                    </div>
                </div>

                <div id="searchResultCount" style="margin-bottom:1rem; font-size:0.9rem; color:var(--text-muted);"></div>
                <div id="searchResults" class="grid-2"></div>
            </div>
        `;

        const brandAliases = {
            'xtb': 'x-transbots', 'mmc': 'mastermind creations', 'dx9': 'dx9',
            'ft': 'fans toys', 'ms': 'magic square', 'zt': 'zeta toys',
            'sc': 'studio cell', 'tt': 'takara tomy'
        };

        const doSearch = () => {
            let query = document.getElementById('searchInput').value.toLowerCase().trim();
            const expanded = brandAliases[query];

            let results = rankedFigures;

            // Text search
            if (query) {
                results = results.filter(f =>
                    f.name.toLowerCase().includes(query) ||
                    f.brand.toLowerCase().includes(query) ||
                    f.line.toLowerCase().includes(query) ||
                    (expanded && f.brand.toLowerCase().includes(expanded))
                );
            }

            // Brand filter
            if (currentBrand) {
                results = results.filter(f => f.brand === currentBrand);
            }

            // Tier filter
            if (currentTier) {
                results = results.filter(f => f.classTie === currentTier);
            }

            // Grade filter
            if (currentGradeMin > 0) {
                results = results.filter(f => parseFloat(f.avgGrade) >= currentGradeMin);
            }

            // Apply sort
            if (currentSort === 'grade') {
                results.sort((a, b) => (parseFloat(b.avgGrade) || 0) - (parseFloat(a.avgGrade) || 0));
            } else if (currentSort === 'submissions') {
                results.sort((a, b) => (b.submissions || 0) - (a.submissions || 0));
            } else {
                results.sort((a, b) => a.name.localeCompare(b.name));
            }

            // Result count
            document.getElementById('searchResultCount').textContent = `${results.length} target${results.length !== 1 ? 's' : ''} found`;

            const resultsHTML = results.map((f, index) => `
                <div class="card target-card animate-stagger" style="animation-delay: ${index * 0.05}s; cursor:pointer;" data-figure-id="${f.id}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.5rem;">
                        <div style="color:var(--text-muted); font-size: 0.8rem; text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">${escapeHTML(f.brand)} &bull; ${escapeHTML(f.line)}</div>
                        <span class="tier-badge ${escapeHTML(f.classTie).toLowerCase()}">${escapeHTML(f.classTie)}</span>
                    </div>
                    <h3 style="margin-bottom: 1rem; font-size: 1.25rem;">${escapeHTML(f.name)}</h3>
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-light); padding-top:1rem;">
                        <div style="display:flex; gap:1rem; font-size:0.85rem; color:var(--text-muted);">
                            ${f.submissions > 0 ? `<span>${f.submissions} report${f.submissions !== 1 ? 's' : ''}</span>` : '<span>No reports</span>'}
                            ${f.avgGrade ? `<span style="color:var(--accent); font-weight:700;">${f.avgGrade}</span>` : ''}
                        </div>
                        <span style="color:var(--accent); font-weight:700; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em;">Assess Target &rarr;</span>
                    </div>
                </div>
            `).join('');

            document.getElementById('searchResults').innerHTML = results.length ? resultsHTML : '<div class="card" style="grid-column: 1 / -1; text-align:center; padding:3rem;"><p style="color:var(--text-muted); font-size:1.1rem;">No targets matching criteria.</p></div>';
        };

        document.getElementById('searchBtn').addEventListener('click', doSearch);
        document.getElementById('searchInput').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') doSearch();
        });

        document.querySelectorAll('.brandFilter').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.brandFilter').forEach(t => {
                    t.style.borderColor = 'var(--border)';
                    t.style.color = 'var(--text-secondary)';
                    t.style.fontWeight = '400';
                });
                tab.style.borderColor = 'var(--accent)';
                tab.style.color = 'var(--accent)';
                tab.style.fontWeight = '700';
                currentBrand = tab.dataset.brand;
                doSearch();
            });
        });

        document.querySelectorAll('.tierFilter').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tierFilter').forEach(t => {
                    t.style.borderColor = 'var(--border)';
                    t.style.color = 'var(--text-secondary)';
                    t.style.fontWeight = '400';
                });
                tab.style.borderColor = 'var(--accent)';
                tab.style.color = 'var(--accent)';
                tab.style.fontWeight = '700';
                currentTier = tab.dataset.tier;
                doSearch();
            });
        });

        document.getElementById('gradeFilter').addEventListener('change', (e) => {
            currentGradeMin = parseInt(e.target.value) || 0;
            doSearch();
        });

        document.querySelectorAll('.sortBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sortBtn').forEach(b => {
                    b.style.borderColor = 'var(--border)';
                    b.style.color = 'var(--text-secondary)';
                    b.style.fontWeight = '400';
                });
                btn.style.borderColor = 'var(--accent)';
                btn.style.color = 'var(--accent)';
                btn.style.fontWeight = '700';
                currentSort = btn.dataset.sort;
                sessionStorage.setItem('searchSort', currentSort);
                doSearch();
            });
        });

        // Event delegation for target card clicks
        document.getElementById('searchResults').addEventListener('click', (e) => {
            const card = e.target.closest('.target-card[data-figure-id]');
            if (card) {
                const figId = parseInt(card.dataset.figureId);
                if (figId) app.selectTarget(figId);
            }
        });

        setTimeout(doSearch, 50);
    }



    renderAddTarget(container) {
        container.innerHTML = `
    <div style="max-width: 600px; margin: 0 auto; padding-bottom: 3rem;" class="animate-mount">
                <div style="display:flex; align-items:center; gap:1rem; margin-bottom: 2rem;">
                    <button class="btn-outline" onclick="app.currentView='search'; app.renderApp();">&larr; Back to Search</button>
                    <div>
                        <h2 style="margin:0; font-size:2rem;">Add Custom Target</h2>
                        <div style="color:var(--text-secondary); font-size:0.95rem; margin-top:0.25rem;">Expand the Market Pulse catalog</div>
                    </div>
                </div>

                <div class="card" style="padding: 2rem;">
                    <form id="addTargetForm">
                        <div class="form-group" style="margin-bottom:1.5rem;">
                            <label class="form-label">Figure Name</label>
                            <input type="text" name="name" required placeholder="e.g. Commander Optimus Prime" style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <div class="form-group" style="margin-bottom:1.5rem;">
                            <label class="form-label">Brand / Manufacturer</label>
                            <input type="text" list="brandList" name="brand" required placeholder="e.g. Hasbro, Takara, Fans Toys" style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                            <datalist id="brandList">
                                <option value="Hasbro"></option>
                                <option value="Takara"></option>
                                <option value="Fans Toys"></option>
                                <option value="X-Transbots (XTB)"></option>
                                <option value="DX9"></option>
                                <option value="Magic Square"></option>
                                <option value="Zeta Toys"></option>
                                <option value="Studio Cell"></option>
                                <option value="Mastermind Creations (MMC)"></option>
                            </datalist>
                        </div>
                        <div class="form-group" style="margin-bottom:1.5rem;">
                            <label class="form-label">Product Line</label>
                            <input type="text" name="line" required placeholder="e.g. Studio Series, Masterpiece, Legacy" style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <div class="form-group" style="margin-bottom:2rem;">
                            <label class="form-label">Size Class / Tier</label>
                            <select name="classTie" required style="width:100%; padding:0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                                <option value="Core">Core</option>
                                <option value="Deluxe">Deluxe</option>
                                <option value="Voyager">Voyager</option>
                                <option value="Leader">Leader</option>
                                <option value="Commander">Commander</option>
                                <option value="Titan">Titan</option>
                                <option value="Masterpiece">Masterpiece</option>
                                <option value="Legends">Legends</option>
                            </select>
                        </div>
                        <button type="submit" class="btn" style="width:100%; padding:1rem; font-size:1.1rem;">Register Target</button>
                    </form>
                </div>
            </div>
    `;

        document.getElementById('addTargetForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitNewTarget(e.target);
        });
    }

    async submitNewTarget(form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        try {
            const req = await this.authFetch(`${API_URL}/figures`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (req.ok) {
                alert(`${data.name} has been successfully added to the catalog.`);
                await this.loadFigures(); // refresh the global array
                this.currentView = 'search';
                this.renderApp();
            } else {
                const err = await req.json().catch(() => ({}));
                alert(err.error || "Failed to create target.");
            }
        } catch (e) {
            console.error(e);
            alert("Connection error adding target.");
        }
    }

    selectTarget(id) {
        // Track where user came from for back navigation
        this.previousView = this.currentView;
        // Try MOCK_FIGURES first (loose equality handles string/number mismatch)
        this.currentTarget = MOCK_FIGURES.find(f => f.id == id);
        if (this.currentTarget) {
            this.currentView = 'pulse';
            this.renderApp();
            return;
        }
        // Not found locally — try fetching from API
        fetch(`${API_URL}/figures`).then(res => {
            if (res.ok) return res.json();
            throw new Error('Failed to fetch');
        }).then(figures => {
            MOCK_FIGURES = figures;
            this.currentTarget = MOCK_FIGURES.find(f => f.id == id);
            if (this.currentTarget) {
                this.currentView = 'pulse';
            } else {
                alert('Target not found. It may have been removed.');
                this.currentView = 'search';
            }
            this.renderApp();
        }).catch(e => {
            console.error('Failed to fetch figures', e);
            alert('Target not found.');
            this.currentView = 'search';
            this.renderApp();
        });
    }

    async renderPulse(container) {
        if (!this.currentTarget) {
            container.innerHTML = `<div style="padding:3rem; text-align:center;"><p style="color:var(--text-secondary);">No target selected.</p><button class="btn" onclick="app.currentView='search'; app.renderApp();">Back to Search</button></div>`;
            return;
        }
        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('stats', 4)}</div>`;

        let figureSubs = [];
        let marketIntel = null;
        let overviewStats = {};
        let indexes = [];
        let headlines = [];
        try {
            const [subRes, miRes] = await Promise.all([
                fetch(`${API_URL}/submissions/target/${this.currentTarget.id}`),
                fetch(`${API_URL}/figures/${this.currentTarget.id}/market-intel`)
            ]);
            if (subRes.ok) figureSubs = await subRes.json();
            if (miRes.ok) marketIntel = await miRes.json();
        } catch (e) {
            console.error("Failed retrieving pulse data", e);
        }
        try {
            const [ovRes, idxRes, hdRes] = await Promise.all([
                fetch(`${API_URL}/stats/overview`),
                fetch(`${API_URL}/stats/indexes`),
                fetch(`${API_URL}/stats/headlines`)
            ]);
            if (ovRes.ok) overviewStats = await ovRes.json();
            if (idxRes.ok) indexes = await idxRes.json();
            if (hdRes.ok) headlines = await hdRes.json();
        } catch (e) {
            console.error("Failed retrieving market stats", e);
        }

        let mtsAvg = 0, approvalAvg = 0, overallAvg = 0, confidenceStars = 1;
        let isGuestimate = true;
        let yesVotes = 0;
        let noVotes = 0;
        let totalTradeRating = 0;

        if (figureSubs.length > 0) {
            isGuestimate = false;
            let totalMTS = 0;
            let totalApprl = 0;
            figureSubs.forEach(s => {
                totalMTS += parseFloat(s.mtsTotal);
                totalApprl += parseFloat(s.approvalScore);
                if (s.data && s.data.recommendation === 'yes') yesVotes++;
                if (s.data && s.data.recommendation === 'no') noVotes++;
                if (s.data && s.data.tradeRating) totalTradeRating += parseFloat(s.data.tradeRating);
            });
            mtsAvg = (totalMTS / figureSubs.length).toFixed(1);
            approvalAvg = (totalApprl / figureSubs.length).toFixed(1);
            overallAvg = ((parseFloat(mtsAvg) + parseFloat(approvalAvg)) / 2).toFixed(1);

            // Confidence system mock (more samples = more stars)
            if (figureSubs.length >= 10) confidenceStars = 5;
            else if (figureSubs.length >= 5) confidenceStars = 4;
            else if (figureSubs.length >= 2) confidenceStars = 3;
            else if (figureSubs.length > 0) confidenceStars = 2;
        } else {
            // Guestimate TVI Anchoring
            let baseTVI = 50;
            if (this.currentTarget.classTie === "Commander" || this.currentTarget.classTie === "Masterpiece") baseTVI = 85;
            else if (this.currentTarget.classTie === "Leader") baseTVI = 75;
            else if (this.currentTarget.classTie === "Voyager") baseTVI = 65;

            overallAvg = `${baseTVI}.0 <span style="font-size:1rem; font-weight:400; color:var(--text-secondary);">(Guestimate)</span>`;
        }

        // Build data reliability stars (auto-calculated)
        let reliabilityHtml = '';
        for (let i = 0; i < 5; i++) {
            const color = i < confidenceStars ? "var(--text-secondary)" : "var(--border-light)";
            reliabilityHtml += `<span style="color: ${color}; font-size: 1rem;">★</span>`;
        }

        // Build community trade rating stars (user-voted average)
        const avgTradeRating = figureSubs.length > 0 ? (totalTradeRating / figureSubs.length) : 0;
        let tradeStarsHtml = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(avgTradeRating)) {
                tradeStarsHtml += `<span style="color: #fbbf24; font-size: 2rem;">★</span>`;
            } else if (i - avgTradeRating < 1 && i > Math.floor(avgTradeRating)) {
                tradeStarsHtml += `<span style="color: #fbbf24; font-size: 2rem; opacity: 0.5;">★</span>`;
            } else {
                tradeStarsHtml += `<span style="color: var(--border-light); font-size: 2rem;">★</span>`;
            }
        }

        container.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;" class="animate-mount">
                <div style="margin-bottom: 2rem;">
                    <button class="btn-outline" onclick="app.currentView='${this.previousView || 'search'}'; app.renderApp();" style="margin-bottom:1.5rem;">&larr; Back</button>
                    <div class="card" style="display:flex; align-items:center; gap:1.5rem;">
                        <div style="flex:1;">
                            <h2 style="margin:0 0 0.5rem; font-size:1.75rem;">${escapeHTML(this.currentTarget.name)}</h2>
                            <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
                                <span style="color:var(--text-secondary); font-size:0.9rem; font-weight:600;">${escapeHTML(this.currentTarget.brand)}</span>
                                <span style="color:var(--text-muted);">&bull;</span>
                                <span style="color:var(--text-muted); font-size:0.85rem;">${escapeHTML(this.currentTarget.line || '')}</span>
                                <span class="tier-badge ${escapeHTML(this.currentTarget.classTie || '').toLowerCase()}">${escapeHTML(this.currentTarget.classTie)}</span>
                            </div>
                        </div>
                        <div style="text-align:center; padding-left:1.5rem; border-left:1px solid var(--border-light);">
                            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.25rem;">Reports</div>
                            <div style="font-size:1.5rem; font-weight:900; color:var(--accent);">${figureSubs.length}</div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem; display:flex; gap:0.75rem; align-items:center;">
                    <button class="btn-outline" id="copyLinkBtn" style="font-size:0.85rem; padding:0.5rem 1rem;">📋 Copy Link</button>
                </div>

                ${isGuestimate ? `
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); padding: 1rem 1.5rem; border-radius: var(--radius-sm); margin-bottom: 2rem; color: var(--text-primary);">
                        <strong style="color: var(--danger);">⚠️ Anti-Hype Notice:</strong> Insufficient community data. Displaying TVI Anchored Guestimate based on class tier (${escapeHTML(this.currentTarget.classTie)}).
                    </div>
                ` : ''}

                <div class="grid-2" style="margin-bottom: 2.5rem;">
                    <div class="stat-box" style="padding: 2.5rem;">
                        <div class="stat-value" style="font-size:3.5rem;">${overallAvg}</div>
                        <div class="stat-label">Overall Target Grade (0-100)</div>
                    </div>
                    <div class="stat-box" style="display:flex; flex-direction:column; justify-content:center;">
                        ${!isGuestimate && avgTradeRating > 0 ? `
                            <div style="margin-bottom: 0.5rem; line-height: 1;">${tradeStarsHtml}</div>
                            <div class="stat-label" style="margin-bottom:0.25rem;">Community Trade Rating: <span style="color:#fbbf24; font-weight:800;">${avgTradeRating.toFixed(1)} / 5</span></div>
                        ` : `
                            <div style="margin-bottom: 0.5rem; line-height: 1; color: var(--border-light); font-size: 2rem;">★★★★★</div>
                            <div class="stat-label">Community Trade Rating: <span style="color:var(--text-muted);">No Votes Yet</span></div>
                        `}
                        <div style="margin-top: 0.75rem; font-size: 0.8rem; color: var(--text-muted);">${reliabilityHtml} Data Reliability (${figureSubs.length} sample${figureSubs.length !== 1 ? 's' : ''})</div>
                        ${!isGuestimate ? `
                            <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
                                <div style="font-size: 1.5rem; font-weight: 800; color: ${yesVotes >= noVotes ? 'var(--success)' : 'var(--danger)'};"> 
                                    RECOMMENDATION: ${yesVotes >= noVotes ? 'YES' : 'NO'}
                                </div>
                                <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem;">
                                    (${yesVotes} Yes, ${noVotes} No)
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>

                ${marketIntel && marketIntel.transactions.total > 0 ? `
                <div class="card" style="margin-bottom: 2.5rem; padding: 2rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                        <h3 style="margin:0; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">💰 Market Intelligence</h3>
                        <span style="font-size:0.75rem; padding:0.25rem 0.75rem; border-radius:12px; font-weight:700; ${marketIntel.transactions.confidence === 'high' ? 'background:rgba(16,185,129,0.15); color:#10b981;' : marketIntel.transactions.confidence === 'medium' ? 'background:rgba(251,191,36,0.15); color:#fbbf24;' : 'background:rgba(239,68,68,0.15); color:#ef4444;'}">${marketIntel.transactions.confidence.toUpperCase()} CONFIDENCE</span>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:1rem;">
                        <div class="stat-box" style="padding:1.25rem;">
                            <div class="stat-value" style="font-size:1.75rem; color:#10b981;">${marketIntel.transactions.rolling30.avg != null ? '$' + marketIntel.transactions.rolling30.avg.toFixed(2) : '—'}</div>
                            <div class="stat-label">30-Day Avg</div>
                        </div>
                        <div class="stat-box" style="padding:1.25rem;">
                            <div class="stat-value" style="font-size:1.75rem; color:#10b981;">${marketIntel.transactions.rolling90.avg != null ? '$' + marketIntel.transactions.rolling90.avg.toFixed(2) : '—'}</div>
                            <div class="stat-label">90-Day Avg</div>
                        </div>
                        <div class="stat-box" style="padding:1.25rem;">
                            <div class="stat-value" style="font-size:1.75rem; color:#10b981;">${marketIntel.transactions.lifetime.avg != null ? '$' + marketIntel.transactions.lifetime.avg.toFixed(2) : '—'}</div>
                            <div class="stat-label">Lifetime Avg</div>
                        </div>
                        <div class="stat-box" style="padding:1.25rem;">
                            <div class="stat-value" style="font-size:1.75rem; ${marketIntel.transactions.pctOverMsrp != null ? (marketIntel.transactions.pctOverMsrp >= 0 ? 'color:var(--danger);' : 'color:var(--success);') : 'color:var(--text-muted);'}">${marketIntel.transactions.pctOverMsrp != null ? (marketIntel.transactions.pctOverMsrp >= 0 ? '+' : '') + marketIntel.transactions.pctOverMsrp + '%' : '—'}</div>
                            <div class="stat-label">vs MSRP ${marketIntel.msrp ? '($' + parseFloat(marketIntel.msrp).toFixed(2) + ')' : '(Not Set)'}</div>
                        </div>
                        <div class="stat-box" style="padding:1.25rem;">
                            <div class="stat-value" style="font-size:1.75rem; color:#f59e0b;">${marketIntel.transactions.volatility != null ? '$' + marketIntel.transactions.volatility.toFixed(2) : '—'}</div>
                            <div class="stat-label">Volatility (H − L)</div>
                        </div>
                        <div class="stat-box" style="padding:1.25rem;">
                            <div class="stat-value" style="font-size:1.75rem; color:var(--accent);">${marketIntel.transactions.total}</div>
                            <div class="stat-label">Price Reports</div>
                        </div>
                    </div>
                </div>
                ` : marketIntel ? `
                <div class="card" style="margin-bottom: 2.5rem; padding: 2rem; text-align:center;">
                    <h3 style="margin:0 0 0.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">💰 Market Intelligence</h3>
                    <p style="color:var(--text-muted); font-size:0.9rem; margin:0;">Insufficient pricing data. Submit intel reports with aftermarket valuations to populate market trends.</p>
                </div>
                ` : ''}

                ${!isGuestimate && figureSubs.length > 0 ? `
                <div class="card" style="margin-bottom: 2.5rem; padding: 2rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom: 1rem;">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <h3 style="margin:0;">Community Projections Trend</h3>
                            ${marketIntel ? `<span style="font-size:0.7rem; padding:0.2rem 0.5rem; border-radius:8px; font-weight:700; ${marketIntel.transactions.confidence === 'high' ? 'background:rgba(16,185,129,0.15); color:#10b981;' : marketIntel.transactions.confidence === 'medium' ? 'background:rgba(251,191,36,0.15); color:#fbbf24;' : 'background:rgba(239,68,68,0.15); color:#ef4444;'}">${marketIntel.transactions.total} data pt${marketIntel.transactions.total !== 1 ? 's' : ''}</span>` : ''}
                        </div>
                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                            <button type="button" class="chartToggle" data-idx="0" style="padding:0.3rem 0.6rem; font-size:0.75rem; border-radius:4px; border:1px solid #ff0f39; background:rgba(255,15,57,0.15); color:#ff0f39; cursor:pointer; font-weight:600;">Community Score</button>
                            <button type="button" class="chartToggle" data-idx="1" style="padding:0.3rem 0.6rem; font-size:0.75rem; border-radius:4px; border:1px solid #10b981; background:rgba(16,185,129,0.15); color:#10b981; cursor:pointer; font-weight:600;">Market Pricing</button>
                            ${marketIntel && marketIntel.msrp ? `<button type="button" class="chartToggle" data-idx="2" style="padding:0.3rem 0.6rem; font-size:0.75rem; border-radius:4px; border:1px solid #f59e0b; background:rgba(245,158,11,0.15); color:#f59e0b; cursor:pointer; font-weight:600;">MSRP Baseline</button>` : ''}
                        </div>
                    </div>
                    <div style="height: 280px; width: 100%;">
                        <canvas id="projectionsChart"></canvas>
                    </div>
                    <h3 style="margin-top:2rem; font-family:var(--font-heading); font-size:1rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">📸 Field Evidence Gallery</h3>
                    <div id="imageGallery" style="margin-top:0.75rem; display:flex; justify-content:center; flex-wrap:wrap; gap:1.5rem; padding-bottom:1rem;"></div>
                </div>
                ` : ''}

                ${figureSubs.length > 0 ? `
                <div style="margin-top:2.5rem; padding-top:2rem; border-top:1px solid var(--border-light);">
                    <h3 style="margin-bottom:1rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">📋 Recent Intel Reports</h3>
                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        ${figureSubs.slice(0, 10).map(s => {
                            const grade = ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1);
                            const date = new Date(s.date).toLocaleDateString();
                            return `
                                <div class="card" style="padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                                    <div style="display:flex; align-items:center; gap:1rem;">
                                        <span class="user-link" onclick="app.viewUserProfile('${escapeHTML(s.author).replace(/'/g, "\\'")}')" style="font-weight:700;">${escapeHTML(s.author)}</span>
                                        <span style="color:var(--text-muted); font-size:0.8rem;">${date}</span>
                                        ${s.editedAt ? '<span style="color:var(--text-muted); font-size:0.7rem; font-style:italic;">(edited)</span>' : ''}
                                    </div>
                                    <div style="font-weight:800; font-size:1.1rem; color:${parseFloat(grade) >= 70 ? 'var(--success)' : parseFloat(grade) >= 50 ? '#fbbf24' : 'var(--danger)'};">${grade}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}

                <div style="text-align: center; border-top: 1px solid var(--border-light); padding-top: 3rem; margin-top:2rem;">
                    <h3 style="margin-bottom: 1rem;">Contribute Intelligence</h3>
                    <p style="color:var(--text-secondary); margin-bottom: 2rem;">Help stabilize the market pulse by adding your in-hand assessment.</p>
                    <button class="btn" style="max-width: 300px;" onclick="app.currentView='submission'; app.renderApp();">Execute Trade Scan</button>
                </div>

                <!-- MARKET ACTIVITY RECAP -->
                <div style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);">
                    <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">📊 Market Activity Recap</h3>
                    <div class="grid-2" style="gap: 1rem;">
                        <div class="stat-box" style="padding:1.5rem;">
                            <div class="stat-value" style="font-size:2.5rem; color:var(--accent);">${overviewStats.totalIntel || 0}</div>
                            <div class="stat-label">Total Intel Reports</div>
                        </div>
                        <div class="stat-box" style="padding:1.5rem;">
                            <div class="stat-value" style="font-size:2.5rem; color:var(--accent);">${overviewStats.uniqueAnalysts || 0}</div>
                            <div class="stat-label">Active Analysts</div>
                        </div>
                        <div class="stat-box" style="padding:1.5rem;">
                            <div class="stat-value" style="font-size:2.5rem; color:var(--accent);">${overviewStats.avgGrade || '0.0'}</div>
                            <div class="stat-label">Avg Overall Grade</div>
                        </div>
                        <div class="stat-box" style="padding:1.5rem;">
                            <div class="stat-value" style="font-size:2.5rem; color:var(--accent);">${overviewStats.totalTargets || 0}</div>
                            <div class="stat-label">Cataloged Targets</div>
                        </div>
                    </div>
                    ${overviewStats.topFigure ? `
                        <div class="card" style="margin-top:1rem; padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${overviewStats.topFigure.id})">
                            <div>
                                <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">🏆 Highest Rated Target</div>
                                <div style="font-size:1.1rem; font-weight:700; margin-top:0.25rem;">${escapeHTML(overviewStats.topFigure.name)}</div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:1.5rem; font-weight:800; color:var(--accent);">${overviewStats.topFigure.grade}</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${overviewStats.topFigure.subs} report${overviewStats.topFigure.subs !== 1 ? 's' : ''}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- BRAND / LINE INDEXES -->
                ${indexes.length > 0 ? `
                <div style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);">
                    <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">📈 Brand & Line Indexes</h3>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem;">
                        ${indexes.map(idx => {
            const grade = idx.avgGrade ? parseFloat(idx.avgGrade) : null;
            const gradeColor = grade >= 70 ? 'var(--success)' : grade >= 45 ? '#fbbf24' : grade ? 'var(--danger)' : 'var(--text-muted)';
            const trendIcon = grade >= 70 ? '↑' : grade >= 45 ? '→' : grade ? '↓' : '—';
            return `
                                <div class="card" style="padding:1.25rem; display:flex; justify-content:space-between; align-items:center;">
                                    <div>
                                        <div style="font-weight:700; font-size:0.95rem;">${escapeHTML(idx.brand)}</div>
                                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(idx.line)} • ${idx.targets} target${idx.targets !== 1 ? 's' : ''}</div>
                                    </div>
                                    <div style="text-align:right;">
                                        <span style="font-size:1.25rem; font-weight:800; color:${gradeColor};">${grade ? escapeHTML(idx.avgGrade) : '—'}</span>
                                        <span style="font-size:1.1rem; margin-left:0.25rem; color:${gradeColor};">${trendIcon}</span>
                                        <div style="font-size:0.7rem; color:var(--text-muted);">${idx.submissions} report${idx.submissions !== 1 ? 's' : ''}</div>
                                    </div>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- INTEL HEADLINES -->
                ${headlines.length > 0 ? `
                <div style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);">
                    <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">📰 Intel Headlines</h3>
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        ${headlines.map(h => {
            const gradeColor = h.grade >= 70 ? 'var(--success)' : h.grade >= 45 ? '#fbbf24' : 'var(--danger)';
            const timeAgo = h.date ? new Date(h.date).toLocaleDateString() : '';
            return `
                                <div class="card" style="padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem;">
                                    <div style="flex:1;">
                                        <div style="font-size:0.95rem; font-weight:500; line-height:1.4;">${escapeHTML(h.headline)}</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.35rem;">${escapeHTML(h.brand)} • ${escapeHTML(h.classTie)} • ${timeAgo}</div>
                                    </div>
                                    <div style="font-size:1.25rem; font-weight:800; color:${gradeColor}; white-space:nowrap;">${h.grade.toFixed(1)}</div>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- SIMILAR FIGURES -->
                <div id="similarFigures" style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);"></div>

                <!-- DISCUSSION -->
                <div style="margin-top: 3rem; padding-top: 3rem; border-top: 1px solid var(--border-light);">
                    <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">💬 Discussion</h3>
                    <form id="figureCommentForm" style="margin-bottom:1.5rem; display:flex; gap:0.75rem;">
                        <input type="text" id="figureCommentInput" placeholder="Share your thoughts on this target..." style="flex:1; padding:0.75rem 1rem; background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); color:var(--text-primary); font-family:var(--font-body); font-size:0.9rem;">
                        <button type="submit" class="btn" style="width:auto; padding:0.75rem 1.5rem; font-size:0.85rem;">Post</button>
                    </form>
                    <div id="figureComments" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
                </div>
            </div>
        `;

        setTimeout(() => {
            if (!isGuestimate && figureSubs.length > 0) {
                // Build unified timeline from submissions (grades) + market intel (prices)
                const timePoints = {};
                const sortedSubs = [...figureSubs].sort((a, b) => new Date(a.date) - new Date(b.date));
                sortedSubs.forEach(s => {
                    const d = new Date(s.date);
                    const key = d.toISOString().split('T')[0];
                    if (!timePoints[key]) timePoints[key] = { ts: d.getTime(), grade: null, price: null };
                    const g = (parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2;
                    timePoints[key].grade = parseFloat(g.toFixed(1));
                });
                if (marketIntel && marketIntel.timeline) {
                    marketIntel.timeline.forEach(t => {
                        const d = new Date(t.created_at);
                        const key = d.toISOString().split('T')[0];
                        if (!timePoints[key]) timePoints[key] = { ts: d.getTime(), grade: null, price: null };
                        timePoints[key].price = t.priceAvg;
                    });
                }
                const sortedTimeline = Object.entries(timePoints).sort((a, b) => a[1].ts - b[1].ts);
                const labels = sortedTimeline.map(e => new Date(e[1].ts).toLocaleDateString());
                const gradePoints = sortedTimeline.map(e => e[1].grade);
                const pricePoints = sortedTimeline.map(e => e[1].price);

                const chartDatasets = [
                    {
                        label: 'Overall Target Grade',
                        data: gradePoints,
                        borderColor: '#ff0f39',
                        backgroundColor: 'rgba(255, 15, 57, 0.1)',
                        tension: 0.3,
                        fill: true,
                        yAxisID: 'y',
                        spanGaps: true
                    },
                    {
                        label: 'Market Price (USD)',
                        data: pricePoints,
                        borderColor: '#10b981',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        tension: 0.3,
                        yAxisID: 'y1',
                        spanGaps: true
                    }
                ];
                if (marketIntel && marketIntel.msrp) {
                    chartDatasets.push({
                        label: 'MSRP Baseline',
                        data: labels.map(() => marketIntel.msrp),
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderDash: [10, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0,
                        yAxisID: 'y1',
                        spanGaps: true
                    });
                }

                const ctx = document.getElementById('projectionsChart');
                if (ctx) {
                    const pulseChart = new Chart(ctx.getContext('2d'), {
                        type: 'line',
                        data: { labels, datasets: chartDatasets },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: { mode: 'index', intersect: false },
                            scales: {
                                y: {
                                    type: 'linear',
                                    display: true,
                                    position: 'left',
                                    min: 0,
                                    max: 100,
                                    title: { display: true, text: 'Overall Grade (0-100)', color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 } },
                                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                                },
                                y1: {
                                    type: 'linear',
                                    display: true,
                                    position: 'right',
                                    title: { display: true, text: 'Street Value (USD)', color: '#10b981', font: { size: 10 } },
                                    grid: { drawOnChartArea: false }
                                }
                            }
                        }
                    });
                    // Wire chart toggle buttons
                    document.querySelectorAll('.chartToggle').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const idx = parseInt(btn.dataset.idx);
                            if (idx < pulseChart.data.datasets.length) {
                                const ds = pulseChart.data.datasets[idx];
                                ds.hidden = !ds.hidden;
                                btn.style.opacity = ds.hidden ? '0.4' : '1';
                                pulseChart.update();
                            }
                        });
                    });
                }

                let galleryHtml = '';
                sortedSubs.forEach(s => {
                    if (s.data && s.data.imagePath) {
                        const grade = s.mtsTotal ? ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1) : '—';
                        galleryHtml += `
                            <div style="display:flex; flex-direction:column; align-items:center; gap:0.4rem;">
                                <img src="${s.data.imagePath}" style="width:auto; height:200px; object-fit:contain; background:var(--bg-panel); border-radius:8px; border:1px solid var(--border); box-shadow: 0 4px 6px var(--accent-glow); cursor:pointer;" title="${escapeHTML(s.author)}'s Evidence" onclick="this.style.maxHeight = this.style.maxHeight === 'none' ? '200px' : 'none'; this.style.height = this.style.height === 'auto' ? '200px' : 'auto';">
                                <span style="font-size:0.75rem; color:var(--text-muted);">
                                    by <span class="user-link" onclick="app.viewUserProfile('${escapeHTML(s.author).replace(/'/g, "\\'")}')">${escapeHTML(s.author)}</span> · Grade: <span style="color:var(--accent); font-weight:600;">${grade}</span>
                                </span>
                            </div>`;
                    }
                });
                if (galleryHtml) {
                    document.getElementById('imageGallery').innerHTML = galleryHtml;
                }
            }
        }, 100);

        // Copy link button
        const copyBtn = document.getElementById('copyLinkBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const url = `${window.location.origin}${window.location.pathname}?figure=${this.currentTarget.id}`;
                navigator.clipboard.writeText(url).then(() => {
                    copyBtn.textContent = '✓ Link Copied!';
                    setTimeout(() => { copyBtn.textContent = '📋 Copy Link'; }, 2000);
                }).catch(() => {
                    copyBtn.textContent = '✗ Failed';
                    setTimeout(() => { copyBtn.textContent = '📋 Copy Link'; }, 2000);
                });
            });
        }

        // Load similar figures
        try {
            const allRes = await fetch(`${API_URL}/figures/ranked`);
            if (allRes.ok) {
                const allFigures = await allRes.json();
                const similar = allFigures.filter(f =>
                    f.id !== this.currentTarget.id &&
                    (f.brand === this.currentTarget.brand || f.line === this.currentTarget.line)
                ).slice(0, 4);
                const simEl = document.getElementById('similarFigures');
                if (simEl && similar.length > 0) {
                    simEl.innerHTML = `
                        <h3 style="margin-bottom: 1.5rem; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary);">🔗 Similar Targets</h3>
                        <div class="grid-2">
                            ${similar.map(f => {
                                const grade = f.avgGrade ? parseFloat(f.avgGrade) : null;
                                const gradeColor = grade >= 70 ? 'var(--success)' : grade >= 45 ? '#fbbf24' : grade ? 'var(--danger)' : 'var(--text-muted)';
                                return `
                                    <div class="card" style="padding:1.25rem; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                                            <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">${escapeHTML(f.brand)}</div>
                                            <span class="tier-badge ${escapeHTML(f.classTie).toLowerCase()}">${escapeHTML(f.classTie)}</span>
                                        </div>
                                        <div style="font-weight:700; font-size:1rem; margin-bottom:0.5rem;">${escapeHTML(f.name)}</div>
                                        <div style="display:flex; justify-content:space-between; align-items:center;">
                                            <span style="font-size:0.8rem; color:var(--text-muted);">${f.submissions || 0} report${(f.submissions || 0) !== 1 ? 's' : ''}</span>
                                            <span style="font-weight:800; color:${gradeColor};">${grade ? f.avgGrade : '—'}</span>
                                        </div>
                                    </div>`;
                            }).join('')}
                        </div>`;
                }
            }
        } catch (e) { /* ignore */ }

        // Load and render figure comments (discussion)
        const loadComments = async () => {
            try {
                const res = await fetch(`${API_URL}/figures/${this.currentTarget.id}/comments`);
                if (res.ok) {
                    const comments = await res.json();
                    const el = document.getElementById('figureComments');
                    if (el) {
                        el.innerHTML = comments.length ? comments.map(c => `
                            <div class="card" style="padding:0.75rem 1rem;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                                    <span class="user-link" onclick="app.viewUserProfile('${escapeHTML(c.author).replace(/'/g, "\\'")}')" style="font-weight:700; font-size:0.9rem;">${escapeHTML(c.author)}</span>
                                    <span style="font-size:0.75rem; color:var(--text-muted);">${new Date(c.created_at).toLocaleDateString()}</span>
                                </div>
                                <p style="color:var(--text-primary); font-size:0.9rem; line-height:1.5; margin:0;">${escapeHTML(c.content)}</p>
                            </div>
                        `).join('') : '<p style="color:var(--text-muted); font-size:0.9rem;">No discussion yet. Be the first to share your thoughts!</p>';
                    }
                }
            } catch (e) { /* ignore */ }
        };
        loadComments();

        const commentForm = document.getElementById('figureCommentForm');
        if (commentForm) {
            commentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const input = document.getElementById('figureCommentInput');
                const content = input.value.trim();
                if (!content) return;
                const btn = commentForm.querySelector('button');
                btn.disabled = true;
                btn.textContent = '...';
                try {
                    const res = await this.authFetch(`${API_URL}/figures/${this.currentTarget.id}/comments`, {
                        method: 'POST',
                        body: JSON.stringify({ content })
                    });
                    if (res.ok) {
                        input.value = '';
                        loadComments();
                    }
                } catch (err) { /* ignore */ }
                btn.disabled = false;
                btn.textContent = 'Post';
            });
        }
    }

    // --- INTEL SUBMISSION FORM --- //
    createSlider(id, label, min, max, val, sublabel, step = 1) {
        return `
            <div class="form-group">
                <label class="form-label">${label} ${sublabel ? `<small style="color:var(--text-muted); font-weight:normal; font-size:0.8rem; display:block; margin-top:0.2rem;">${sublabel}</small>` : ''}</label>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <input type="range" id="${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="flex:1;" oninput="this.nextElementSibling.innerText = parseFloat(this.value).toFixed(${step < 1 ? 1 : 0}) + ' / ${max}'">
                    <span class="range-val" style="width:60px; text-align:right; font-weight:700; color:var(--accent); font-family:var(--font-heading);">${parseFloat(val).toFixed(step < 1 ? 1 : 0)} / ${max}</span>
                </div>
            </div>
        `;
    }

    createRiskSelector(id, label, defaultVal = 'neutral') {
        return `
            <div class="form-group">
                <label class="form-label">${label}</label>
                <div class="segmented-control">
                    <label class="risk-bullish" title="Expecting a rise in market price"><input type="radio" name="${id}" value="bullish" ${defaultVal === 'bullish' ? 'checked' : ''}><span>Bullish <span class="risk-info-icon">&#9432;</span></span></label>
                    <label class="risk-neutral" title="Expecting stable or minimal price movement"><input type="radio" name="${id}" value="neutral" ${defaultVal === 'neutral' ? 'checked' : ''}><span>Neutral <span class="risk-info-icon">&#9432;</span></span></label>
                    <label class="risk-bearish" title="Expecting a decline in market price"><input type="radio" name="${id}" value="bearish" ${defaultVal === 'bearish' ? 'checked' : ''}><span>Bearish <span class="risk-info-icon">&#9432;</span></span></label>
                </div>
            </div>
        `;
    }

    updateFrustrationLabel(val) {
        const v = parseFloat(val);
        let l = "🤷 'Meh.' — Average, forgettable.";
        if (v < 3.0) l = "🗑️ 'Nightmare fuel.' — Painful, complex, break risk.";
        else if (v < 5.0) l = "⚠️ 'Frustrating.' — Fiddly, unclear steps.";
        else if (v < 6.0) l = "🤷 'Meh.' — Average, forgettable.";
        else if (v < 7.0) l = "😐 'Manageable.' — Doable with patience.";
        else if (v < 8.0) l = "👍 'Smooth enough.' — Mostly enjoyable.";
        else if (v < 8.5) l = "💪 'Clever.' — Rewarding, fun, smart.";
        else if (v < 9.0) l = "🔥 'Fan favorite.' — Collectors want to transform it.";
        else l = "🏆 🐐 'Masterclass.' — Perfect balance of challenge & fun.";
        document.getElementById('label_trans_frustration').innerText = l;
    }

    updateSatisfactionLabel(val) {
        const v = parseFloat(val);
        let l = "🤷 'Looks fine.' — Average display payoff.";
        if (v < 3.0) l = "🗑️ 'Still not worth it.' — Doesn't redeem frustration.";
        else if (v < 5.0) l = "⚠️ 'Disappointing finish.' — Underwhelming.";
        else if (v < 6.0) l = "🤷 'Looks fine.' — Average display payoff.";
        else if (v < 7.0) l = "😐 'Decent reward.' — Redeems some hassle.";
        else if (v < 8.0) l = "👍 'Solid payoff.' — Struggle feels worth it.";
        else if (v < 8.5) l = "💪 'Great result.' — Makes you forget frustration.";
        else if (v < 9.0) l = "🔥 'Stunning.' — Collectors rave about look.";
        else l = "🏆 🐐 'Worth every step.' — Legendary final mode.";
        document.getElementById('label_trans_satisfaction').innerText = l;
    }

    renderSubmission(container) {
        const isEdit = !!this.editingSubmission;
        const ed = isEdit ? (this.editingSubmission.data || {}) : {};

        container.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;">
                <div style="display:flex; align-items:center; gap:1rem; margin-bottom: 2rem;">
                    <button class="btn-outline" onclick="app.editingSubmission=null; app.currentView='${isEdit ? 'dashboard' : 'pulse'}'; app.renderApp();">&larr; Back</button>
                    <div>
                        <h2 style="margin:0; font-size:2rem;">${isEdit ? 'Edit Intelligence Report' : 'Intelligence Submission'}</h2>
                        <div style="color:var(--accent); font-weight:700; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; margin-top:0.25rem;">Target: ${escapeHTML(this.currentTarget.name)}</div>
                    </div>
                </div>

                ${isEdit && ed.imagePath ? `
                <div class="card" style="margin-bottom:1.5rem; padding:1rem;">
                    <label class="form-label" style="margin-bottom:0.5rem;">Current Evidence Image</label>
                    <img src="${ed.imagePath}" alt="Current evidence" style="max-width:100%; max-height:300px; border-radius:var(--radius-sm); border:1px solid var(--border);">
                    <p style="color:var(--text-muted); font-size:0.8rem; margin-top:0.5rem;">Upload a new image below to replace, or leave empty to keep this one.</p>
                </div>
                ` : ''}

                <form id="submissionForm">
                    <!-- SECTION 1: DATA TOYZ TRADING SCORE -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>1. Data Toyz Trading Score (DTS)</h3>
                            <p>Rate the following 5 Pillars (0-20 points each).</p>
                            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem; line-height:1.5;">Combined DTS Total (0&ndash;100) reflects overall market sentiment. Higher scores indicate stronger market positioning.</p>
                        </div>
                        <div class="grid-2">
                            ${this.createSlider('mts_community', 'Community Demand', 0, 20, isEdit && ed.mts_community != null ? ed.mts_community : 10, 'Hype & Desirability')}
                            ${this.createSlider('mts_buzz', 'Buzz Momentum', 0, 20, isEdit && ed.mts_buzz != null ? ed.mts_buzz : 10, 'Current Social Momentum')}
                            ${this.createSlider('mts_liquidity', 'Trade Liquidity', 0, 20, isEdit && ed.mts_liquidity != null ? ed.mts_liquidity : 10, 'Ease of moving the item')}
                            ${this.createSlider('mts_risk', 'Replaceability Risk', 0, 20, isEdit && ed.mts_risk != null ? ed.mts_risk : 10, 'Likelihood of alternative release')}
                            ${this.createSlider('mts_appeal', 'Cross-Faction Appeal', 0, 20, isEdit && ed.mts_appeal != null ? ed.mts_appeal : 10, 'Broader collector interest')}
                        </div>
                    </div>

                    <!-- SECTION 2: 4-AXIS FORECASTING -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>2. Risk Forecasting</h3>
                            <p>Assign risk bias and timeframe.</p>
                            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem; line-height:1.5;">
                                <strong>Bullish</strong> = price likely to rise &nbsp;|&nbsp; <strong>Neutral</strong> = stable/minimal movement &nbsp;|&nbsp; <strong>Bearish</strong> = price likely to decline
                            </p>
                        </div>
                        
                        <div style="margin-bottom:1.5rem;">
                            <label class="form-label">Forecast Horizon</label>
                            <div class="segmented-control">
                                <label><input type="radio" name="timeframe" value="short" ${!isEdit || ed.timeframe === 'short' ? 'checked' : ''}><span>Short (0-6m)</span></label>
                                <label><input type="radio" name="timeframe" value="mid" ${isEdit && ed.timeframe === 'mid' ? 'checked' : ''}><span>Mid (6-18m)</span></label>
                                <label><input type="radio" name="timeframe" value="long" ${isEdit && ed.timeframe === 'long' ? 'checked' : ''}><span>Long (18-36m)</span></label>
                            </div>
                        </div>

                        <div class="grid-2">
                            ${this.createRiskSelector('risk_character', 'Character Demand', isEdit && ed.risk_character ? ed.risk_character : 'neutral')}
                            ${this.createRiskSelector('risk_engineering', 'Engineering Relevance', isEdit && ed.risk_engineering ? ed.risk_engineering : 'neutral')}
                            ${this.createRiskSelector('risk_ecosystem', 'Ecosystem Dependency', isEdit && ed.risk_ecosystem ? ed.risk_ecosystem : 'neutral')}
                            ${this.createRiskSelector('risk_redeco', 'Redeco Risk', isEdit && ed.risk_redeco ? ed.risk_redeco : 'neutral')}
                        </div>
                    </div>

                    <!-- SECTION 3: PHYSICAL QUALITY SCALES -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>3. Physical Quality Metrics</h3>
                            <p>Rate the in-hand objective quality (0.0 to 10.0).</p>
                        </div>
                        <div class="grid-2">
                            ${this.createSlider('pq_build', 'Build Quality', 0, 10, isEdit && ed.pq_build != null ? ed.pq_build : 5.0, '', 0.1)}
                            ${this.createSlider('pq_paint', 'Paint Application', 0, 10, isEdit && ed.pq_paint != null ? ed.pq_paint : 5.0, '', 0.1)}
                            ${this.createSlider('pq_articulation', 'Articulation/Function', 0, 10, isEdit && ed.pq_articulation != null ? ed.pq_articulation : 5.0, '', 0.1)}
                            ${this.createSlider('pq_accuracy', 'Design Accuracy', 0, 10, isEdit && ed.pq_accuracy != null ? ed.pq_accuracy : 5.0, '', 0.1)}
                            ${this.createSlider('pq_presence', 'Display Presence', 0, 10, isEdit && ed.pq_presence != null ? ed.pq_presence : 5.0, '', 0.1)}
                            ${this.createSlider('pq_value', 'Price/Value Ratio', 0, 10, isEdit && ed.pq_value != null ? ed.pq_value : 5.0, '', 0.1)}
                            ${this.createSlider('pq_packaging', 'Packaging/Extras', 0, 10, isEdit && ed.pq_packaging != null ? ed.pq_packaging : 5.0, '', 0.1)}
                        </div>
                        
                        <div style="margin-top:2rem; padding-top:2rem; border-top:1px solid var(--border-light);">
                            <h4 style="margin-bottom:1.5rem; color:var(--accent); font-size:1.2rem;">Transformation Analysis</h4>
                            
                            <div class="form-group" style="margin-bottom:2rem;">
                                <label class="form-label" style="font-size:1rem;">Transformation Frustration Scale (1.0 - 10.0)</label>
                                <input type="range" id="trans_frustration" name="trans_frustration" min="1.0" max="10.0" step="0.1" value="${isEdit && ed.trans_frustration != null ? ed.trans_frustration : '5.5'}" oninput="this.nextElementSibling.querySelector('span').innerText = parseFloat(this.value).toFixed(1); app.updateFrustrationLabel(this.value)">
                                <div style="display:flex; justify-content:space-between; margin-top:0.5rem;">
                                    <span style="font-weight:700; color:var(--accent);"><span>${isEdit && ed.trans_frustration != null ? parseFloat(ed.trans_frustration).toFixed(1) : '5.5'}</span> / 10</span>
                                    <span id="label_trans_frustration" style="color:var(--text-secondary); font-style:italic;"></span>
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label" style="font-size:1rem;">After-Transformation Satisfaction Scale (1.0 - 10.0)</label>
                                <input type="range" id="trans_satisfaction" name="trans_satisfaction" min="1.0" max="10.0" step="0.1" value="${isEdit && ed.trans_satisfaction != null ? ed.trans_satisfaction : '5.5'}" oninput="this.nextElementSibling.querySelector('span').innerText = parseFloat(this.value).toFixed(1); app.updateSatisfactionLabel(this.value)">
                                <div style="display:flex; justify-content:space-between; margin-top:0.5rem;">
                                    <span style="font-weight:700; color:var(--accent);"><span>${isEdit && ed.trans_satisfaction != null ? parseFloat(ed.trans_satisfaction).toFixed(1) : '5.5'}</span> / 10</span>
                                    <span id="label_trans_satisfaction" style="color:var(--text-secondary); font-style:italic;"></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 4: EVIDENCE -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>4. Analyst Notes & Evidence</h3>
                        </div>
                        <div class="form-group" style="margin-bottom:1.5rem;">
                            <label class="form-label">Upload Evidence (Image)</label>
                            <input type="file" id="image_upload" name="image_upload" accept="image/*" style="width:100%; padding: 0.5rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary);">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Analyst Field Notes</label>
                            <textarea id="analyst_notes" name="analyst_notes" rows="4" placeholder="Detail engineering quirks, market context, or specific observations...">${isEdit && ed.analyst_notes ? escapeHTML(ed.analyst_notes) : ''}</textarea>
                        </div>
                    </div>

                    <!-- SECTION 5: AFTERMARKET VALUATION -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>5. Aftermarket Valuation</h3>
                            <p>What is the current true street value?</p>
                            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem; line-height:1.5;">Enter the average current selling price on secondary markets (eBay, Mercari, BST groups). This feeds the Market Intelligence pricing system.</p>
                        </div>
                        <div class="form-group" style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:1.5rem; color:var(--text-secondary);">$</span>
                            <input type="number" name="market_price" step="0.01" min="0" required placeholder="120.00" ${isEdit && ed.market_price ? `value="${ed.market_price}"` : ''} style="width:100%; max-width:200px; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:1.25rem;">
                        </div>
                        <div class="form-group" style="margin-top:1.5rem;">
                            <label class="form-label">Your Cost Basis <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">&#128274; Only visible to you (optional)</span></label>
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                                <span style="font-size:1.25rem; color:var(--text-secondary);">$</span>
                                <input type="number" name="cost_basis" step="0.01" min="0" placeholder="99.99" ${isEdit && ed.cost_basis ? `value="${ed.cost_basis}"` : ''} style="width:100%; max-width:200px; padding:0.65rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:1.1rem;">
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 6: RECOMMENDATION -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>6. Community Recommendation</h3>
                            <p>Do you officially recommend acquiring this target?</p>
                        </div>
                        <div class="segmented-control" style="max-width:400px; margin:0 auto;">
                            <label class="risk-bullish">
                                <input type="radio" name="recommendation" value="yes" required ${isEdit && ed.recommendation === 'yes' ? 'checked' : ''}>
                                <span>YES</span>
                            </label>
                            <label class="risk-bearish">
                                <input type="radio" name="recommendation" value="no" required ${isEdit && ed.recommendation === 'no' ? 'checked' : ''}>
                                <span>NO</span>
                            </label>
                        </div>
                    </div>

                    <!-- SECTION 7: TRADE VALUE STAR RATING -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>7. Trade Value Rating</h3>
                            <p>How would you rate this figure's overall trade value? (1-5 Stars)</p>
                        </div>
                        <input type="hidden" id="tradeRating" name="tradeRating" value="${isEdit && ed.tradeRating ? ed.tradeRating : '0'}">
                        <div style="display:flex; justify-content:center; gap:0.5rem; margin-top:1rem;">
                            ${[1, 2, 3, 4, 5].map(n => `
                                <button type="button" class="starBtn" data-val="${n}" style="background:none; border:none; cursor:pointer; font-size:2.5rem; color:var(--border-light); transition:all 0.2s; padding:0.25rem;" onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'">
                                    ★
                                </button>
                            `).join('')}
                        </div>
                        <div id="tradeRatingLabel" style="text-align:center; margin-top:0.75rem; font-size:0.95rem; color:var(--text-muted); font-style:italic;">Select a rating</div>
                    </div>
                    
                    <button type="submit" class="btn" style="width:100%; padding:1.25rem; font-size:1.2rem; margin-top:1rem;">${isEdit ? 'Update Intelligence Report' : 'Commit Intelligence Report'}</button>
                </form>
            </div>
        `;

        // Handle Form Submission
        document.getElementById('submissionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const rating = parseInt(document.getElementById('tradeRating').value);
            if (!rating || rating < 1) {
                alert('Please select a Trade Value Rating (1-5 Stars) before submitting.');
                return;
            }
            this.submitIntel(e.target);
        });

        // Star Rating Handlers
        const starLabels = ['', '★ Poor — Not worth trading for', '★★ Below Average — Limited appeal', '★★★ Fair — Decent trade value', '★★★★ Great — High demand piece', '★★★★★ Elite — Grail-tier trade asset'];
        document.querySelectorAll('.starBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = parseInt(btn.dataset.val);
                document.getElementById('tradeRating').value = val;
                document.getElementById('tradeRatingLabel').innerText = starLabels[val];
                document.getElementById('tradeRatingLabel').style.color = '#fbbf24';
                document.querySelectorAll('.starBtn').forEach(b => {
                    b.style.color = parseInt(b.dataset.val) <= val ? '#fbbf24' : 'var(--border-light)';
                });
            });
        });

        // Pre-fill star rating and labels for edit mode
        if (isEdit && ed.tradeRating) {
            const preVal = parseInt(ed.tradeRating);
            if (preVal >= 1 && preVal <= 5) {
                document.getElementById('tradeRatingLabel').innerText = starLabels[preVal];
                document.getElementById('tradeRatingLabel').style.color = '#fbbf24';
                document.querySelectorAll('.starBtn').forEach(b => {
                    b.style.color = parseInt(b.dataset.val) <= preVal ? '#fbbf24' : 'var(--border-light)';
                });
            }
        }

        // Initialize transformation labels with current slider values
        this.updateFrustrationLabel(document.getElementById('trans_frustration').value);
        this.updateSatisfactionLabel(document.getElementById('trans_satisfaction').value);
    }

    async submitIntel(form) {
        const isEdit = !!this.editingSubmission;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerText;

        // Inline validation before submit
        const recommendation = form.querySelector('input[name="recommendation"]:checked');
        if (!recommendation) {
            this.showFormError('Please select a Community Recommendation (Yes or No).');
            form.querySelector('input[name="recommendation"]').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        const marketPrice = form.querySelector('input[name="market_price"]');
        if (!marketPrice.value || parseFloat(marketPrice.value) <= 0) {
            this.showFormError('Please enter an Aftermarket Valuation (market price).');
            marketPrice.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
            marketPrice.focus();
            return;
        }

        // Loading state
        submitBtn.disabled = true;
        submitBtn.innerText = isEdit ? 'Updating Report...' : 'Committing Report...';
        submitBtn.style.opacity = '0.7';

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Calculate scores
        const mtsTotal = parseFloat(data.mts_community) + parseFloat(data.mts_buzz) + parseFloat(data.mts_liquidity) + parseFloat(data.mts_risk) + parseFloat(data.mts_appeal);

        const pqSum = parseFloat(data.pq_build) + parseFloat(data.pq_paint) + parseFloat(data.pq_articulation) + parseFloat(data.pq_accuracy) + parseFloat(data.pq_presence) + parseFloat(data.pq_value) + parseFloat(data.pq_packaging) + parseFloat(data.trans_frustration) + parseFloat(data.trans_satisfaction);
        // Approval rating out of 100 based on the 9 physical categories out of 10
        const approvalScore = ((pqSum / 90) * 100).toFixed(1);
        const overallGrade = ((parseFloat(mtsTotal) + parseFloat(approvalScore)) / 2).toFixed(1);

        const formPayload = new FormData();
        formPayload.append('targetId', this.currentTarget.id);
        formPayload.append('targetName', this.currentTarget.name);
        formPayload.append('targetTier', this.currentTarget.classTie);
        formPayload.append('date', isEdit ? this.editingSubmission.date : new Date().toISOString());
        formPayload.append('mtsTotal', mtsTotal.toString());
        formPayload.append('approvalScore', approvalScore.toString());

        data.overallGrade = overallGrade;
        formPayload.append('data', JSON.stringify(data));

        let imageFile = document.getElementById('image_upload').files[0];
        if (imageFile) {
            imageFile = await this.compressImage(imageFile, 1200, 0.8);
            formPayload.append('image', imageFile);
        }

        try {
            const url = isEdit ? `${API_URL}/submissions/${this.editingSubmission.id}` : `${API_URL}/submissions`;
            const method = isEdit ? 'PUT' : 'POST';
            const req = await this.authFetch(url, { method, body: formPayload });
            if (req.ok) {
                this.editingSubmission = null;
                if (isEdit) {
                    this.showFormSuccess(`Intelligence report updated. Overall Grade: ${overallGrade}/100`);
                    this.currentView = 'dashboard';
                } else {
                    this.showFormSuccess(`Intelligence on ${this.currentTarget.name} committed. Overall Grade: ${overallGrade}/100`);
                    this.currentView = 'pulse';
                }
                setTimeout(() => this.renderApp(), 1500);
            } else {
                const errData = await req.json().catch(() => ({}));
                this.showFormError(errData.error || `Submission failed (${req.status}). Please try again.`);
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
                submitBtn.style.opacity = '1';
            }
        } catch (e) {
            this.showFormError('Connection error. Please check your network and try again.');
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
            submitBtn.style.opacity = '1';
        }
    }

    showFormSuccess(msg) {
        this.dismissFormToast();
        const toast = document.createElement('div');
        toast.id = 'formToast';
        toast.style.cssText = 'position:fixed; top:1.5rem; left:50%; transform:translateX(-50%); background:var(--success); color:#fff; padding:1rem 2rem; border-radius:var(--radius-sm); font-weight:700; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.3); font-size:1rem; text-align:center; max-width:90vw; animation:fadeIn 0.3s ease;';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    showFormError(msg) {
        this.dismissFormToast();
        const toast = document.createElement('div');
        toast.id = 'formToast';
        toast.style.cssText = 'position:fixed; top:1.5rem; left:50%; transform:translateX(-50%); background:var(--danger); color:#fff; padding:1rem 2rem; border-radius:var(--radius-sm); font-weight:700; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.3); font-size:1rem; text-align:center; max-width:90vw; animation:fadeIn 0.3s ease;';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    dismissFormToast() {
        const existing = document.getElementById('formToast');
        if (existing) existing.remove();
    }


    async renderDashboard(container) {
        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 5)}</div>`;

        let userSubs = [];
        try {
            const res = await fetch(`${API_URL}/submissions/user/${this.user.username}`);
            if (res.ok) userSubs = await res.json();
        } catch (e) {
            console.error("Failed historical log", e);
        }

        let tableHtml = '<div style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">';

        if (userSubs.length === 0) {
            tableHtml += '<div style="padding: 3rem; text-align: center; color: var(--text-muted); font-size: 1.1rem;">No intelligence logs securely committed yet.</div>';
        } else {
            tableHtml += `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Target Name</th>
                            <th>Overall Grade</th>
                            <th style="text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            tableHtml += userSubs.map(s => {
                const d = new Date(s.date).toLocaleDateString();
                const tier = s.targetTier ? s.targetTier : "Unknown";
                return `
                    <tr>
                        <td style="color:var(--text-secondary); font-size:0.9rem;">${d}${s.editedAt ? ' <span style="color:var(--text-muted); font-size:0.75rem; font-style:italic;">(edited)</span>' : ''}</td>
                        <td style="font-weight:600;">
                            <span class="tier-badge ${escapeHTML(tier).toLowerCase()}" style="margin-right:0.5rem; font-size:0.6rem;">${escapeHTML(tier)}</span>
                            <span style="cursor:pointer; text-decoration:underline; text-decoration-color:var(--border-light); text-underline-offset:4px; transition:color 0.2s;" onclick="app.selectTarget(${s.targetId})" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color=''">
                                ${escapeHTML(s.targetName)}
                            </span>
                        </td>
                        <td><span style="color:var(--accent); font-weight:700;">${((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1)}</span></td>
                        <td style="text-align: right; white-space:nowrap;">
                            <button class="badge" style="border-color:var(--accent); color:var(--accent); background:transparent; margin-right:0.5rem;" onclick="app.editSubmission(${s.id}, ${s.targetId})">✏️ Edit</button>
                            <button class="badge" style="border-color:var(--danger); color:var(--danger); background:transparent;" onclick="app.deleteSubmission(${s.id})">Retract</button>
                        </td>
                    </tr>
                `;
            }).join('');
            tableHtml += '</tbody></table>';
        }
        tableHtml += '</div>';

        container.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;">
                <div style="margin-bottom:2rem;">
                    <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">Intelligence Log</h2>
                    <p style="color:var(--text-secondary); font-size:1.1rem;">Manage your active user data submissions.</p>
                </div>
                ${tableHtml}
            </div>
        `;
    }

    async renderLeaderboards(container) {
        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 5)}</div>`;

        let allSubs = [];
        try {
            const res = await fetch(`${API_URL}/submissions`);
            if (res.ok) allSubs = await res.json();
        } catch (e) {
            console.error("Failed fetching global logs", e);
        }

        const authorCounts = {};
        allSubs.forEach(s => {
            authorCounts[s.author] = (authorCounts[s.author] || 0) + 1;
        });

        const sortedAuthors = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]);

        let tableHtml = '<div style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">';

        if (sortedAuthors.length === 0) {
            tableHtml += '<div style="padding: 3rem; text-align: center; color: var(--text-muted); font-size: 1.1rem;">No global users found.</div>';
        } else {
            tableHtml += `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 80px; text-align: center;">Rank</th>
                            <th>Username</th>
                            <th>Intelligence Scans</th>
                            <th>Global Title</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            tableHtml += sortedAuthors.map((authorData, index) => {
                const [authorName, count] = authorData;
                let title = "Rookie Analyst";
                let titleColor = "var(--text-muted)";

                if (count >= 15) { title = "Prime Intel Officer"; titleColor = "#a855f7"; }
                else if (count >= 10) { title = "Senior Field Evaluator"; titleColor = "var(--neutral)"; }
                else if (count >= 5) { title = "Field Evaluator"; titleColor = "var(--success)"; }
                else if (count >= 2) { title = "Junior Analyst"; titleColor = "var(--accent)"; }

                let rankBadge = `<span style="font-weight: 800; color: var(--text-secondary);">${index + 1}</span>`;
                if (index === 0) rankBadge = `<span style="color: #fbbf24; font-size: 1.5rem; line-height: 1;">👑</span>`;
                else if (index === 1) rankBadge = `<span style="color: #94a3b8; font-weight: 800; font-size: 1.1rem;">2</span>`;
                else if (index === 2) rankBadge = `<span style="color: #b45309; font-weight: 800; font-size: 1.1rem;">3</span>`;

                return `
                    <tr>
                        <td style="text-align: center; vertical-align: middle;">${rankBadge}</td>
                        <td style="font-weight: 800; font-size: 1.1rem; color: ${this.user.username === authorName ? 'var(--accent)' : 'var(--text-primary)'};" class="user-link" onclick="app.viewUserProfile('${escapeHTML(authorName).replace(/'/g, "\\'")}')">${escapeHTML(authorName)} ${this.user.username === authorName ? '<span style="font-weight:400; font-size:0.75rem; color:var(--text-muted);">(You)</span>' : ''}</td>
                        <td><span style="font-weight: 800;">${count}</span> <span style="font-size: 0.8rem; color: var(--text-secondary);">logs</span></td>
                        <td><span class="badge" style="background:transparent; border-color:${titleColor}; color:${titleColor};">${title}</span></td>
                    </tr>
                `;
            }).join('');
            tableHtml += '</tbody></table>';
        }
        tableHtml += '</div>';

        container.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;">
                <div style="margin-bottom:2rem; text-align:center;">
                    <h2 style="font-size:2.5rem; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em;">Top Analysts</h2>
                    <p style="color:var(--text-secondary); font-size:1.1rem;">Global user ranking by total intelligence contributions.</p>
                </div>
                ${tableHtml}
            </div>
        `;
    }

    renderProfile(container) {
        container.innerHTML = `
            <div style="max-width: 600px; margin: 0 auto; padding-bottom: 3rem;">
                <div style="margin-bottom:2rem; text-align:center;">
                    <h2 style="font-size:2.5rem; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em;">Operative Settings</h2>
                    <p style="color:var(--text-secondary); font-size:1.1rem;">Manage your active identity credentials.</p>
                </div>

                <div class="card" style="padding: 2.5rem; margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:0.95rem; color:var(--text-secondary); margin-bottom:1.5rem;">🪪 Identity Credentials</h3>
                    <form id="profileForm">
                        <div class="form-group" style="margin-bottom:1.5rem;">
                            <label class="form-label">Profile Avatar</label>
                            <div style="display:flex; align-items:center; gap:1rem;">
                                ${this.user.avatar ? `<img src="${this.user.avatar}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid var(--border);" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:50px; height:50px; border-radius:50%; background:var(--bg-surface); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-weight:700;\\'>${escapeHTML(this.user.username).charAt(0).toUpperCase()}</div>';">` : `<div style="width:50px; height:50px; border-radius:50%; background:var(--bg-surface); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-weight:700;">${escapeHTML(this.user.username).charAt(0).toUpperCase()}</div>`}
                                <input type="file" id="profAvatar" accept="image/*" style="flex:1; padding:0.5rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Active Username</label>
                            <input type="text" id="profUsername" value="${escapeHTML(this.user.username)}" required style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <div class="form-group" style="margin-bottom: 2rem;">
                            <label class="form-label">Secure Email Address</label>
                            <input type="email" id="profEmail" value="${escapeHTML(this.user.email || '')}" required style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <button type="submit" class="btn" style="width:100%; padding:1rem; font-size:1.1rem;">Encrypt & Update Profile</button>
                    </form>
                </div>

                <div class="card" style="padding: 2.5rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:0.95rem; color:var(--text-secondary); margin-bottom:1.5rem;">🔐 Change Password</h3>
                    <form id="changePasswordForm">
                        <div class="form-group">
                            <label class="form-label">Current Password</label>
                            <input type="password" id="cpOldPassword" required placeholder="Enter current password" style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <div class="form-group">
                            <label class="form-label">New Password</label>
                            <input type="password" id="cpNewPassword" required placeholder="Enter new password" style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <div class="form-group" style="margin-bottom: 2rem;">
                            <label class="form-label">Confirm New Password</label>
                            <input type="password" id="cpConfirmPassword" required placeholder="Confirm new password" style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <button type="submit" class="btn" style="width:100%; padding:1rem; font-size:1.1rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary);">Update Password</button>
                    </form>
                </div>

                <div class="card" style="padding: 2.5rem; margin-top:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:0.95rem; color:var(--text-secondary); margin-bottom:0.5rem;">Notification Settings</h3>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:2rem;">Control which notifications you receive and how they're delivered.</p>
                    <div id="notifPrefsLoading" style="text-align:center; color:var(--text-muted); padding:1rem;">Loading preferences...</div>
                    <div id="notifPrefsGrid" style="display:none;">
                        <!-- Column Headers -->
                        <div style="display:flex; justify-content:flex-end; gap:0; margin-bottom:0.75rem; padding-right:0.25rem;">
                            <span style="width:64px; text-align:center; font-size:0.8rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.03em;">Email</span>
                            <span style="width:64px; text-align:center; font-size:0.8rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.03em;">In-App</span>
                        </div>

                        <!-- Row: Reply to broadcast -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm); margin-bottom:0.5rem;">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when someone replies to my broadcast</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="comment_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="comment_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: Reaction to post -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm); margin-bottom:0.5rem;">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when someone reacts to my post</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="reaction_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="reaction_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: Co-reviewer -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm); margin-bottom:0.5rem;">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when another analyst reviews the same figure</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="co_reviewer_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="co_reviewer_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: New figure -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm); margin-bottom:0.5rem;">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when a new figure is added to the catalog</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="new_figure_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="new_figure_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: HQ Updates -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm); margin-bottom:0.5rem;">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me of important updates from Data Toyz HQ</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="hq_updates_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="hq_updates_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: Breakout Room Messages -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm);">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me of new messages in Breakout Rooms</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="message_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="message_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: @Mentions -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm);">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when I'm @mentioned</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="mention_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="mention_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: New Follower -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm);">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when someone follows me</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="follow_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="follow_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: Flagged Posts (Admin Only) -->
                        ${this.user.role === 'admin' ? `
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm);">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when posts are flagged <span style="color:#fbbf24; font-size:0.75rem;">★ Admin</span></span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="flag_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="flag_inapp">
                                </label>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    <div id="notifPrefsSaved" style="display:none; text-align:center; color:var(--success); font-size:0.85rem; margin-top:0.75rem;">Preferences saved.</div>
                </div>
            </div>
        `;

        // Profile update handler
        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('profUsername').value.trim();
            const email = document.getElementById('profEmail').value.trim();
            let avatarFile = document.getElementById('profAvatar').files[0];
            if (avatarFile) avatarFile = await this.compressImage(avatarFile, 256, 0.8);

            const formData = new FormData();
            formData.append('username', username);
            formData.append('email', email);
            formData.append('oldUsername', this.user.username);
            if (avatarFile) formData.append('avatar', avatarFile);

            try {
                const btn = e.target.querySelector('button');
                btn.disabled = true;
                btn.innerText = "Encrypting...";

                const res = await this.authFetch(`${API_URL}/users/${this.user.id}`, {
                    method: 'PUT',
                    body: formData
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to update profile.');

                alert(data.message);
                if (data.token) {
                    this.token = data.token;
                    localStorage.setItem('terminal_token', data.token);
                }
                this.user = { id: data.id, username: data.username, email: data.email, avatar: data.avatar, role: data.role };
                this.init(); // Refresh navbar
            } catch (err) {
                alert(err.message);
            }
        });

        // Change password handler
        document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const oldPassword = document.getElementById('cpOldPassword').value;
            const newPassword = document.getElementById('cpNewPassword').value;
            const confirmPassword = document.getElementById('cpConfirmPassword').value;

            if (newPassword !== confirmPassword) { alert('New passwords do not match.'); return; }
            if (newPassword.length < 4) { alert('New password must be at least 4 characters.'); return; }

            try {
                const btn = e.target.querySelector('button');
                btn.disabled = true;
                btn.innerText = "Updating...";

                const res = await this.authFetch(`${API_URL}/auth/change-password`, {
                    method: 'POST',
                    body: JSON.stringify({ oldPassword, newPassword })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to change password.');

                alert(data.message || 'Password updated successfully.');
                document.getElementById('cpOldPassword').value = '';
                document.getElementById('cpNewPassword').value = '';
                document.getElementById('cpConfirmPassword').value = '';
                btn.disabled = false;
                btn.innerText = "Update Password";
            } catch (err) {
                alert(err.message);
                const btn = e.target.querySelector('button');
                btn.disabled = false;
                btn.innerText = "Update Password";
            }
        });

        // Load notification preferences
        this.loadNotifPrefs();
    }

    async loadNotifPrefs() {
        try {
            const res = await this.authFetch(`${API_URL}/notifications/preferences`);
            const prefs = await res.json();
            if (!res.ok) throw new Error(prefs.error);

            const grid = document.getElementById('notifPrefsGrid');
            const loading = document.getElementById('notifPrefsLoading');
            if (!grid || !loading) return;

            loading.style.display = 'none';
            grid.style.display = 'block';

            document.querySelectorAll('.notifPref').forEach(cb => {
                const key = cb.dataset.key;
                cb.checked = prefs[key] === true;
                cb.addEventListener('change', () => this.saveNotifPref(key, cb.checked));
            });
        } catch (e) {
            const loading = document.getElementById('notifPrefsLoading');
            if (loading) loading.textContent = 'Failed to load preferences.';
        }
    }

    async saveNotifPref(key, value) {
        try {
            await this.authFetch(`${API_URL}/notifications/preferences`, {
                method: 'PUT',
                body: JSON.stringify({ [key]: value })
            });
            const saved = document.getElementById('notifPrefsSaved');
            if (saved) {
                saved.style.display = 'block';
                setTimeout(() => { saved.style.display = 'none'; }, 2000);
            }
        } catch (e) {
            console.error('Failed to save preference:', e);
        }
    }

    // --- DOCUMENTATION PAGE --- //
    renderDocs(container) {
        const sections = [
            { id: 'overview', title: 'Platform Overview' },
            { id: 'navigation', title: 'Navigation Guide' },
            { id: 'comms-feed', title: 'Comms Feed' },
            { id: 'breakout-rooms', title: 'Breakout Rooms' },
            { id: 'target-search', title: 'Target Search & Catalog' },
            { id: 'trade-scan', title: 'Trade Scan (Submissions)' },
            { id: 'grading', title: 'Grading System' },
            { id: 'market-pulse', title: 'Market Pulse Dashboard' },
            { id: 'intel-history', title: 'My Intel History' },
            { id: 'leaderboards', title: 'Global Leaderboard & Ranks' },
            { id: 'profile', title: 'Profile Settings' },
            { id: 'notifications', title: 'Notifications' },
            { id: 'profiles-following', title: 'User Profiles & Following' },
            { id: 'flagging', title: 'Flagging a Post' },
            { id: 'admin', title: 'Admin Panel' },
            { id: 'security', title: 'Security & Authentication' },
            { id: 'soc2', title: 'SOC 2 Alignment' },
            { id: 'glossary', title: 'Glossary' }
        ];

        container.innerHTML = `
            <div style="max-width:860px; margin:0 auto; padding-bottom:4rem;">
                <div style="margin-bottom:2.5rem; text-align:center;">
                    <h2 style="font-size:2.5rem; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em;">Data Toyz Documentation</h2>
                    <p style="color:var(--text-secondary); font-size:1.1rem;">Comprehensive field manual for all Data Toyz operations.</p>
                </div>

                <!-- TABLE OF CONTENTS -->
                <div class="card" style="margin-bottom:2.5rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:0.9rem; color:var(--text-muted); margin-bottom:1rem;">Table of Contents</h3>
                    <div class="grid-2" style="gap:0.5rem 2rem;">
                        ${sections.map((s, i) => `
                            <a href="#doc-${s.id}" onclick="event.preventDefault(); document.getElementById('doc-${s.id}').scrollIntoView({behavior:'smooth'});" style="color:var(--accent); text-decoration:none; font-size:0.95rem; padding:0.3rem 0; display:block;">
                                <span style="color:var(--text-muted); margin-right:0.5rem;">${(i + 1).toString().padStart(2, '0')}.</span> ${s.title}
                            </a>
                        `).join('')}
                    </div>
                </div>

                <!-- 01. PLATFORM OVERVIEW -->
                <div id="doc-overview" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">01. Platform Overview</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        <strong>Data Toyz Terminal</strong> is a community-driven intelligence platform for Transformers action figure collectors. The platform uses a spy/intelligence agency theme where collectors are <strong>operatives</strong>, figures are <strong>targets</strong>, and reviews are <strong>intel reports</strong>.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The core mission: evaluate, rate, and track the collectible market for Transformers figures across all brands and product lines. Operatives submit detailed intelligence reports grading each figure on market sentiment and physical quality, building a comprehensive database of community-driven reviews.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8;">
                        <strong>Supported Brands:</strong> Hasbro, Takara Tomy, Fans Toys, X-Transbots, and other 3rd party manufacturers.<br>
                        <strong>Product Lines:</strong> Legacy Evolution, Studio Series, Missing Link, Masterpiece, 3rd Party, and more.<br>
                        <strong>Class Tiers:</strong> Deluxe, Voyager, Leader, Commander, Masterpiece.
                    </p>
                </div>

                <!-- 02. NAVIGATION GUIDE -->
                <div id="doc-navigation" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">02. Navigation Guide</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">The left sidebar contains all primary navigation tabs:</p>
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="text-align:left; border-bottom:2px solid var(--border-light);">
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Tab</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Comms Feed</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Social timeline for posting updates, comments, and reactions</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Breakout Rooms</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Private encrypted channels for 1-on-1 DMs and group chats</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Market Pulse</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Dashboard with market statistics, brand indexes, and top-rated figures</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Target Search</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Browse and search the complete figure catalog with real-time filtering</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">My Intel History</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">View all your past intel report submissions</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Global Leaderboard</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Top operatives ranked by number of submissions</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Profile Settings</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Update your username, email, avatar, and password</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Documentation</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">This page &mdash; full platform reference</td></tr>
                            <tr><td style="padding:0.6rem 1rem; font-weight:600;">Admin Panel</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Admin-only: manage users, figures, and view analytics</td></tr>
                        </tbody>
                    </table>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-top:1rem;">The theme toggle at the bottom switches between Dark Mode and Light Mode. Your current view is preserved across page reloads.</p>
                </div>

                <!-- 03. COMMS FEED -->
                <div id="doc-comms-feed" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">03. Comms Feed</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Comms Feed is the social hub of the terminal. Operatives can broadcast messages to the entire community, attach images, and engage with each other.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Features:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Post Broadcasts</strong> &mdash; Share text updates with optional image attachments</li>
                        <li><strong>Sentiment Tags</strong> &mdash; Each post is tagged with a sentiment: \u{1F525} HOT (bullish), \u{1F937} FENCE (neutral), or \u{1F9CA} NOT (bearish)</li>
                        <li><strong>Comments</strong> &mdash; Reply to any broadcast to start a discussion thread</li>
                        <li><strong>Emoji Reactions</strong> &mdash; React to posts with one of four emojis: \u{1F44D} \u{2764}\u{FE0F} \u{1F602} \u{1F610} (one reaction per user per post, toggles on/off)</li>
                        <li><strong>@-Mentions</strong> &mdash; Tag other operatives with <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">@username</code> in posts or comments. The mentioned operative receives an in-app notification and the mention appears as a clickable profile link.</li>
                        <li><strong>User Profiles</strong> &mdash; Click any username to view their operative dossier</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Post Management:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Edit Post</strong> &mdash; Authors can edit their own broadcasts by clicking the \u{270F}\u{FE0F} button. Edited posts display an <em>(edited)</em> tag next to the timestamp.</li>
                        <li><strong>Delete Post</strong> &mdash; Authors can delete their own broadcasts via the \u{1F5D1}\u{FE0F} button. Admins can delete any broadcast.</li>
                        <li><strong>Share Post</strong> &mdash; Click \u{1F4CB} to copy a direct link to any broadcast. Shared links work as deep links &mdash; recipients are taken straight to that post after login.</li>
                    </ul>

                    <p style="color:var(--text-muted); font-size:0.85rem;">Posts appear in reverse chronological order (newest first). Images are uploaded as base64-encoded data.</p>
                </div>

                <!-- 04. BREAKOUT ROOMS -->
                <div id="doc-breakout-rooms" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">04. Breakout Rooms</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Breakout Rooms are encrypted private channels within Global Comms. Unlike the public Comms Feed, Breakout Rooms allow operatives to communicate in private &mdash; either one-on-one or in small groups.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Room Types:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Direct Messages (DMs)</strong> &mdash; Private 1-on-1 channels between two operatives. Auto-deduplicated: opening a DM with someone you already have a channel with will reopen the existing conversation.</li>
                        <li><strong>Group Channels</strong> &mdash; Named rooms with multiple members. Created via the "+ New Room" button with a custom name and invited operatives.</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Messaging Features:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Text Messages</strong> &mdash; Send real-time text transmissions to channel members</li>
                        <li><strong>Image Attachments</strong> &mdash; Upload images via the camera icon in the input bar</li>
                        <li><strong>Emoji Reactions</strong> &mdash; React to any message with one of five emojis (\u{1F44D} \u{2764}\u{FE0F} \u{1F602} \u{1F622} \u{1F610}). Reactions toggle on/off.</li>
                        <li><strong>Typing Indicators</strong> &mdash; See when another operative is composing a message in real time</li>
                        <li><strong>Read Receipts</strong> &mdash; Unread message counts appear on room cards and the nav badge</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Room Management:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Members Panel</strong> &mdash; Click "Members" in any channel header to view all operatives. The room creator is labeled Commander.</li>
                        <li><strong>Add Members</strong> &mdash; Commanders can invite additional operatives to group channels by searching usernames</li>
                        <li><strong>Remove Members</strong> &mdash; Commanders can remove members from group channels</li>
                        <li><strong>Leave Channel</strong> &mdash; Any member can leave a channel at any time. Ownership auto-transfers if the Commander leaves.</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Starting a DM:</strong></p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        You can open a direct channel with any operative by clicking the <strong>"Open Secure Channel"</strong> button on their profile dossier. This is accessible from any username link across the platform (Comms Feed, Leaderboard, etc.).
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Filter Tabs:</strong></p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The room list supports three filter views: <strong>All</strong> (every channel), <strong>DMs</strong> (1-on-1 only), and <strong>Groups</strong> (multi-member channels only). Rooms are sorted by most recent activity.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Messages poll for updates every 3 seconds while you are inside a channel. The nav badge polls every 15 seconds for total unread messages across all rooms.</p>
                </div>

                <!-- 05. TARGET SEARCH -->
                <div id="doc-target-search" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">05. Target Search & Catalog</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Target Search page is the central figure catalog. Every Transformers figure in the database is listed here with real-time search and filtering.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>How it works:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Search</strong> &mdash; Type to instantly filter by figure name, brand, class tier, or product line</li>
                        <li><strong>Class Tier Badges</strong> &mdash; Color-coded badges show the figure's class (Deluxe, Voyager, Leader, Commander, Masterpiece)</li>
                        <li><strong>Select a Target</strong> &mdash; Click any figure to view its full intel page with all submissions, charts, and gallery</li>
                        <li><strong>Add New Target</strong> &mdash; Any authenticated operative can add a new figure to the catalog</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8;">
                        <strong>Figure Data:</strong> Each target has a name, brand (Hasbro, Takara Tomy, etc.), class tier, and product line. Figures can also display a ranked list sorted by average community grade.
                    </p>
                </div>

                <!-- 06. TRADE SCAN -->
                <div id="doc-trade-scan" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">06. Trade Scan (Submissions)</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Trade Scan is the core evaluation form. When you select a figure from Target Search, you can "Execute Trade Scan" to submit a detailed intel report grading the figure across multiple dimensions.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>The 7-Section Evaluation Form:</strong></p>
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:1rem;">
                        <thead>
                            <tr style="text-align:left; border-bottom:2px solid var(--border-light);">
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">#</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Section</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">What You Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">1</td><td style="padding:0.6rem 1rem; font-weight:600;">Data Toyz Trading Score</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">5 market sentiment metrics (Community, Buzz, Liquidity, Risk, Appeal) &mdash; each rated 0&ndash;20</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">2</td><td style="padding:0.6rem 1rem; font-weight:600;">Risk Forecasting</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Predict market direction across 4 axes: Bullish, Neutral, or Bearish &mdash; with a selectable forecast horizon</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">3</td><td style="padding:0.6rem 1rem; font-weight:600;">Physical Quality Scales</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">9 physical attributes (Build, Paint, Articulation, Accuracy, Presence, Value, Packaging, Transformation Frustration & Satisfaction) &mdash; each rated 1-10</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">4</td><td style="padding:0.6rem 1rem; font-weight:600;">Evidence</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Upload a photo of the figure as field evidence (appears in the gallery)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">5</td><td style="padding:0.6rem 1rem; font-weight:600;">Aftermarket Valuation</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Enter the current market price for the figure</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">6</td><td style="padding:0.6rem 1rem; font-weight:600;">Community Recommendation</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Yes or No &mdash; do you recommend acquiring this target?</td></tr>
                            <tr><td style="padding:0.6rem 1rem; color:var(--text-muted);">7</td><td style="padding:0.6rem 1rem; font-weight:600;">Trade Value Star Rating</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Overall 1-5 star rating for the figure</td></tr>
                        </tbody>
                    </table>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Editing Reports:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        After submitting, you can edit any of your own reports from <strong>My Intel History</strong>. Click \u{270F}\u{FE0F} Edit &mdash; the form reopens pre-populated with your original data. Update any fields (DTS scores, risk forecasting, physical quality, evidence image, market price, recommendation, star rating) and save. Edited reports display an <em>(edited)</em> indicator next to the submission date.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Each submission is recorded and visible to the entire community. You can edit or retract your own submissions from My Intel History.</p>
                </div>

                <!-- 07. GRADING SYSTEM -->
                <div id="doc-grading" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">07. Grading System</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Every intel report generates three scores that combine into an Overall Grade:
                    </p>
                    <div style="background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:1.5rem; margin-bottom:1rem;">
                        <p style="color:var(--text-primary); line-height:2; margin-bottom:0.5rem;">
                            <strong style="color:var(--accent);">DTS Total (Data Toyz Trading Score)</strong><br>
                            Sum of 5 market metrics (Community + Buzz + Liquidity + Risk + Appeal).<br>
                            Each metric is rated 0&ndash;20, so DTS Total ranges from <strong>0 to 100</strong>.
                        </p>
                    </div>
                    <div style="background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:1.5rem; margin-bottom:1rem;">
                        <p style="color:var(--text-primary); line-height:2; margin-bottom:0.5rem;">
                            <strong style="color:var(--accent);">Approval Score</strong><br>
                            Calculated from the 9 Physical Quality ratings (each 1&ndash;10, max sum = 90).<br>
                            Formula: <code style="background:var(--bg-surface); padding:0.2rem 0.5rem; border-radius:3px; font-size:0.85rem;">(sum of 9 ratings / 90) &times; 100</code><br>
                            Result is a percentage from <strong>0 to 100</strong>.
                        </p>
                    </div>
                    <div style="background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:1.5rem; margin-bottom:1rem;">
                        <p style="color:var(--text-primary); line-height:2; margin-bottom:0.5rem;">
                            <strong style="color:var(--accent);">Overall Grade</strong><br>
                            The average of DTS Total and Approval Score.<br>
                            Formula: <code style="background:var(--bg-surface); padding:0.2rem 0.5rem; border-radius:3px; font-size:0.85rem;">(DTS Total + Approval Score) / 2</code>
                        </p>
                    </div>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Grade Color Scale:</strong></p>
                    <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                        <span style="padding:0.4rem 1rem; border-radius:4px; font-weight:700; font-size:0.9rem; color:var(--success); border:1px solid var(--success);">70+ = Strong</span>
                        <span style="padding:0.4rem 1rem; border-radius:4px; font-weight:700; font-size:0.9rem; color:#fbbf24; border:1px solid #fbbf24;">50&ndash;69 = Moderate</span>
                        <span style="padding:0.4rem 1rem; border-radius:4px; font-weight:700; font-size:0.9rem; color:var(--danger); border:1px solid var(--danger);">Below 50 = Weak</span>
                    </div>
                </div>

                <!-- 08. MARKET PULSE -->
                <div id="doc-market-pulse" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">08. Market Pulse Dashboard</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Market Pulse is a high-level analytics dashboard showing the state of the collectible market across all tracked figures.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Dashboard Sections:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Overview Stats</strong> &mdash; Total targets, total intel reports, average grade, and active operatives</li>
                        <li><strong>Top Rated Targets</strong> &mdash; Figures ranked by highest average community grade</li>
                        <li><strong>Intel Headlines</strong> &mdash; The most recent submissions across all figures</li>
                        <li><strong>Brand Indexes</strong> &mdash; Performance breakdown by brand and product line (avg grade, submission count)</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8;">
                        When you click a figure from Target Search, you see a <strong>detailed intel page</strong> with: all submissions listed, a grade trend chart over time, a price trend chart, community recommendation votes, and a <strong>Field Evidence Gallery</strong> of uploaded photos.
                    </p>
                </div>

                <!-- 09. MY INTEL HISTORY -->
                <div id="doc-intel-history" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">09. My Intel History</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        View all intel reports you have submitted. Each entry shows the target name, class tier, date, and your grade. You can click any entry to navigate to that figure's full intel page.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Actions:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>\u{270F}\u{FE0F} Edit Report</strong> &mdash; Click Edit next to any of your submissions to modify it. The Trade Scan form reopens with all original data pre-loaded. Update any fields and save.</li>
                        <li><strong>Retract Intel</strong> &mdash; Permanently delete your own submission. Admins can also retract any submission.</li>
                    </ul>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Submissions you have edited display an <em>(edited)</em> indicator next to the date. Click any entry to navigate to that figure's full intel page.</p>
                </div>

                <!-- 10. LEADERBOARDS -->
                <div id="doc-leaderboards" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">10. Global Leaderboard & Ranks</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Operatives are ranked by total number of intel submissions. The leaderboard shows the top contributors with clickable profiles.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Operative Title Progression:</strong></p>
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="text-align:left; border-bottom:2px solid var(--border-light);">
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Submissions</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Title</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem;">0 &ndash; 1</td><td style="padding:0.6rem 1rem; font-weight:600; color:var(--text-muted);">Rookie Analyst</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem;">2 &ndash; 4</td><td style="padding:0.6rem 1rem; font-weight:600; color:var(--accent);">Junior Analyst</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem;">5 &ndash; 9</td><td style="padding:0.6rem 1rem; font-weight:600; color:var(--success);">Field Evaluator</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem;">10 &ndash; 14</td><td style="padding:0.6rem 1rem; font-weight:600; color:var(--text-secondary);">Senior Field Evaluator</td></tr>
                            <tr><td style="padding:0.6rem 1rem;">15+</td><td style="padding:0.6rem 1rem; font-weight:600; color:#a78bfa;">Prime Intel Officer</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- 11. PROFILE SETTINGS -->
                <div id="doc-profile" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">11. Profile Settings</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Manage your operative identity from the Profile Settings page:
                    </p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem;">
                        <li><strong>Avatar</strong> &mdash; Upload a profile image (displayed across the platform)</li>
                        <li><strong>Username</strong> &mdash; Change your operative codename (updates all past submissions automatically)</li>
                        <li><strong>Email</strong> &mdash; Update your secure email address (used for password reset and email notifications)</li>
                        <li><strong>Change Password</strong> &mdash; Requires your current password for verification, then set a new one</li>
                        <li><strong>Notification Settings</strong> &mdash; Toggle grid to control which notifications you receive via in-app alerts and email (see section 12)</li>
                    </ul>
                </div>

                <!-- 12. NOTIFICATIONS -->
                <div id="doc-notifications" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">12. Notifications</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The notification bell in the top-right corner alerts you to activity on your content. Click a notification to navigate directly to the relevant post or figure. Use "Mark all read" to clear unread badges. Notifications poll for updates every 30 seconds.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Notification Types:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Reply to my broadcast</strong> &mdash; When someone comments on your Comms Feed post</li>
                        <li><strong>Reaction to my post</strong> &mdash; When someone reacts with an emoji to your broadcast</li>
                        <li><strong>Co-reviewer on same figure</strong> &mdash; When another operative submits an intel report on a figure you also reviewed</li>
                        <li><strong>New figure added to catalog</strong> &mdash; When an admin adds a new figure to the database</li>
                        <li><strong>Important updates from HQ</strong> &mdash; System-wide announcements from Terminal administrators</li>
                        <li><strong>Breakout Room Messages</strong> &mdash; When a new message is sent in a Breakout Room you are a member of</li>
                        <li><strong>@-Mention</strong> &mdash; When someone tags you with <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">@yourusername</code> in a broadcast or comment</li>
                        <li><strong>New Follower</strong> &mdash; When another operative starts following you</li>
                        <li><strong>Flagged Post (Admin)</strong> &mdash; When a broadcast you manage is flagged for review (admin-only)</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Notification Channels:</strong></p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Each notification type can be delivered through two independent channels:
                    </p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>In-App</strong> &mdash; Notifications appear in the bell icon dropdown and are stored in the Terminal database. Enabled by default for all types.</li>
                        <li><strong>Email</strong> &mdash; A styled intelligence briefing is sent to your registered email address. Disabled by default &mdash; opt in from your profile settings.</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Notification Settings:</strong></p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Manage your preferences from the <strong>Notification Settings</strong> card on your Profile page. A toggle grid lets you independently enable or disable each notification type for each channel. Changes auto-save immediately &mdash; no submit button required. Default preferences are created automatically the first time you visit the settings.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Tip: All notification types &mdash; including mentions, follows, and flag alerts &mdash; can be independently toggled for in-app and email delivery from your profile page.</p>
                </div>

                <!-- 13. USER PROFILES & FOLLOWING -->
                <div id="doc-profiles-following" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">13. User Profiles & Following</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Every operative has a public profile (dossier) that showcases their activity and standing in the community. You can view any operative's profile by clicking their username anywhere on the platform.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Operative Dossiers:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Avatar &amp; Identity</strong> &mdash; Profile image, username, and operative rank title</li>
                        <li><strong>Join Date</strong> &mdash; When the operative first registered</li>
                        <li><strong>Submission Count</strong> &mdash; Total number of intel reports filed</li>
                        <li><strong>Recent Intel</strong> &mdash; A list of their most recent submissions with grades</li>
                        <li><strong>Follower / Following Counts</strong> &mdash; See how many operatives follow them and how many they follow</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Following:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Follow</strong> &mdash; Click the "Follow" button on any operative's dossier to follow them. You will be notified when they post new intel.</li>
                        <li><strong>Unfollow</strong> &mdash; Click "Unfollow" to stop receiving notifications about their activity.</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Your Profile:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        Your own dossier is accessible from Profile Settings or by clicking your username. Other operatives can see your public stats, submission history, and follower counts.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Tip: Click "Open Secure Channel" on any operative's profile to start a private Breakout Room DM with them.</p>
                </div>

                <!-- 14. FLAGGING A POST -->
                <div id="doc-flagging" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">14. Flagging a Post</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        If you encounter a broadcast that violates community guidelines or contains inappropriate content, you can flag it for admin review. Flagging is anonymous to the post author &mdash; they will not be notified that their post was flagged.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>How to Flag:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Click the <strong>🚩 Report</strong> button on any broadcast in the Comms Feed</li>
                        <li>Optionally provide a reason for the flag (up to 500 characters)</li>
                        <li>Each user can flag a broadcast only once</li>
                        <li>You cannot flag your own broadcasts</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>What Happens Next:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Admins receive a notification about the flagged broadcast</li>
                        <li>Admins can view all flags in the Admin Panel under "Flagged Broadcasts"</li>
                        <li>Admins can either delete the flagged broadcast or dismiss the flag</li>
                        <li>The post author is <strong>never</strong> notified about flags on their content</li>
                    </ul>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Please flag responsibly. Flagging is meant for content that genuinely violates community standards.</p>
                </div>

                <!-- 15. ADMIN PANEL -->
                <div id="doc-admin" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">15. Admin Panel</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Admin Panel is only visible to operatives with the <strong>admin</strong> role. It provides full control over the platform:
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Analytics Dashboard:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Total figures, users, submissions, and posts at a glance</li>
                        <li>Top contributors ranked by submission count</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Figure Management:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Edit figure details (name, brand, class tier, product line)</li>
                        <li>Delete figures and all associated intel reports</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>User Management:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Add new users manually</li>
                        <li>Promote or demote users (Analyst / Admin)</li>
                        <li>Suspend or reinstate user accounts</li>
                        <li>Reset a user's password (admin backup)</li>
                        <li>Delete user accounts permanently</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Flagged Posts Queue:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem;">
                        <li>Review broadcasts reported by the community</li>
                        <li>View the post content, flag count, and reporter reasons</li>
                        <li>Dismiss flags if the content is acceptable</li>
                        <li>Delete the flagged broadcast if it violates community guidelines</li>
                    </ul>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-top:1rem;">The primary admin account (Prime Dynamixx) is protected and cannot be demoted, suspended, or deleted.</p>
                </div>

                <!-- 16. SECURITY & AUTHENTICATION -->
                <div id="doc-security" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">16. Security & Authentication</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1.5rem;">
                        Data Toyz Terminal implements layered, industry-standard security controls designed to protect user accounts, platform integrity, and stored data.
                    </p>

                    <p style="color:var(--accent); font-weight:700; font-size:1rem; margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.03em;">Authentication & Access Control</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>JWT-Based Authentication</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">All authenticated requests use signed JSON Web Tokens (JWT) with 24-hour expiration. Tokens are signed using environment-managed secrets in production environments.</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Password Security</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Passwords are hashed using bcrypt (10 salt rounds).</li>
                        <li>Plaintext passwords are never stored.</li>
                        <li>Minimum complexity requirements: 8 characters, at least one uppercase letter, one lowercase letter, and one number.</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Session Management</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Password changes immediately invalidate all active sessions.</li>
                        <li>Suspended accounts automatically have all tokens invalidated.</li>
                        <li>Server extracts identity from verified JWT &mdash; usernames are never trusted from client input.</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Ownership Enforcement</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">Users may only modify their own profiles and retract their own submissions. All authorization checks are enforced server-side.</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Multi-Factor Authentication (Planned / Optional)</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1.5rem;">The platform architecture supports future implementation of TOTP-based MFA for elevated security environments.</p>

                    <p style="color:var(--accent); font-weight:700; font-size:1rem; margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.03em;">Password Reset & Account Recovery</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Secure Reset Flow</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>&ldquo;Forgot Password?&rdquo; initiates a cryptographically secure reset token.</li>
                        <li>Reset tokens expire after 1 hour.</li>
                        <li>Responses are standardized to prevent email enumeration.</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Admin-Initiated Reset</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1.5rem;">Admins may trigger a forced password reset flow but cannot view or set plaintext passwords.</p>

                    <p style="color:var(--accent); font-weight:700; font-size:1rem; margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.03em;">Data Protection Controls</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Encryption in Transit</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">All production traffic is enforced over HTTPS with HSTS enabled.</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Encryption at Rest</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">Production database volumes and storage infrastructure are encrypted at rest.</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>XSS Prevention</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">All user-generated content is HTML-escaped before rendering.</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Input Validation</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">All inputs are validated for type, length, and format prior to processing.</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>SQL Injection Prevention</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">All database interactions use parameterized queries. Raw string interpolation is prohibited.</p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>File Upload Controls</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Maximum size: 5 MB</li>
                        <li>Allowed formats: JPEG, PNG, GIF, WebP</li>
                        <li>MIME-type validation enforced</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.5rem;"><strong>Error Handling</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8;">Internal errors are logged server-side. Only sanitized, generic error responses are returned to clients.</p>
                </div>

                <!-- 17. SOC 2 ALIGNMENT -->
                <div id="doc-soc2" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">17. SOC 2 Alignment</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;">
                        Data Toyz Terminal implements technical and operational controls aligned with the SOC 2 Trust Services Criteria across all five principles.
                    </p>
                    <div style="background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:0.75rem 1rem; margin-bottom:1.5rem;">
                        <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.6; margin:0;">
                            <strong style="color:var(--text-secondary);">Note:</strong> Formal SOC 2 Type II certification requires independent third-party audit.
                        </p>
                    </div>

                    <p style="color:var(--accent); font-weight:700; font-size:0.95rem; margin-bottom:0.5rem;">&#128737; Security</p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:0.75rem;">
                        <li>Helmet-based security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COOP/CORP)</li>
                        <li>Configured CORS policy (no wildcard origins)</li>
                        <li>Three-tier rate limiting (global, authentication, messaging)</li>
                        <li>Audit logging of security-relevant events (login, password changes, admin actions, room management)</li>
                        <li>Secrets managed via environment configuration (no hardcoded credentials)</li>
                    </ul>
                    <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.6; margin-bottom:1.25rem; padding-left:1.5rem;">Audit logs retain security events for a defined operational period in accordance with platform policy.</p>

                    <p style="color:#10b981; font-weight:700; font-size:0.95rem; margin-bottom:0.5rem;">&#9889; Availability</p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1.25rem;">
                        <li>Health check endpoint for uptime monitoring</li>
                        <li>Graceful shutdown handling for controlled termination</li>
                        <li>Database connection pooling with timeout safeguards</li>
                        <li>Database hosted on Neon Postgres with platform-managed backups and point-in-time recovery</li>
                    </ul>

                    <p style="color:#3b82f6; font-weight:700; font-size:0.95rem; margin-bottom:0.5rem;">&#128736; Processing Integrity</p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1.25rem;">
                        <li>Strict server-side validation of all user input</li>
                        <li>Parameterized SQL statements across all operations</li>
                        <li>File-type and size validation on uploads</li>
                        <li>Internal error sanitization to prevent information leakage</li>
                    </ul>

                    <p style="color:#f59e0b; font-weight:700; font-size:0.95rem; margin-bottom:0.5rem;">&#128274; Confidentiality</p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1.25rem;">
                        <li>Immediate token invalidation on password change</li>
                        <li>Cascading account deletion across all related records</li>
                        <li>Minimal access control privileges enforced by role</li>
                        <li>Configurable primary admin identity (environment-based)</li>
                    </ul>

                    <p style="color:#a78bfa; font-weight:700; font-size:0.95rem; margin-bottom:0.5rem;">&#128101; Privacy</p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:0;">
                        <li>User data export endpoint (Right of Access)</li>
                        <li>Complete account deletion support</li>
                        <li>Email enumeration protection</li>
                        <li>Minimal data collection (username, email, password hash only)</li>
                        <li>No third-party tracking or analytics</li>
                    </ul>
                </div>

                <!-- 18. GLOSSARY -->
                <div id="doc-glossary" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">18. Glossary</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Data Toyz Terminal uses intelligence/spy-themed terminology throughout the platform:
                    </p>
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="text-align:left; border-bottom:2px solid var(--border-light);">
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Terminal Term</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Meaning</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Operative</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A registered user / community member</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Target</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A Transformers action figure in the catalog</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Intel Report</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A figure review / submission (Trade Scan)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Trade Scan</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The evaluation form for grading a figure</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Comms Feed</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The social timeline / news feed</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Broadcast</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A post on the Comms Feed</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Breakout Room</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A private encrypted channel (DM or group chat)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Secure Channel</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A direct message (DM) between two operatives</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Commander</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The owner/creator of a Breakout Room channel</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Market Pulse</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The analytics dashboard showing market trends</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">DTS (Data Toyz Trading Score)</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The market sentiment portion of a grade (0&ndash;100)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Approval Score</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The physical quality percentage (0&ndash;100)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Password</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Your account password</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Class Tier</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Figure size class (Deluxe, Voyager, Leader, Commander, Masterpiece)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Field Evidence</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Photos uploaded with intel reports</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Dossier</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A user's public profile page</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Clearance Level</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">User role (Analyst or Admin)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">@-Mention</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Tagging another operative with @username to notify them</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Follow</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Subscribe to another operative's activity to receive notifications</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Flag</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Report a broadcast for admin review</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Toast</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Brief confirmation message that appears at the top of the screen</td></tr>
                            <tr><td style="padding:0.6rem 1rem; font-weight:600;">Deep Link</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A URL that links directly to a specific broadcast or figure</td></tr>
                        </tbody>
                    </table>
                </div>

            </div>
        `;
    }

    // --- ADMIN PANEL --- //
    async renderAdmin(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Loading Admin Panel...</div>`;

        let analytics = {}, users = [], figures = [], flags = [];

        try {
            const [aRes, uRes, fRes, flagRes] = await Promise.all([
                this.authFetch(`${API_URL}/admin/analytics`),
                this.authFetch(`${API_URL}/admin/users`),
                fetch(`${API_URL}/figures`),
                this.authFetch(`${API_URL}/admin/flags`)
            ]);
            if (aRes.ok) analytics = await aRes.json();
            if (uRes.ok) users = await uRes.json();
            if (fRes.ok) figures = await fRes.json();
            if (flagRes.ok) flags = await flagRes.json();
        } catch (e) {
            container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load admin data.</div>`;
            return;
        }

        container.innerHTML = `
            <div style="max-width: 1100px; margin: 0 auto; padding-bottom: 3rem;" class="animate-mount">
                <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">⚙️ Admin Panel</h2>
                <p style="color:var(--text-secondary); font-size:1rem; margin-bottom:2rem;">System management and analytics for <span style="color:#fbbf24; font-weight:700;">★ Admin</span></p>

                <!-- SITE ANALYTICS -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem;">📊 Site Analytics</h3>
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:1rem; margin-bottom:2rem;">
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${analytics.totalUsers || 0}</div>
                        <div class="stat-label">Registered Users</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${analytics.totalFigures || 0}</div>
                        <div class="stat-label">Cataloged Targets</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${analytics.totalSubmissions || 0}</div>
                        <div class="stat-label">Intel Reports</div>
                    </div>
                    <div class="stat-box" style="padding:1.25rem;">
                        <div class="stat-value" style="font-size:2rem; color:var(--accent);">${analytics.totalPosts || 0}</div>
                        <div class="stat-label">Comms Posts</div>
                    </div>
                </div>

                ${analytics.topAnalysts && analytics.topAnalysts.length > 0 ? `
                <div class="card" style="padding:1.5rem; margin-bottom:2rem;">
                    <h4 style="margin-bottom:1rem; color:var(--text-secondary);">🏆 Top Analysts</h4>
                    <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                        ${analytics.topAnalysts.map((a, i) => `
                            <div style="background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.75rem 1.25rem; display:flex; align-items:center; gap:0.75rem;">
                                <span style="font-size:1.25rem; font-weight:800; color:${i === 0 ? '#fbbf24' : 'var(--text-muted)'};">#${i + 1}</span>
                                <div>
                                    <div style="font-weight:600;">${escapeHTML(a.author)}</div>
                                    <div style="font-size:0.8rem; color:var(--text-muted);">${a.subs} report${a.subs != 1 ? 's' : ''}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- FLAGGED BROADCASTS -->
                ${flags.length > 0 ? `
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--danger, #ef4444); margin-bottom:1rem; margin-top:2.5rem;">🚩 Flagged Broadcasts (${flags.length})</h3>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; font-weight:700;">Post Author</th>
                                <th style="padding:0.75rem 1rem; font-weight:700;">Flagged By</th>
                                <th style="padding:0.75rem 1rem; font-weight:700;">Reason</th>
                                <th style="padding:0.75rem 1rem; font-weight:700;">Date</th>
                                <th style="padding:0.75rem 1rem; font-weight:700;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${flags.map(f => `
                            <tr style="border-bottom:1px solid var(--border-light);">
                                <td style="padding:0.75rem 1rem; font-weight:700;">${escapeHTML(f.postAuthor)}</td>
                                <td style="padding:0.75rem 1rem;">${escapeHTML(f.flaggedBy)}</td>
                                <td style="padding:0.75rem 1rem; color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(f.reason || 'No reason given')}</td>
                                <td style="padding:0.75rem 1rem; color:var(--text-muted); font-size:0.85rem;">${new Date(f.created_at).toLocaleDateString()}</td>
                                <td style="padding:0.75rem 1rem; white-space:nowrap;">
                                    <button class="adminDeleteFlaggedPost btn" data-postid="${f.postId}" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--danger, #ef4444); border-color:var(--danger, #ef4444); margin-right:0.25rem;">Delete Post</button>
                                    <button class="adminDismissFlag btn" data-flagid="${f.id}" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--bg-surface); border-color:var(--border-light); color:var(--text-secondary);">Dismiss</button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                <!-- FIGURE MANAGEMENT -->
                <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem; margin-top:2.5rem;">🎯 Figure Management (${figures.length})</h3>
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:2.5rem;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">ID</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Name</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Brand</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Class</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Line</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">MSRP</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${figures.map(f => `
                                <tr style="border-top:1px solid var(--border-light);" id="figRow-${f.id}">
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted);">${f.id}</td>
                                    <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(f.name)}</td>
                                    <td style="padding:0.6rem 1rem;">${escapeHTML(f.brand)}</td>
                                    <td style="padding:0.6rem 1rem;"><span class="tier-badge ${escapeHTML(f.classTie).toLowerCase()}" style="font-size:0.7rem;">${escapeHTML(f.classTie)}</span></td>
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted);">${escapeHTML(f.line)}</td>
                                    <td style="padding:0.6rem 1rem; color:#10b981; font-weight:600;">${f.msrp ? '$' + parseFloat(f.msrp).toFixed(2) : '<span style="color:var(--text-muted); font-weight:400;">—</span>'}</td>
                                    <td style="padding:0.6rem 1rem; text-align:right; white-space:nowrap;">
                                        <button class="editFigBtn" data-id="${f.id}" data-name="${escapeHTML(f.name)}" data-brand="${escapeHTML(f.brand)}" data-class="${escapeHTML(f.classTie)}" data-line="${escapeHTML(f.line)}" data-msrp="${f.msrp || ''}" style="background:none; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">✏️ Edit</button>
                                        <button class="delFigBtn" data-id="${f.id}" data-name="${escapeHTML(f.name)}" style="background:none; border:1px solid var(--danger); color:var(--danger); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">🗑️ Delete</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- USER MANAGEMENT -->
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:1rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.08em; font-size:1rem; color:var(--text-secondary); margin:0;">👥 User Management (${users.length})</h3>
                    <button id="addAdminUserBtn" style="background:none; border:1px solid #fbbf24; color:#fbbf24; cursor:pointer; padding:0.4rem 0.8rem; border-radius:4px; font-size:0.8rem; font-weight:700;">+ ADD USER</button>
                </div>
                <div class="card" style="padding:0; overflow:hidden;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:var(--bg-panel); text-align:left;">
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">ID</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Username</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Email</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Role</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Status</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600;">Joined</th>
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(u => {
            const isAdmin = u.role === 'admin';
            const isSuspended = u.suspended;
            const joined = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Unknown';
            return `
                                    <tr style="border-top:1px solid var(--border-light); ${isSuspended ? 'opacity:0.5;' : ''}">
                                        <td style="padding:0.6rem 1rem; color:var(--text-muted);">${u.id}</td>
                                        <td style="padding:0.6rem 1rem; font-weight:600;">${escapeHTML(u.username)} ${isAdmin ? '<span style="color:#fbbf24; font-size:0.75rem;">★ ADMIN</span>' : ''}</td>
                                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${escapeHTML(u.email)}</td>
                                        <td style="padding:0.6rem 1rem;"><span style="color:${isAdmin ? '#fbbf24' : 'var(--accent)'}; font-size:0.8rem; font-weight:600; text-transform:uppercase;">${escapeHTML(u.role || 'analyst')}</span></td>
                                        <td style="padding:0.6rem 1rem;"><span style="color:${isSuspended ? 'var(--danger)' : 'var(--success)'}; font-size:0.8rem; font-weight:600;">${isSuspended ? '⛔ SUSPENDED' : '✅ ACTIVE'}</span></td>
                                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${joined}</td>
                                        <td style="padding:0.6rem 1rem; text-align:right; white-space:nowrap;">
                                            ${u.username !== 'Prime Dynamixx' ? `
                                                <button class="roleBtn" data-id="${u.id}" data-role="${u.role}" style="background:none; border:1px solid ${isAdmin ? 'var(--text-muted)' : '#fbbf24'}; color:${isAdmin ? 'var(--text-muted)' : '#fbbf24'}; cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">${isAdmin ? 'Demote' : 'Promote'}</button>
                                                <button class="suspendBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="background:none; border:1px solid ${isSuspended ? 'var(--success)' : 'var(--danger)'}; color:${isSuspended ? 'var(--success)' : 'var(--danger)'}; cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">${isSuspended ? '✅ Reinstate' : '⚠️ Suspend'}</button>
                                                <button class="resetPwBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="background:none; border:1px solid var(--accent); color:var(--accent); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">🔑 Reset PW</button>
                                                <button class="delUserBtn" data-id="${u.id}" data-name="${escapeHTML(u.username)}" style="background:none; border:1px solid var(--danger); color:var(--danger); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">🗑️ Delete</button>
                                            ` : '<span style="font-size:0.8rem; color:var(--text-muted);">Protected</span>'}
                                        </td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Wire up admin action handlers (all use JWT auth via authFetch)

        // Add User
        document.getElementById('addAdminUserBtn').addEventListener('click', async () => {
            const username = prompt("Enter new username:");
            if (!username) return;
            const password = prompt("Enter new password:");
            if (!password) return;
            const email = username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@datatoyz.net';
            const role = confirm("Should this user be an Admin? (OK for Admin, Cancel for Analyst)") ? 'admin' : 'analyst';

            try {
                const res = await this.authFetch(`${API_URL}/admin/users`, {
                    method: 'POST',
                    body: JSON.stringify({ username, email, password, role })
                });
                if (res.ok) { this.renderAdmin(container); }
                else { const err = await res.json(); alert(err.error); }
            } catch (e) { console.error(e); }
        });

        // Toggle User Role
        document.querySelectorAll('.roleBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const isPromoting = btn.dataset.role !== 'admin';
                if (!confirm(`Are you sure you want to ${isPromoting ? 'PROMOTE' : 'DEMOTE'} this user?`)) return;
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/role`, { method: 'PUT' });
                    if (res.ok) { this.renderAdmin(container); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        });

        // Delete figure
        document.querySelectorAll('.delFigBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Delete "${btn.dataset.name}" and ALL associated intel? This cannot be undone.`)) return;
                try {
                    const res = await this.authFetch(`${API_URL}/admin/figures/${btn.dataset.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        MOCK_FIGURES = MOCK_FIGURES.filter(f => f.id != btn.dataset.id);
                        this.renderAdmin(container);
                    } else {
                        const err = await res.json();
                        alert(err.error);
                    }
                } catch (e) { console.error(e); }
            });
        });

        // Edit figure
        // Flagged post admin actions
        document.querySelectorAll('.adminDeleteFlaggedPost').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this flagged broadcast?')) return;
                try {
                    const res = await this.authFetch(`${API_URL}/posts/${btn.dataset.postid}`, { method: 'DELETE' });
                    if (res.ok) { this.renderAdmin(container); }
                } catch (e) { console.error(e); }
            });
        });
        document.querySelectorAll('.adminDismissFlag').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const res = await this.authFetch(`${API_URL}/admin/flags/${btn.dataset.flagid}`, { method: 'DELETE' });
                    if (res.ok) { this.renderAdmin(container); }
                } catch (e) { console.error(e); }
            });
        });

        document.querySelectorAll('.editFigBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newName = prompt('Figure Name:', btn.dataset.name);
                if (!newName) return;
                const newBrand = prompt('Brand:', btn.dataset.brand);
                if (!newBrand) return;
                const newClass = prompt('Class Tier:', btn.dataset.class);
                if (!newClass) return;
                const newLine = prompt('Product Line:', btn.dataset.line);
                if (!newLine) return;
                const msrpStr = prompt('MSRP (leave blank to clear):', btn.dataset.msrp || '');
                if (msrpStr === null) return;
                const newMsrp = msrpStr.trim() !== '' ? parseFloat(msrpStr) : null;

                try {
                    const res = await this.authFetch(`${API_URL}/admin/figures/${btn.dataset.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ name: newName, brand: newBrand, classTie: newClass, line: newLine, msrp: newMsrp })
                    });
                    if (res.ok) {
                        const fig = MOCK_FIGURES.find(f => f.id == btn.dataset.id);
                        if (fig) { fig.name = newName; fig.brand = newBrand; fig.classTie = newClass; fig.line = newLine; fig.msrp = newMsrp; }
                        this.renderAdmin(container);
                    }
                } catch (e) { console.error(e); }
            });
        });

        // Suspend user
        document.querySelectorAll('.suspendBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/suspend`, { method: 'PUT' });
                    if (res.ok) { this.renderAdmin(container); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        });

        // Delete user
        document.querySelectorAll('.delUserBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Permanently delete user "${btn.dataset.name}"? This cannot be undone.`)) return;
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
                    if (res.ok) { this.renderAdmin(container); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        });

        // Admin Reset Password
        document.querySelectorAll('.resetPwBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newPw = prompt(`Enter new password for "${btn.dataset.name}":`);
                if (!newPw || newPw.length < 4) { if (newPw !== null) alert('Password must be at least 4 characters.'); return; }
                try {
                    const res = await this.authFetch(`${API_URL}/admin/users/${btn.dataset.id}/reset-password`, {
                        method: 'POST',
                        body: JSON.stringify({ newPassword: newPw })
                    });
                    if (res.ok) { alert(`Password reset for "${btn.dataset.name}".`); }
                    else { const err = await res.json(); alert(err.error); }
                } catch (e) { console.error(e); }
            });
        });
    }

    async editSubmission(submissionId, targetId) {
        // Fetch the full submission data, then resolve target from figures list or submission metadata
        try {
            const subRes = await fetch(`${API_URL}/submissions/user/${this.user.username}`);
            if (!subRes.ok) { alert('Failed to load submission data.'); return; }
            const allSubs = await subRes.json();
            const sub = allSubs.find(s => s.id === submissionId);
            if (!sub) { alert('Submission not found.'); return; }

            // Resolve target: try MOCK_FIGURES first, then fetch full figures list
            let figure = MOCK_FIGURES.find(f => f.id == targetId);
            if (!figure) {
                try {
                    const figRes = await fetch(`${API_URL}/figures`);
                    if (figRes.ok) {
                        const allFigures = await figRes.json();
                        figure = allFigures.find(f => f.id == targetId);
                    }
                } catch (e) { /* fallback below */ }
            }
            // Fallback: build target from submission metadata
            if (!figure) {
                figure = { id: sub.targetId, name: sub.targetName, classTie: sub.targetTier, brand: '', line: '' };
            }

            this.editingSubmission = sub;
            this.currentTarget = figure;
            this.currentView = 'submission';
            this.renderApp();
        } catch (e) {
            console.error('Edit submission load error', e);
            alert('Failed to load submission for editing.');
        }
    }

    async deleteSubmission(id) {
        if (!confirm("Are you sure you want to retract this intel from the Market Pulse?")) return;
        try {
            const res = await this.authFetch(`${API_URL}/submissions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                this.showFormSuccess('Intelligence report retracted.');
                this.renderApp();
            } else {
                const errData = await res.json().catch(() => ({}));
                this.showFormError(errData.error || 'Failed to retract submission.');
            }
        } catch (e) {
            console.error(e);
            this.showFormError('Connection error. Please try again.');
        }
    }

    // --- MARKET PULSE DASHBOARD --- //

    async renderMarketPulse(container) {
        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('stats', 4)}</div>`;

        try {
            const [overviewRes, indexesRes, headlinesRes, topRatedRes] = await Promise.all([
                fetch(`${API_URL}/stats/overview`),
                fetch(`${API_URL}/stats/indexes`),
                fetch(`${API_URL}/stats/headlines`),
                fetch(`${API_URL}/figures/top-rated`)
            ]);
            const overview = await overviewRes.json();
            const indexes = await indexesRes.json();
            const headlines = await headlinesRes.json();
            const topRated = await topRatedRes.json();

            container.innerHTML = `
                <div style="max-width:1000px; margin:0 auto;">
                    <h1 style="font-size:2.5rem; font-weight:900; text-transform:uppercase; letter-spacing:-0.02em; margin-bottom:0.5rem;">Market Pulse</h1>
                    <p style="color:var(--text-secondary); font-size:1.1rem; margin-bottom:2.5rem;">Global intelligence overview and market activity.</p>

                    <!-- Overview Stats -->
                    <div class="grid-4" style="margin-bottom:2.5rem;">
                        <div class="stat-box">
                            <div class="stat-value">${overview.totalIntel}</div>
                            <div class="stat-label">Intel Reports</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${overview.uniqueAnalysts}</div>
                            <div class="stat-label">Active Analysts</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${overview.avgGrade}</div>
                            <div class="stat-label">Avg Grade</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${overview.totalTargets}</div>
                            <div class="stat-label">Cataloged Targets</div>
                        </div>
                    </div>

                    <div class="grid-2" style="margin-bottom:2.5rem;">
                        <!-- Top Rated Figures -->
                        <div class="card" style="padding:0; overflow:hidden;">
                            <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">🏆 Top Rated Targets</h3>
                            </div>
                            <div style="max-height:400px; overflow-y:auto;">
                                ${topRated.length > 0 ? topRated.map((f, i) => `
                                    <div class="pulse-headline-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="app.selectTarget(${f.id})">
                                        <div style="display:flex; align-items:center; gap:0.75rem;">
                                            <span style="color:var(--text-muted); font-weight:700; font-size:0.85rem; width:24px;">#${i + 1}</span>
                                            <div>
                                                <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(f.name)}</div>
                                                <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHTML(f.brand)} · ${f.submissions} report${f.submissions !== 1 ? 's' : ''}</div>
                                            </div>
                                        </div>
                                        <div style="font-weight:800; color:var(--accent); font-size:1.1rem;">${escapeHTML(f.avgGrade)}</div>
                                    </div>
                                `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No rated targets yet.</div>'}
                            </div>
                        </div>

                        <!-- Intel Headlines -->
                        <div class="card" style="padding:0; overflow:hidden;">
                            <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                                <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">📡 Intel Headlines</h3>
                            </div>
                            <div style="max-height:400px; overflow-y:auto;">
                                ${headlines.length > 0 ? headlines.map(h => `
                                    <div class="pulse-headline-item">
                                        <div style="font-size:0.9rem; margin-bottom:0.25rem;">${escapeHTML(h.headline)}</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(h.date).toLocaleDateString()} · ${escapeHTML(h.brand)}</div>
                                    </div>
                                `).join('') : '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No intel yet.</div>'}
                            </div>
                        </div>
                    </div>

                    <!-- Brand/Line Indexes -->
                    <div class="card" style="padding:0; overflow:hidden;">
                        <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-light);">
                            <h3 style="font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; margin:0;">📊 Brand / Line Performance Index</h3>
                        </div>
                        <div style="overflow-x:auto;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Brand</th>
                                        <th>Line</th>
                                        <th>Targets</th>
                                        <th>Reports</th>
                                        <th>Avg Grade</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${indexes.map(idx => `
                                        <tr>
                                            <td style="font-weight:600;">${escapeHTML(idx.brand)}</td>
                                            <td style="color:var(--text-secondary);">${escapeHTML(idx.line)}</td>
                                            <td>${idx.targets}</td>
                                            <td>${idx.submissions}</td>
                                            <td style="font-weight:700; color:${idx.avgGrade ? (parseFloat(idx.avgGrade) >= 70 ? 'var(--success)' : parseFloat(idx.avgGrade) >= 50 ? '#fbbf24' : 'var(--danger)') : 'var(--text-muted)'};">${escapeHTML(idx.avgGrade) || '—'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load market data.</div>`;
            console.error(e);
        }
    }

    // --- USER PROFILE VIEW --- //

    viewUserProfile(username) {
        sessionStorage.setItem('profileUser', username);
        this.previousView = this.currentView;
        this.currentView = 'user_profile';
        this.renderApp();
    }

    async renderUserProfile(container) {
        const username = sessionStorage.getItem('profileUser');
        if (!username) { this.currentView = 'feed'; this.renderApp(); return; }

        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('profile')}</div>`;

        try {
            const res = await fetch(`${API_URL}/users/${encodeURIComponent(username)}/profile`);
            if (!res.ok) throw new Error('Profile not found');
            const profile = await res.json();

            const titleColors = {
                'Prime Intel Officer': '#a78bfa',
                'Senior Field Evaluator': 'var(--text-secondary)',
                'Field Evaluator': 'var(--success)',
                'Junior Analyst': 'var(--accent)',
                'Rookie Analyst': 'var(--text-muted)'
            };

            container.innerHTML = `
                <div style="max-width:800px; margin:0 auto;">
                    <button onclick="app.currentView='${this.previousView || 'feed'}'; app.renderApp();" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:0.9rem; margin-bottom:2rem; padding:0;">&larr; Back</button>

                    <div class="card" style="display:flex; align-items:center; gap:2rem; margin-bottom:2rem;">
                        ${profile.avatar ? `<img src="${profile.avatar}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:3px solid var(--border-light);">` : `<div style="width:80px; height:80px; border-radius:50%; background:var(--gradient-primary); display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:800; color:#fff;">${escapeHTML(profile.username).charAt(0).toUpperCase()}</div>`}
                        <div style="flex:1;">
                            <h2 style="font-size:1.75rem; margin-bottom:0.25rem;">${escapeHTML(profile.username)}</h2>
                            <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
                                <span style="color:${titleColors[profile.title] || 'var(--text-muted)'}; font-weight:700; font-size:0.9rem; border:1px solid; padding:0.2rem 0.6rem; border-radius:4px;">${escapeHTML(profile.title)}</span>
                                ${profile.role === 'admin' ? '<span style="color:#fbbf24; font-weight:700; font-size:0.8rem;">★ ADMIN</span>' : ''}
                                <span style="color:var(--text-muted); font-size:0.85rem;">Joined ${new Date(profile.joinDate).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div style="text-align:center;">
                            <div style="font-size:2rem; font-weight:900; background:var(--gradient-primary); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">${profile.submissionCount}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Reports</div>
                        </div>
                        <div style="text-align:center;">
                            <div id="followerCount" style="font-size:2rem; font-weight:900; color:var(--text-primary);">-</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Followers</div>
                        </div>
                        <div style="text-align:center;">
                            <div id="followingCount" style="font-size:2rem; font-weight:900; color:var(--text-primary);">-</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Following</div>
                        </div>
                    </div>

                    ${profile.username !== this.user.username ? `
                    <div style="display:flex; gap:1rem; margin-bottom:2rem;">
                        <button class="btn" id="followBtn" data-userid="${profile.userId}" style="flex:1; padding:0.85rem; font-size:0.95rem;">Loading...</button>
                        <button class="btn" onclick="app.startDM('${escapeHTML(profile.username).replace(/'/g, "\\'")}')" style="flex:1; padding:0.85rem; font-size:0.95rem;">
                            🔒 Open Secure Channel
                        </button>
                    </div>
                    ` : ''}

                    ${profile.recentSubmissions.length > 0 ? `
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1rem; color:var(--text-secondary); margin-bottom:1rem;">Recent Intel Reports</h3>
                    <div class="card" style="padding:0; overflow:hidden;">
                        <table class="data-table">
                            <thead>
                                <tr><th>Date</th><th>Target</th><th>Grade</th></tr>
                            </thead>
                            <tbody>
                                ${profile.recentSubmissions.map(s => {
                                    const grade = ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1);
                                    return `
                                    <tr style="cursor:pointer;" onclick="app.selectTarget(${s.targetId})">
                                        <td style="color:var(--text-muted);">${new Date(s.date).toLocaleDateString()}${s.editedAt ? ' <span style="font-size:0.7rem; font-style:italic;">(edited)</span>' : ''}</td>
                                        <td>
                                            <span class="tier-badge ${escapeHTML(s.targetTier || '').toLowerCase()}" style="font-size:0.65rem; margin-right:0.5rem;">${escapeHTML(s.targetTier)}</span>
                                            ${escapeHTML(s.targetName)}
                                        </td>
                                        <td style="font-weight:700; color:${parseFloat(grade) >= 70 ? 'var(--success)' : parseFloat(grade) >= 50 ? '#fbbf24' : 'var(--danger)'};">${grade}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    ` : '<p style="color:var(--text-muted); text-align:center; padding:2rem;">No intel reports yet.</p>'}
                </div>
            `;

            // Fetch follow stats
            try {
                const statsRes = await fetch(`${API_URL}/users/${profile.userId}/follow-stats`);
                if (statsRes.ok) {
                    const stats = await statsRes.json();
                    const followerEl = document.getElementById('followerCount');
                    const followingEl = document.getElementById('followingCount');
                    if (followerEl) followerEl.textContent = stats.followers;
                    if (followingEl) followingEl.textContent = stats.following;
                }
            } catch (e) { /* silent */ }

            // Set up follow button
            if (profile.username !== this.user.username) {
                const followBtn = document.getElementById('followBtn');
                if (followBtn) {
                    try {
                        const isFollowingRes = await this.authFetch(`${API_URL}/users/${profile.userId}/is-following`);
                        const { isFollowing } = await isFollowingRes.json();
                        followBtn.textContent = isFollowing ? '✓ Following' : '+ Follow';
                        if (isFollowing) {
                            followBtn.style.background = 'var(--bg-surface)';
                            followBtn.style.borderColor = 'var(--border-light)';
                            followBtn.style.color = 'var(--text-secondary)';
                        }
                    } catch (e) { followBtn.textContent = '+ Follow'; }

                    followBtn.addEventListener('click', async () => {
                        try {
                            followBtn.disabled = true;
                            const res = await this.authFetch(`${API_URL}/users/${profile.userId}/follow`, { method: 'POST' });
                            if (!res.ok) throw new Error('Follow failed');
                            const data = await res.json();
                            if (data.action === 'followed') {
                                followBtn.textContent = '✓ Following';
                                followBtn.style.background = 'var(--bg-surface)';
                                followBtn.style.borderColor = 'var(--border-light)';
                                followBtn.style.color = 'var(--text-secondary)';
                                const el = document.getElementById('followerCount');
                                if (el) el.textContent = parseInt(el.textContent || '0') + 1;
                            } else {
                                followBtn.textContent = '+ Follow';
                                followBtn.style.background = '';
                                followBtn.style.borderColor = '';
                                followBtn.style.color = '';
                                const el = document.getElementById('followerCount');
                                if (el) el.textContent = Math.max(0, parseInt(el.textContent || '0') - 1);
                            }
                            followBtn.disabled = false;
                        } catch (err) { alert('Follow action failed.'); followBtn.disabled = false; }
                    });
                }
            }

        } catch (e) {
            container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load profile.</div>`;
            console.error(e);
        }
    }

    // --- NOTIFICATION METHODS --- //

    async updateNotifBadge() {
        try {
            const res = await this.authFetch(`${API_URL}/notifications/${encodeURIComponent(this.user.username)}/count`);
            const data = await res.json();
            const badge = document.getElementById('notifBadge');
            if (badge) {
                if (data.unread > 0) {
                    badge.textContent = data.unread > 99 ? '99+' : data.unread;
                    badge.style.display = 'block';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) { /* silent */ }
    }

    async loadNotifications() {
        const dropdown = document.getElementById('notifDropdown');
        if (!dropdown) return;
        dropdown.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">Loading...</div>';

        try {
            const res = await this.authFetch(`${API_URL}/notifications/${encodeURIComponent(this.user.username)}`);
            const notifs = await res.json();

            if (notifs.length === 0) {
                dropdown.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">No notifications yet.</div>';
                return;
            }

            const icons = { comment: '💬', reaction: '❤️', co_reviewer: '📋', message: '🔒', follow: '👥', mention: '📢', flag: '🚩' };

            dropdown.innerHTML = `
                <div style="padding:0.75rem 1.25rem; border-bottom:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em;">Notifications</span>
                    <button id="markAllRead" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:0.8rem; font-weight:600;">Mark all read</button>
                </div>
                ${notifs.slice(0, 20).map(n => {
                    const timeAgo = this.timeAgo(n.created_at);
                    return `
                    <div class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" data-link-type="${n.link_type}" data-link-id="${n.link_id}">
                        <span class="notif-icon">${icons[n.type] || '🔔'}</span>
                        <div>
                            <div class="notif-text">${escapeHTML(n.message)}</div>
                            <div class="notif-time">${timeAgo}</div>
                        </div>
                    </div>`;
                }).join('')}
            `;

            dropdown.querySelectorAll('.notif-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.notifId;
                    const linkType = item.dataset.linkType;
                    const linkId = item.dataset.linkId;
                    await this.authFetch(`${API_URL}/notifications/${id}/read`, { method: 'PUT' });
                    if (linkType === 'post') { this.currentView = 'feed'; this.renderApp(); }
                    else if (linkType === 'figure') { this.selectTarget(parseInt(linkId)); }
                    else if (linkType === 'room') { sessionStorage.setItem('activeRoomId', linkId); this.currentView = 'room_chat'; this.renderApp(); }
                    dropdown.style.display = 'none';
                });
            });

            const markAllBtn = document.getElementById('markAllRead');
            if (markAllBtn) {
                markAllBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.authFetch(`${API_URL}/notifications/read-all`, {
                        method: 'PUT',
                        body: JSON.stringify({ username: this.user.username })
                    });
                    this.updateNotifBadge();
                    dropdown.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
                });
            }
        } catch (e) {
            dropdown.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--danger); font-size:0.85rem;">Failed to load.</div>';
        }
    }

    timeAgo(dateStr) {
        const now = new Date();
        const d = new Date(dateStr);
        const secs = Math.floor((now - d) / 1000);
        if (secs < 60) return 'just now';
        if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
        if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
        if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
        return d.toLocaleDateString();
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('terminal_token');
        localStorage.removeItem('terminal_user');
        sessionStorage.removeItem('terminalView');
        sessionStorage.removeItem('terminalTarget');
        sessionStorage.removeItem('activeRoomId');
        if (this._notifInterval) clearInterval(this._notifInterval);
        if (this._roomsPollInterval) clearInterval(this._roomsPollInterval);
        if (this._chatPollInterval) clearInterval(this._chatPollInterval);
        this.renderLogin();
    }

    // --- BREAKOUT ROOMS --- //

    async updateRoomsBadge() {
        try {
            const res = await this.authFetch(`${API_URL}/rooms/unread-total`);
            if (!res.ok) return;
            const data = await res.json();
            const badge = document.getElementById('roomsBadge');
            if (badge) {
                if (data.unread > 0) {
                    badge.textContent = data.unread > 99 ? '99+' : data.unread;
                    badge.style.display = 'block';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) { /* silent */ }
    }

    async renderRoomsList(container) {
        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rooms', 5)}</div>`;

        let rooms = [];
        try {
            const res = await this.authFetch(`${API_URL}/rooms`);
            if (res.ok) rooms = await res.json();
        } catch (e) {
            console.error("Failed fetching rooms", e);
        }

        const self = this.user.username;
        this._roomsFilter = this._roomsFilter || 'all';

        const filtered = rooms.filter(r => {
            if (this._roomsFilter === 'dm') return r.type === 'dm';
            if (this._roomsFilter === 'group') return r.type === 'group';
            return true;
        });

        container.innerHTML = `
            <div class="rooms-container" style="max-width:700px; margin:0 auto; padding-bottom:3rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                    <div>
                        <h2 style="font-size:2.5rem; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em;">Breakout Rooms</h2>
                        <p style="color:var(--text-secondary); font-size:1.1rem;">Encrypted private channels for covert comms.</p>
                    </div>
                    <button id="newRoomBtn" class="btn" style="white-space:nowrap;">+ New Room</button>
                </div>

                <div class="room-tabs" style="display:flex; gap:0.5rem; margin-bottom:1.5rem;">
                    <div class="room-tab ${this._roomsFilter === 'all' ? 'active' : ''}" data-filter="all">All</div>
                    <div class="room-tab ${this._roomsFilter === 'dm' ? 'active' : ''}" data-filter="dm">DMs</div>
                    <div class="room-tab ${this._roomsFilter === 'group' ? 'active' : ''}" data-filter="group">Groups</div>
                </div>

                <div id="roomsList">
                    ${filtered.length === 0 ? `
                        <div class="card animate-mount" style="text-align:center; padding:3rem; color:var(--text-muted);">
                            No secure channels detected. Create one to begin encrypted comms.
                        </div>
                    ` : filtered.map((room, i) => {
                        const displayName = room.type === 'dm'
                            ? (room.members.find(m => m.username !== self) || {}).username || 'Unknown'
                            : room.name || 'Unnamed Channel';
                        const avatar = room.type === 'dm'
                            ? (room.members.find(m => m.username !== self) || {}).avatar
                            : null;
                        const initial = escapeHTML(displayName).charAt(0).toUpperCase();
                        const lastMsg = room.lastMessage;
                        const preview = lastMsg ? `${escapeHTML(lastMsg.author === self ? 'You' : lastMsg.author)}: ${escapeHTML(lastMsg.content) || '📸 Image'}` : 'No messages yet';
                        const time = lastMsg ? this.timeAgo(lastMsg.createdAt) : '';
                        return `
                        <div class="room-card animate-stagger ${room.unreadCount > 0 ? 'has-unread' : ''}" data-room-id="${room.id}" style="animation-delay:${i * 0.06}s;">
                            <div class="room-avatar">
                                ${avatar ? `<img src="${avatar}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">` : initial}
                            </div>
                            <div class="room-info">
                                <div class="room-name">${escapeHTML(displayName)}${room.type === 'group' ? ` <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">(${room.members.length})</span>` : ''}</div>
                                <div class="room-preview">${preview.length > 60 ? preview.substring(0, 60) + '...' : preview}</div>
                            </div>
                            <div class="room-meta">
                                <div class="room-time">${time}</div>
                                ${room.unreadCount > 0 ? `<div class="room-unread">${room.unreadCount > 99 ? '99+' : room.unreadCount}</div>` : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;

        // Tab filtering
        container.querySelectorAll('.room-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this._roomsFilter = tab.dataset.filter;
                this.renderRoomsList(container);
            });
        });

        // Room card click → open chat
        container.querySelectorAll('.room-card').forEach(card => {
            card.addEventListener('click', () => {
                sessionStorage.setItem('activeRoomId', card.dataset.roomId);
                this.currentView = 'room_chat';
                this.renderCurrentView();
            });
        });

        // New Room button
        document.getElementById('newRoomBtn').addEventListener('click', () => this.showNewRoomModal());
    }

    showNewRoomModal() {
        // Remove existing modal if any
        const existing = document.querySelector('.room-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'room-modal-overlay';
        overlay.innerHTML = `
            <div class="room-modal">
                <h3 style="font-size:1.3rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1.5rem;">Create Secure Channel</h3>
                <label style="font-size:0.85rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.03em;">Channel Name</label>
                <input type="text" id="roomNameInput" placeholder="e.g., Strike Team Alpha" style="width:100%; padding:0.75rem 1rem; background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); color:var(--text-primary); font-size:0.95rem; margin:0.5rem 0 1.25rem;">

                <label style="font-size:0.85rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.03em;">Add Operatives</label>
                <input type="text" id="memberSearchInput" placeholder="Search by username..." style="width:100%; padding:0.75rem 1rem; background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); color:var(--text-primary); font-size:0.95rem; margin:0.5rem 0 0.25rem;">
                <div id="memberSearchResults" class="user-search-results" style="display:none;"></div>
                <div id="selectedMembers" style="display:flex; flex-wrap:wrap; gap:0.25rem; margin:0.75rem 0 1.5rem; min-height:2rem;"></div>

                <div style="display:flex; gap:1rem; justify-content:flex-end;">
                    <button id="cancelRoomBtn" class="btn" style="background:transparent; border:1px solid var(--border-light); color:var(--text-secondary);">Cancel</button>
                    <button id="createRoomBtn" class="btn">Create Channel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const selectedMembers = [];
        let searchTimeout = null;

        // Close on overlay click
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('cancelRoomBtn').addEventListener('click', () => overlay.remove());

        // Search users
        const searchInput = document.getElementById('memberSearchInput');
        const resultsDiv = document.getElementById('memberSearchResults');
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const q = searchInput.value.trim();
            if (q.length < 1) { resultsDiv.style.display = 'none'; return; }
            searchTimeout = setTimeout(async () => {
                try {
                    const res = await this.authFetch(`${API_URL}/users/search?q=${encodeURIComponent(q)}`);
                    const users = await res.json();
                    const available = users.filter(u => !selectedMembers.includes(u.username));
                    if (available.length === 0) { resultsDiv.style.display = 'none'; return; }
                    resultsDiv.style.display = 'block';
                    resultsDiv.innerHTML = available.map(u => `
                        <div class="user-search-item" data-username="${escapeHTML(u.username)}">
                            ${u.avatar ? `<img src="${u.avatar}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">` : `<div style="width:32px; height:32px; border-radius:50%; background:var(--gradient-primary); display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff; font-size:0.85rem;">${escapeHTML(u.username).charAt(0).toUpperCase()}</div>`}
                            <span>${escapeHTML(u.username)}</span>
                        </div>
                    `).join('');

                    resultsDiv.querySelectorAll('.user-search-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const uname = item.dataset.username;
                            if (!selectedMembers.includes(uname)) {
                                selectedMembers.push(uname);
                                this._renderSelectedMembers(selectedMembers);
                            }
                            searchInput.value = '';
                            resultsDiv.style.display = 'none';
                        });
                    });
                } catch (e) { resultsDiv.style.display = 'none'; }
            }, 300);
        });

        // Create room
        document.getElementById('createRoomBtn').addEventListener('click', async () => {
            const name = document.getElementById('roomNameInput').value.trim();
            if (!name) return alert('Channel name is required.');
            if (selectedMembers.length === 0) return alert('Add at least one operative.');

            const btn = document.getElementById('createRoomBtn');
            btn.textContent = 'Creating...';
            btn.disabled = true;

            try {
                const res = await this.authFetch(`${API_URL}/rooms`, {
                    method: 'POST',
                    body: JSON.stringify({ name, type: 'group', members: selectedMembers })
                });
                if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                const room = await res.json();
                overlay.remove();
                sessionStorage.setItem('activeRoomId', room.id);
                this.currentView = 'room_chat';
                this.renderCurrentView();
            } catch (e) {
                alert(e.message || 'Failed to create channel.');
                btn.textContent = 'Create Channel';
                btn.disabled = false;
            }
        });
    }

    _renderSelectedMembers(members) {
        const container = document.getElementById('selectedMembers');
        if (!container) return;
        container.innerHTML = members.map(m => `
            <span class="member-pill">
                ${escapeHTML(m)}
                <span class="remove-member" data-username="${escapeHTML(m)}">&times;</span>
            </span>
        `).join('');
        container.querySelectorAll('.remove-member').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = members.indexOf(btn.dataset.username);
                if (idx > -1) members.splice(idx, 1);
                this._renderSelectedMembers(members);
            });
        });
    }

    async renderRoomChat(container) {
        const roomId = sessionStorage.getItem('activeRoomId');
        if (!roomId) { this.currentView = 'rooms'; this.renderCurrentView(); return; }

        container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('rows', 8)}</div>`;

        try {
            // Fetch room details and messages in parallel
            const [roomRes, msgsRes] = await Promise.all([
                this.authFetch(`${API_URL}/rooms/${roomId}`),
                this.authFetch(`${API_URL}/rooms/${roomId}/messages`)
            ]);

            if (!roomRes.ok) { this.currentView = 'rooms'; this.renderCurrentView(); return; }

            const room = await roomRes.json();
            const messages = msgsRes.ok ? await msgsRes.json() : [];
            this._lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : 0;
            this._currentRoomId = roomId;

            const self = this.user.username;
            const displayName = room.type === 'dm'
                ? (room.members.find(m => m.username !== self) || {}).username || 'Secure Channel'
                : room.name || 'Unnamed Channel';

            const iAmOwner = room.members.find(m => m.username === self && m.role === 'owner');

            container.innerHTML = `
                <div class="chat-container">
                    <div class="chat-header">
                        <button id="chatBackBtn" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.2rem; padding:0.5rem;">&larr;</button>
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:1.1rem;">${escapeHTML(displayName)}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${room.members.length} operative${room.members.length > 1 ? 's' : ''} in channel</div>
                        </div>
                        ${room.type === 'group' ? `
                        <button id="roomMembersBtn" style="background:none; border:1px solid var(--border-light); color:var(--text-secondary); cursor:pointer; padding:0.4rem 0.8rem; border-radius:var(--radius-sm); font-size:0.85rem;">👥 Members</button>
                        ` : ''}
                    </div>

                    <div class="chat-messages" id="chatMessages">
                        ${messages.length === 0 ? `
                            <div style="text-align:center; color:var(--text-muted); padding:3rem;">
                                Channel established. Begin secure transmission.
                            </div>
                        ` : messages.map(m => this._renderMessage(m, self)).join('')}
                    </div>

                    <div id="typingIndicator" class="typing-indicator"></div>

                    <div class="chat-input-bar">
                        <label for="chatImageInput" style="cursor:pointer; padding:0.6rem; border:1px solid var(--border-light); border-radius:50%; font-size:1.1rem; transition:all 0.2s; flex-shrink:0;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-light)'">📸</label>
                        <input type="file" id="chatImageInput" accept="image/*" style="display:none;">
                        <textarea id="chatInput" placeholder="Transmit message..." rows="1" style="flex:1; resize:none; min-height:44px; max-height:120px; padding:0.75rem 1rem; font-size:0.95rem; border-radius:22px; background:var(--bg-surface); border:1px solid var(--border-light); color:var(--text-primary); font-family:var(--font-body);"></textarea>
                        <button id="chatSendBtn" class="btn" style="padding:0.6rem 1.25rem; border-radius:22px; flex-shrink:0;">Send ➤</button>
                    </div>
                </div>
            `;

            // Scroll to bottom
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Back button
            document.getElementById('chatBackBtn').addEventListener('click', () => {
                this.currentView = 'rooms';
                this.renderCurrentView();
            });

            // Members panel
            const membersBtn = document.getElementById('roomMembersBtn');
            if (membersBtn) {
                membersBtn.addEventListener('click', () => this._showMembersPanel(room, iAmOwner));
            }

            // Send message
            const sendMessage = async () => {
                const input = document.getElementById('chatInput');
                const imageInput = document.getElementById('chatImageInput');
                const content = input.value.trim();
                let file = imageInput.files[0];
                if (!content && !file) return;
                if (file) file = await this.compressImage(file, 800, 0.7);

                const btn = document.getElementById('chatSendBtn');
                btn.disabled = true;
                btn.textContent = '...';

                try {
                    const formData = new FormData();
                    if (content) formData.append('content', content);
                    if (file) formData.append('image', file);

                    const res = await fetch(`${API_URL}/rooms/${roomId}/messages`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${this.token}` },
                        body: formData
                    });

                    if (res.ok) {
                        const msg = await res.json();
                        input.value = '';
                        imageInput.value = '';
                        this._appendMessage(msg, self);
                        this._lastMessageId = msg.id;
                    }
                } catch (e) {
                    console.error('Failed to send message', e);
                }
                btn.disabled = false;
                btn.textContent = 'Send ➤';
            };

            document.getElementById('chatSendBtn').addEventListener('click', sendMessage);
            document.getElementById('chatInput').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            });

            // Auto-resize textarea
            const chatInput = document.getElementById('chatInput');
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
            });

            // Typing indicator (debounced)
            let typingTimeout = null;
            chatInput.addEventListener('input', () => {
                if (!typingTimeout) {
                    this.authFetch(`${API_URL}/rooms/${roomId}/typing`, { method: 'POST' }).catch(() => {});
                }
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => { typingTimeout = null; }, 2000);
            });

            // Start polling for new messages
            if (this._chatPollInterval) clearInterval(this._chatPollInterval);
            this._chatPollInterval = setInterval(() => this._pollRoomMessages(roomId, self), 3000);

            // Reaction click delegation
            chatMessages.addEventListener('click', async (e) => {
                const btn = e.target.closest('.msg-react-btn');
                if (!btn) return;
                const msgId = btn.dataset.messageId;
                const emoji = btn.dataset.emoji;
                try {
                    await this.authFetch(`${API_URL}/rooms/${roomId}/messages/${msgId}/react`, {
                        method: 'POST',
                        body: JSON.stringify({ emoji })
                    });
                    // Re-poll immediately to update reactions
                    this._pollRoomMessages(roomId, self);
                } catch (e) { console.error('Reaction failed', e); }
            });

        } catch (e) {
            container.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--danger);">Failed to load channel.</div>`;
            console.error(e);
        }
    }

    _renderMessage(m, self) {
        const isOwn = m.author === self;
        const initial = escapeHTML(m.author).charAt(0).toUpperCase();
        const emojis = ['👍', '❤️', '😂', '😢', '😐'];
        const reactionCounts = {};
        (m.reactions || []).forEach(r => {
            if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, users: [], active: false };
            reactionCounts[r.emoji].count++;
            reactionCounts[r.emoji].users.push(r.author);
            if (r.author === self) reactionCounts[r.emoji].active = true;
        });

        return `
            <div class="msg-row ${isOwn ? 'own' : ''}" data-msg-id="${m.id}">
                <div class="msg-avatar">${initial}</div>
                <div>
                    ${!isOwn ? `<div class="msg-author">${escapeHTML(m.author)}</div>` : ''}
                    <div class="msg-bubble">
                        ${m.content ? `<div class="msg-content">${escapeHTML(m.content)}</div>` : ''}
                        ${m.image ? `<img src="${m.image}" class="msg-image" alt="attachment">` : ''}
                    </div>
                    <div class="msg-reactions">
                        ${emojis.map(e => {
                            const r = reactionCounts[e];
                            return `<button class="msg-react-btn ${r && r.active ? 'active' : ''}" data-message-id="${m.id}" data-emoji="${e}">${e}${r ? ` ${r.count}` : ''}</button>`;
                        }).join('')}
                    </div>
                    <div class="msg-time">${this.timeAgo(m.createdAt)}</div>
                </div>
            </div>
        `;
    }

    _appendMessage(msg, self) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        // Remove empty state if present
        const emptyState = chatMessages.querySelector('[style*="text-align:center"]');
        if (emptyState && chatMessages.children.length === 1) emptyState.remove();

        const div = document.createElement('div');
        div.innerHTML = this._renderMessage(msg, self);
        chatMessages.appendChild(div.firstElementChild);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async _pollRoomMessages(roomId, self) {
        if (this.currentView !== 'room_chat' || sessionStorage.getItem('activeRoomId') !== roomId) return;
        try {
            const res = await this.authFetch(`${API_URL}/rooms/${roomId}/poll?after=${this._lastMessageId || 0}`);
            if (!res.ok) return;
            const data = await res.json();

            // Append new messages
            if (data.messages && data.messages.length > 0) {
                for (const msg of data.messages) {
                    // Check if message already exists in DOM
                    const existing = document.querySelector(`[data-msg-id="${msg.id}"]`);
                    if (!existing) {
                        this._appendMessage(msg, self);
                    }
                    this._lastMessageId = Math.max(this._lastMessageId || 0, msg.id);
                }
            }

            // Update typing indicator
            const indicator = document.getElementById('typingIndicator');
            if (indicator) {
                if (data.typing && data.typing.length > 0) {
                    const names = data.typing.join(' and ');
                    indicator.textContent = `${names} ${data.typing.length > 1 ? 'are' : 'is'} typing...`;
                } else {
                    indicator.textContent = '';
                }
            }
        } catch (e) { /* silent */ }
    }

    _showMembersPanel(room, iAmOwner) {
        const existing = document.querySelector('.room-modal-overlay');
        if (existing) existing.remove();

        const self = this.user.username;
        const overlay = document.createElement('div');
        overlay.className = 'room-modal-overlay';
        overlay.innerHTML = `
            <div class="room-modal">
                <h3 style="font-size:1.3rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1.5rem;">Channel Operatives</h3>
                <div style="max-height:300px; overflow-y:auto;">
                    ${room.members.map(m => `
                        <div style="display:flex; align-items:center; gap:1rem; padding:0.75rem 0; border-bottom:1px solid var(--border-light);">
                            ${m.avatar ? `<img src="${m.avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">` : `<div style="width:36px; height:36px; border-radius:50%; background:var(--gradient-primary); display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff;">${escapeHTML(m.username).charAt(0).toUpperCase()}</div>`}
                            <div style="flex:1;">
                                <span style="font-weight:600; ${m.username === self ? 'color:var(--accent);' : ''}">${escapeHTML(m.username)}</span>
                                ${m.role === 'owner' ? '<span style="font-size:0.7rem; color:#fbbf24; margin-left:0.5rem;">★ COMMANDER</span>' : ''}
                            </div>
                            ${iAmOwner && m.username !== self ? `<button class="remove-member-btn" data-username="${escapeHTML(m.username)}" style="background:none; border:1px solid var(--danger); color:var(--danger); padding:0.3rem 0.6rem; border-radius:var(--radius-sm); font-size:0.75rem; cursor:pointer;">Remove</button>` : ''}
                        </div>
                    `).join('')}
                </div>
                ${iAmOwner ? `
                <div style="margin-top:1.25rem;">
                    <input type="text" id="addMemberSearch" placeholder="Add operative..." style="width:100%; padding:0.6rem 1rem; background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); color:var(--text-primary); font-size:0.9rem;">
                    <div id="addMemberResults" class="user-search-results" style="display:none;"></div>
                </div>` : ''}
                <div style="display:flex; gap:1rem; justify-content:space-between; margin-top:1.5rem;">
                    <button id="leaveRoomBtn" style="background:none; border:1px solid var(--danger); color:var(--danger); padding:0.5rem 1rem; border-radius:var(--radius-sm); cursor:pointer; font-size:0.85rem;">Leave Channel</button>
                    <button id="closeMembersBtn" class="btn" style="padding:0.5rem 1rem;">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('closeMembersBtn').addEventListener('click', () => overlay.remove());

        // Leave room
        document.getElementById('leaveRoomBtn').addEventListener('click', async () => {
            if (!confirm('Leave this channel? You will no longer receive messages.')) return;
            try {
                await this.authFetch(`${API_URL}/rooms/${room.id}/members/${encodeURIComponent(self)}`, { method: 'DELETE' });
                overlay.remove();
                this.currentView = 'rooms';
                this.renderCurrentView();
            } catch (e) { alert('Failed to leave channel.'); }
        });

        // Remove member
        overlay.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uname = btn.dataset.username;
                if (!confirm(`Remove ${uname} from this channel?`)) return;
                try {
                    await this.authFetch(`${API_URL}/rooms/${room.id}/members/${encodeURIComponent(uname)}`, { method: 'DELETE' });
                    overlay.remove();
                    // Refresh chat to reflect changes
                    this.renderRoomChat(document.getElementById('mainContent'));
                } catch (e) { alert('Failed to remove operative.'); }
            });
        });

        // Add member search
        const addSearch = document.getElementById('addMemberSearch');
        if (addSearch) {
            let timeout = null;
            addSearch.addEventListener('input', () => {
                clearTimeout(timeout);
                const q = addSearch.value.trim();
                const results = document.getElementById('addMemberResults');
                if (q.length < 1) { results.style.display = 'none'; return; }
                timeout = setTimeout(async () => {
                    try {
                        const res = await this.authFetch(`${API_URL}/users/search?q=${encodeURIComponent(q)}`);
                        const users = await res.json();
                        const existingMembers = room.members.map(m => m.username);
                        const available = users.filter(u => !existingMembers.includes(u.username));
                        if (available.length === 0) { results.style.display = 'none'; return; }
                        results.style.display = 'block';
                        results.innerHTML = available.map(u => `
                            <div class="user-search-item" data-username="${escapeHTML(u.username)}">
                                <span>${escapeHTML(u.username)}</span>
                            </div>
                        `).join('');
                        results.querySelectorAll('.user-search-item').forEach(item => {
                            item.addEventListener('click', async () => {
                                try {
                                    await this.authFetch(`${API_URL}/rooms/${room.id}/members`, {
                                        method: 'POST',
                                        body: JSON.stringify({ username: item.dataset.username })
                                    });
                                    overlay.remove();
                                    this.renderRoomChat(document.getElementById('mainContent'));
                                } catch (e) { alert('Failed to add operative.'); }
                            });
                        });
                    } catch (e) { /* silent */ }
                }, 300);
            });
        }
    }

    async startDM(username) {
        try {
            const res = await this.authFetch(`${API_URL}/rooms`, {
                method: 'POST',
                body: JSON.stringify({ type: 'dm', members: [username] })
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
            const room = await res.json();
            sessionStorage.setItem('activeRoomId', room.id);
            this.currentView = 'room_chat';
            this.renderApp();
        } catch (e) {
            alert('Failed to open secure channel.');
            console.error(e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new TerminalApp();
});
