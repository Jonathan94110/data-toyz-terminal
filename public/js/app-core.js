// app-core.js — TerminalApp class, initialization, navigation

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

    renderApp() {
        this.appEl.innerHTML = `
            <div class="app-layout animate-mount">
                <aside class="sidebar">
                    <div class="sidebar-brand" style="cursor:pointer; display: flex; flex-direction: column; align-items: center; text-align: center;" onclick="app.currentView='feed'; app.renderApp();">
                        <img src="logo.png" alt="Data Toyz Logo" style="max-height: 120px; width: auto; margin-bottom: 0.5rem; filter: drop-shadow(0 0 10px rgba(255, 42, 95, 0.3));">

                    </div>
                    <nav class="sidebar-nav">
                        <div class="nav-item ${this.currentView === 'feed' ? 'active' : ''}" data-view="feed">
                            Community Feed
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
}

// --- Navigation & utility methods (prototype extensions) --- //

TerminalApp.prototype.logout = function() {
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
};

TerminalApp.prototype.viewUserProfile = function(username) {
    sessionStorage.setItem('profileUser', username);
    this.previousView = this.currentView;
    this.currentView = 'user_profile';
    this.renderApp();
};

TerminalApp.prototype.selectTarget = function(id) {
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
};

// --- Notification methods (prototype extensions) --- //

TerminalApp.prototype.updateNotifBadge = async function() {
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
};

TerminalApp.prototype.loadNotifications = async function() {
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
};

TerminalApp.prototype.timeAgo = function(dateStr) {
    const now = new Date();
    const d = new Date(dateStr);
    const secs = Math.floor((now - d) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
    return d.toLocaleDateString();
};

TerminalApp.prototype.updateRoomsBadge = async function() {
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
};

// Boot the app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new TerminalApp();
});
