// app-core.js — TerminalApp class, initialization, navigation

class TerminalApp {
    get currentView() {
        return sessionStorage.getItem('terminalView') || 'search';
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

        // Validate token with retry (survives brief server restarts during deploys)
        const maxRetries = 3;
        let lastErr = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const res = await fetch(`${API_URL}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (res.status === 401 || res.status === 403) {
                    // Definitive auth failure — token is invalid, clear it
                    this.token = null;
                    this.user = null;
                    localStorage.removeItem('terminal_token');
                    this.renderLogin();
                    return;
                }
                if (!res.ok) throw new Error('Server error');
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
                return;
            } catch (e) {
                lastErr = e;
                // Network error or server error — wait and retry (server may be restarting)
                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                }
            }
        }
        // All retries exhausted — network is down, but keep the token for next reload
        console.warn('Could not reach server after retries:', lastErr);
        this.appEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; height:100vh; flex-direction:column; gap:1rem; color:var(--text-secondary);">
                <h2 style="color:var(--accent);">Server Unavailable</h2>
                <p>The server may be updating. Your session is preserved.</p>
                <button class="btn" onclick="location.reload()">Retry</button>
            </div>
        `;
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
        const sidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
        this.appEl.innerHTML = `
            <div class="app-layout animate-mount">
                <aside class="sidebar${sidebarCollapsed ? ' collapsed' : ''}">
                    <div class="sidebar-brand" style="cursor:pointer; display: flex; flex-direction: column; align-items: center; text-align: center;" onclick="app.currentView='feed'; app.renderApp();">
                        <img src="logo.png" alt="Data Toyz Logo" class="sidebar-logo" style="max-height: 120px; width: auto; margin-bottom: 0.5rem; filter: drop-shadow(0 0 10px rgba(255, 42, 95, 0.3));">
                    </div>
                    <nav class="sidebar-nav">
                        <div class="nav-item ${this.currentView === 'search' ? 'active' : ''}" data-view="search">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                            <span class="nav-label">Score Figure</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'feed' ? 'active' : ''}" data-view="feed">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <span class="nav-label">Community Feed</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'rooms' || this.currentView === 'room_chat' ? 'active' : ''}" data-view="rooms" style="position:relative;">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span class="nav-label">DMs & Group Chats</span>
                            <span id="roomsBadge" style="display:none; position:absolute; right:1rem; top:50%; transform:translateY(-50%); background:var(--danger); color:#fff; font-size:0.6rem; font-weight:800; padding:1px 5px; border-radius:10px; min-width:16px; text-align:center;"></span>
                        </div>
                        <div class="nav-item ${this.currentView === 'market_pulse' ? 'active' : ''}" data-view="market_pulse">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                            <span class="nav-label">Market Pulse</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            <span class="nav-label">My Intel History</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'leaderboards' ? 'active' : ''}" data-view="leaderboards">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                            <span class="nav-label">Global Leaderboard</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'profile' ? 'active' : ''}" data-view="profile">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            <span class="nav-label">Profile Settings</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'docs' ? 'active' : ''}" data-view="docs">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                            <span class="nav-label">Documentation</span>
                        </div>
                        ${(this.user.role === 'admin' || this.user.username === 'Prime Dynamixx') ? `
                        <div class="nav-item ${this.currentView === 'admin' ? 'active' : ''}" data-view="admin" style="margin-top:1rem; border-top:1px solid var(--border-light); padding-top:1rem;">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            <span class="nav-label">Admin Panel</span>
                        </div>
                        ` : ''}
                        <div id="pwaInstallBtn" class="nav-item" style="margin-top:auto; border-top:1px solid var(--border-light); padding-top:1rem; display:${deferredInstallPrompt ? 'flex' : 'none'}; color:var(--accent);">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            <span class="nav-label">Install App</span>
                        </div>
                        <div id="themeToggle" class="nav-item" style="${deferredInstallPrompt ? '' : 'margin-top:auto; '}border-top:1px solid var(--border-light); padding-top:1rem; opacity:0.7;">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${document.body.getAttribute('data-theme') === 'dark' ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'}</svg>
                            <span class="nav-label">${document.body.getAttribute('data-theme') === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                        </div>
                        <div id="sidebarCollapseBtn" class="nav-item" style="border-top:1px solid var(--border-light); padding-top:1rem; opacity:0.7;">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${sidebarCollapsed ? '<polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>' : '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>'}</svg>
                            <span class="nav-label">${sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
                        </div>
                    </nav>
                </aside>

                <div class="sidebar-overlay" id="sidebarOverlay"></div>
                <main class="main-content">
                    <header class="topbar">
                        <button class="hamburger-btn" id="hamburgerBtn" aria-label="Toggle menu">☰</button>
                        <div class="topbar-search">
                            <svg class="topbar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input type="text" id="globalSearchInput" class="topbar-search-input" placeholder="Search targets, users, intel..." />
                        </div>
                        <div class="user-profile">
                            <div id="notifBell" class="topbar-icon-btn" style="position:relative; cursor:pointer;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                                <span id="notifBadge" style="display:none; position:absolute; top:-2px; right:-2px; background:var(--danger); color:#fff; font-size:0.55rem; font-weight:800; padding:1px 4px; border-radius:10px; min-width:14px; text-align:center;"></span>
                                <div id="notifDropdown" class="notif-dropdown" style="display:none;"></div>
                            </div>
                            <div style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;" onclick="app.viewUserProfile(app.user.username)">
                            ${this.user.avatar ? `<img src="${this.user.avatar}" class="user-avatar" style="object-fit:cover; border:none; background:transparent;" onerror="this.onerror=null; this.outerHTML='<div class=\\'user-avatar\\'>${escapeHTML(this.user.username).charAt(0).toUpperCase()}</div>';">` : `<div class="user-avatar">${escapeHTML(this.user.username).charAt(0).toUpperCase()}</div>`}
                            <div style="line-height:1.2;">
                                <div style="font-weight:600; font-size:0.95rem;">${escapeHTML(this.user.username)}</div>
                                <div style="font-size:0.75rem; color:${(this.user.role === 'admin' || this.user.username === 'Prime Dynamixx') ? '#fbbf24' : 'var(--accent)'}; text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">${(this.user.role === 'admin' || this.user.username === 'Prime Dynamixx') ? '★ Admin' : 'Analyst'}</div>
                            </div>
                            </div>
                            <button id="logoutBtn" class="topbar-icon-btn" title="Sign Out" style="margin-left:0.5rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            </button>
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

        // Sidebar collapse toggle
        const collapseBtn = document.getElementById('sidebarCollapseBtn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
                localStorage.setItem('sidebar_collapsed', !isCollapsed);
                this.renderApp();
            });
        }

        // Global search
        const globalSearch = document.getElementById('globalSearchInput');
        if (globalSearch) {
            globalSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const q = globalSearch.value.trim();
                    if (q) {
                        this.currentView = 'search';
                        this.renderApp();
                        setTimeout(() => {
                            const searchInput = document.getElementById('searchInput');
                            if (searchInput) { searchInput.value = q; }
                            const searchBtn = document.querySelector('.score-search-btn, [onclick*="doSearch"]');
                            if (typeof app.doSearchFromGlobal === 'function') app.doSearchFromGlobal(q);
                        }, 200);
                    }
                }
            });
        }

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

TerminalApp.prototype.logout = function () {
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

TerminalApp.prototype.viewUserProfile = function (username) {
    sessionStorage.setItem('profileUser', username);
    this.previousView = this.currentView;
    this.currentView = 'user_profile';
    this.renderApp();
};

TerminalApp.prototype.selectTarget = function (id) {
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

TerminalApp.prototype.updateNotifBadge = async function () {
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

TerminalApp.prototype.loadNotifications = async function () {
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

TerminalApp.prototype.timeAgo = function (dateStr) {
    const now = new Date();
    const d = new Date(dateStr);
    const secs = Math.floor((now - d) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
    return d.toLocaleDateString();
};

TerminalApp.prototype.updateRoomsBadge = async function () {
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
