// app-core.js — TerminalApp class, initialization, navigation

class TerminalApp {
    get currentView() {
        return sessionStorage.getItem('terminalView') || 'search';
    }
    set currentView(val) {
        const prev = sessionStorage.getItem('terminalView');
        sessionStorage.setItem('terminalView', val);
        // Push browser history for back/forward button support
        if (!this._isPopState && this._historyReady) {
            const state = { view: val };
            if (val === 'pulse' && this.currentTarget) state.targetId = this.currentTarget.id;
            if (val === 'user_profile') state.profileUser = sessionStorage.getItem('profileUser');
            if (val === 'room_chat') state.roomId = sessionStorage.getItem('activeRoomId');
            // Always push if context changed (e.g., different profile or figure), even if same view
            const contextChanged = (val === 'user_profile' && state.profileUser !== (history.state && history.state.profileUser))
                || (val === 'pulse' && state.targetId !== (history.state && history.state.targetId))
                || (val === 'room_chat' && state.roomId !== (history.state && history.state.roomId));
            if (val !== prev || contextChanged) {
                history.pushState(state, '');
            }
        }
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
        this._isPopState = false;
        this._historyReady = false;
        this._isTabHidden = false;

        // Browser back/forward button support
        window.addEventListener('popstate', (e) => {
            if (!this.user || !e.state || !e.state.view) return;
            this._isPopState = true;
            // Restore view context
            if (e.state.targetId) {
                const target = MOCK_FIGURES.find(f => f.id == e.state.targetId);
                if (target) this.currentTarget = target;
            }
            if (e.state.profileUser) sessionStorage.setItem('profileUser', e.state.profileUser);
            if (e.state.roomId) sessionStorage.setItem('activeRoomId', e.state.roomId);
            this.currentView = e.state.view;
            this.renderApp();
            this._isPopState = false;
        });

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

        // Validate token with retry (survives server restarts during Render deploys)
        // 5 attempts with exponential backoff: 2s, 4s, 6s, 8s, 10s = 30s total coverage
        const maxRetries = 5;
        let lastErr = null;
        let gotAuthReject = false;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const res = await fetch(`${API_URL}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });

                if (res.status === 401 || res.status === 403) {
                    // During deploys, a transient 401 can occur — retry before giving up
                    if (!gotAuthReject && attempt < maxRetries - 1) {
                        gotAuthReject = true;
                        console.warn(`[Auth] Token rejected (attempt ${attempt + 1}), retrying...`);
                        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                        continue;
                    }
                    // Confirmed auth failure after retry — token is truly invalid
                    const errBody = await res.json().catch(() => ({}));
                    console.warn('[Auth] Token rejected permanently:', res.status, errBody.error || 'unknown');
                    this.token = null;
                    this.user = null;
                    localStorage.removeItem('terminal_token');
                    this.renderLogin();
                    return;
                }
                if (!res.ok) throw new Error(`Server error (${res.status})`);
                this.user = await res.json();

                // Token renewal: server returns a fresh 30-day token on each /me call
                // so sessions stay alive as long as the user opens the app within 30 days
                if (this.user.token) {
                    this.token = this.user.token;
                    localStorage.setItem('terminal_token', this.token);
                    delete this.user.token; // don't store token in user object
                }

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
                this.startTicker();
                // Set initial browser history state (so back doesn't leave the app on first nav)
                history.replaceState({ view: this.currentView }, '');
                this._historyReady = true;
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

    // Authenticated fetch helper — retries once on 401 to survive deploy blips
    // Pass { background: true } for non-critical polling so it never kicks the user out
    async authFetch(url, options = {}) {
        const isBackground = options.background;
        delete options.background; // don't pass to fetch()

        if (!options.headers) options.headers = {};
        if (this.token && !(options.body instanceof FormData)) {
            if (!options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
        }
        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }
        const res = await fetch(url, options);
        if (res.status === 401) {
            // Background polls should NOT kick the user out — just throw silently
            if (isBackground) {
                throw new Error('Auth expired (background)');
            }
            // Retry once after a short delay — deploy blips can cause transient 401s
            await new Promise(r => setTimeout(r, 2000));
            const retryOpts = { ...options, headers: { ...options.headers } };
            if (this.token) retryOpts.headers['Authorization'] = `Bearer ${this.token}`;
            try {
                const res2 = await fetch(url, retryOpts);
                if (res2.status === 401) {
                    // Confirmed auth failure — nuke the token
                    const errBody = await res2.json().catch(() => ({}));
                    console.warn('[Auth] Token rejected on retry:', res2.status, errBody.error || 'unknown');
                    this.token = null;
                    this.user = null;
                    localStorage.removeItem('terminal_token');
                    this.renderLogin();
                    throw new Error('Session expired. Please log in again.');
                }
                return res2; // Retry succeeded — deploy blip survived
            } catch (retryErr) {
                if (retryErr.message === 'Session expired. Please log in again.') throw retryErr;
                // Network error on retry — don't nuke token, just throw
                throw retryErr;
            }
        }
        return res;
    }

    async startTicker() {
        const wrap = document.getElementById('globalTicker');
        let content = document.getElementById('tickerContent');
        if (!wrap || !content) return;

        try {
            // Fetch ticker settings (public, no auth)
            let tickerMode = 'all', tickerLength = 25;
            try {
                const settingsRes = await fetch(`${API_URL}/settings/ticker`);
                if (settingsRes.ok) {
                    const s = await settingsRes.json();
                    tickerMode = s.ticker_mode || 'all';
                    tickerLength = s.ticker_length || 25;
                }
            } catch (e) { /* use defaults */ }

            // Fetch ranked figures (includes avgGrade, avgApproval, latestPrice)
            const figuresRes = await fetch(`${API_URL}/figures/market-ranked?sort=grade&order=desc&category=${getActiveCategory()}`);
            const allFigures = await figuresRes.json().catch(() => []);

            let html = '';

            // Pricing section
            if (tickerMode === 'pricing' || tickerMode === 'all') {
                const topPriced = [...allFigures]
                    .filter(f => f.latestPrice)
                    .sort((a, b) => parseFloat(b.latestPrice) - parseFloat(a.latestPrice))
                    .slice(0, tickerLength);
                if (topPriced.length > 0) {
                    html += topPriced.map((f, i) => `<span class="ticker-item"><span class="ticker-neutral">#${i + 1} [${escapeHTML(f.brand)}]</span> ${escapeHTML(f.name)} <span style="color:var(--text-primary); margin-left:0.25rem;">$${parseFloat(f.latestPrice).toFixed(2)}</span></span>`).join('');
                }
            }

            // Grade section (combined MTS + approval)
            if (tickerMode === 'grade' || tickerMode === 'all') {
                const topGraded = allFigures
                    .filter(f => f.avgGrade && f.submissions > 0)
                    .slice(0, tickerLength);
                if (topGraded.length > 0) {
                    html += topGraded.map((f, i) => `<span class="ticker-item"><span class="ticker-neutral">#${i + 1} [${escapeHTML(f.brand)}]</span> ${escapeHTML(f.name)} <span style="color:var(--success); margin-left:0.25rem;">&#9733; ${f.avgGrade}</span></span>`).join('');
                }
            }

            // Approval rating section (approval score only)
            if (tickerMode === 'approval') {
                const topApproval = [...allFigures]
                    .filter(f => f.avgApproval && f.submissions > 0)
                    .sort((a, b) => b.avgApproval - a.avgApproval)
                    .slice(0, tickerLength);
                if (topApproval.length > 0) {
                    html += topApproval.map((f, i) => `<span class="ticker-item"><span class="ticker-neutral">#${i + 1} [${escapeHTML(f.brand)}]</span> ${escapeHTML(f.name)} <span style="color:#a855f7; margin-left:0.25rem;">&#9829; ${f.avgApproval}</span></span>`).join('');
                }
            }

            if (html) {
                // duplicate content heavily to allow seamless continuous scrolling animation loop for large monitors
                content.innerHTML = html + html + html + html;
                wrap.style.display = 'flex';

                // Add speed controls
                if (!document.getElementById('tickerControls')) {
                    const controls = document.createElement('div');
                    controls.id = 'tickerControls';
                    controls.style.cssText = 'position:absolute; right:10px; z-index:100; display:flex; gap:5px; background:var(--bg-panel); padding:2px 6px; border-radius:4px; align-items:center;';
                    controls.innerHTML = `
                        <button class="btn-sm" style="padding:0.1rem 0.3rem; font-size:0.7rem;" onclick="document.getElementById('tickerContent').style.animationPlayState = 'paused'">&#9208;</button>
                        <button class="btn-sm" style="padding:0.1rem 0.3rem; font-size:0.7rem;" onclick="document.getElementById('tickerContent').style.animationPlayState = 'running'">&#9654;</button>
                        <button class="btn-sm" style="padding:0.1rem 0.3rem; font-size:0.7rem;" onclick="document.getElementById('tickerContent').style.animationDuration = '200s'">&#9193;</button>
                        <button class="btn-sm" style="padding:0.1rem 0.3rem; font-size:0.7rem;" onclick="document.getElementById('tickerContent').style.animationDuration = '800s'">&#128034;</button>
                    `;
                    wrap.appendChild(controls);
                }

                // Ensure content resets animation
                content.style.animation = 'none';
                void content.offsetWidth; // trigger reflow
                content.style.animation = 'ticker 400s linear infinite';
            }
        } catch (e) {
            console.error('Ticker load failed:', e);
        }
    }

    async loadFigures() {
        try {
            const res = await fetch(`${API_URL}/figures?category=${getActiveCategory()}`);
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
                    <div class="sidebar-brand" style="cursor:pointer; display: flex; flex-direction: column; align-items: center; text-align: center;" onclick="app.currentView='search'; app.renderApp();">
                        <img src="logo.png" alt="Data Toyz Logo" class="sidebar-logo" style="max-height: 120px; width: auto; margin-bottom: 0.5rem; filter: drop-shadow(0 0 10px rgba(255, 42, 95, 0.3));">
                    </div>
                    <div class="category-switcher">
                        <button class="cat-btn${getActiveCategory() === 'transformer' ? ' active' : ''}" data-category="transformer">Transformers</button>
                        <button class="cat-btn${getActiveCategory() === 'action_figure' ? ' active' : ''}" data-category="action_figure">Action Figures</button>
                    </div>
                    <nav class="sidebar-nav">
                        <div class="nav-item ${this.currentView === 'search' ? 'active' : ''}" data-view="search">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                            <span class="nav-label">Action Figure Registration</span>
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
                        <div class="nav-item ${this.currentView === 'figure_leaderboard' ? 'active' : ''}" data-view="figure_leaderboard">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
                            <span class="nav-label">Leaderboard</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'leaderboards' ? 'active' : ''}" data-view="leaderboards">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                            <span class="nav-label">Analyst Rankings</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'profile' ? 'active' : ''}" data-view="profile">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            <span class="nav-label">Profile Settings</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'scorecard' ? 'active' : ''}" data-view="scorecard">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/><path d="M2 20h20"/></svg>
                            <span class="nav-label">Live Scorecard</span>
                        </div>
                        <div class="nav-item ${this.currentView === 'docs' ? 'active' : ''}" data-view="docs">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                            <span class="nav-label">Documentation</span>
                        </div>
                        ${['owner', 'admin', 'moderator'].includes(this.user.role) ? `
                        <div class="nav-item ${this.currentView === 'admin' ? 'active' : ''}" data-view="admin" style="margin-top:1rem; border-top:1px solid var(--border-light); padding-top:1rem;">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            <span class="nav-label">${this.user.role === 'moderator' ? 'Mod Panel' : 'Admin Panel'}</span>
                        </div>
                        ` : ''}
                        <div id="themeToggle" class="nav-item" style="margin-top:auto; border-top:1px solid var(--border-light); padding-top:1rem; opacity:0.7;">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${document.body.getAttribute('data-theme') === 'dark' ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'}</svg>
                            <span class="nav-label">${document.body.getAttribute('data-theme') === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                        </div>
                        <div id="sidebarCollapseBtn" class="nav-item" style="border-top:1px solid var(--border-light); padding-top:1rem; opacity:0.7;">
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${sidebarCollapsed ? '<polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>' : '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>'}</svg>
                            <span class="nav-label">${sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
                        </div>
                    </nav>
                </aside>

                <main class="main-content">
                    <header class="topbar">
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
                            <div class="user-info-text" style="line-height:1.2;">
                                <div style="font-weight:600; font-size:0.95rem;">${escapeHTML(this.user.username)}</div>
                                <div style="font-size:0.75rem; color:${{ 'owner': '#a855f7', 'admin': '#fbbf24', 'moderator': '#3b82f6' }[this.user.role] || 'var(--accent)'}; text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">${{ 'owner': '\u{2B50} Owner', 'admin': '\u{2605} Admin', 'moderator': '\u{1F6E1}\u{FE0F} Moderator' }[this.user.role] || 'Analyst'}</div>
                                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">View Profile</div>
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

        // Category switcher
        document.querySelectorAll('.cat-btn[data-category]').forEach(btn => {
            btn.addEventListener('click', () => {
                const newCat = btn.dataset.category;
                if (getActiveCategory() !== newCat) {
                    setActiveCategory(newCat);
                    this.loadFigures();
                    this.renderApp();
                }
            });
        });

        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

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
        // Remove previous document click handler to prevent listener stacking
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
        }
        this._docClickHandler = (e) => {
            if (!bell.contains(e.target)) dropdown.style.display = 'none';
        };
        document.addEventListener('click', this._docClickHandler);

        // Poll notifications
        if (this._notifInterval) clearInterval(this._notifInterval);
        var self = this;
        this._notifInterval = setInterval(function() { if (!self._isTabHidden) self.updateNotifBadge(); }, 30000);
        this.updateNotifBadge();

        // Poll rooms unread badge
        if (this._roomsPollInterval) clearInterval(this._roomsPollInterval);
        this._roomsPollInterval = setInterval(function() { if (!self._isTabHidden) self.updateRoomsBadge(); }, 15000);
        this.updateRoomsBadge();

        // Visibility detection for smart polling
        this._setupVisibilityDetection();

        this.renderCurrentView();
    }

    renderCurrentView() {
        const contentArea = document.getElementById('mainContent');
        // Reset scroll position on view change
        if (contentArea) contentArea.scrollTop = 0;
        // Clear chat polling when leaving room_chat
        if (this.currentView !== 'room_chat' && this._chatPollInterval) {
            clearInterval(this._chatPollInterval);
            this._chatPollInterval = null;
        }
        // Clean up orphaned autocomplete dropdowns on every view change
        document.querySelectorAll('.figure-autocomplete').forEach(function(el) { el.remove(); });
        // Destroy any active Chart.js instances to free canvas memory
        if (this._activeCharts) {
            this._activeCharts.forEach(function(c) { try { c.destroy(); } catch(e) {} });
            this._activeCharts = null;
        }

        // Wrap view rendering in try/catch so a single bad render doesn't crash the app
        try {
            if (this.currentView === 'feed') this.renderFeed(contentArea);
            else if (this.currentView === 'rooms') this.renderRoomsList(contentArea);
            else if (this.currentView === 'room_chat') this.renderRoomChat(contentArea);
            else if (this.currentView === 'market_pulse') this.renderMarketPulse(contentArea);
            else if (this.currentView === 'search') this.renderSearch(contentArea);
            else if (this.currentView === 'dashboard') this.renderDashboard(contentArea);
            else if (this.currentView === 'figure_leaderboard') this.renderFigureLeaderboard(contentArea);
            else if (this.currentView === 'leaderboards') this.renderLeaderboards(contentArea);
            else if (this.currentView === 'pulse') this.renderPulse(contentArea);
            else if (this.currentView === 'submission') this.renderSubmission(contentArea);
            else if (this.currentView === 'add_target') this.renderAddTarget(contentArea);
            else if (this.currentView === 'profile') this.renderProfile(contentArea);
            else if (this.currentView === 'user_profile') this.renderUserProfile(contentArea);
            else if (this.currentView === 'scorecard') this.renderScorecard(contentArea);
            else if (this.currentView === 'docs') this.renderDocs(contentArea);
            else if (this.currentView === 'admin' && ['owner', 'admin', 'moderator'].includes(this.user.role)) this.renderAdmin(contentArea);
        } catch (err) {
            console.error('View render crashed:', this.currentView, err);
            if (contentArea) contentArea.innerHTML = '<div style="padding:3rem; text-align:center; color:var(--danger);">Something went wrong loading this view. <button class="btn" style="margin-top:1rem;" onclick="app.currentView=\'search\'; app.renderCurrentView();">Go Home</button></div>';
        }
    }
}

// --- Navigation & utility methods (prototype extensions) --- //

TerminalApp.prototype._setupVisibilityDetection = function() {
    // Remove previous listener to prevent stacking on every renderApp() call
    if (this._visibilityHandler) {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    var self = this;
    this._visibilityHandler = function() {
        self._isTabHidden = document.hidden;
        if (!document.hidden) {
            self.updateNotifBadge();
            self.updateRoomsBadge();
        }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
};

TerminalApp.prototype.logout = function () {
    // Revoke token server-side (best-effort, don't block on failure)
    if (this.token) {
        fetch(API_URL + '/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + this.token, 'Content-Type': 'application/json' }
        }).catch(function () {}); // Fire-and-forget
    }
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

// --- Request Assessment modal --- //
TerminalApp.prototype.showShareModal = function(figureId, figureName) {
    const existing = document.querySelector('.share-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'room-modal-overlay share-modal-overlay';
    overlay.innerHTML = `
        <div class="room-modal">
            <h3 style="font-size:1.3rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Request Assessment</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1.5rem;">
                Send a notification requesting assessment on <strong style="color:var(--accent);">${escapeHTML(figureName)}</strong>
            </p>

            <label style="font-size:0.85rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.03em;">Select Recipients</label>
            <input type="text" id="shareSearchInput" placeholder="Search by username..." style="width:100%; padding:0.75rem 1rem; background:var(--bg-panel); border:1px solid var(--border-light); border-radius:var(--radius-sm); color:var(--text-primary); font-size:0.95rem; margin:0.5rem 0 0.25rem;">
            <div id="shareSearchResults" class="user-search-results" style="display:none;"></div>
            <div id="shareSelectedMembers" style="display:flex; flex-wrap:wrap; gap:0.25rem; margin:0.75rem 0 1.5rem; min-height:2rem;"></div>

            <div style="display:flex; gap:1rem; justify-content:flex-end;">
                <button id="cancelShareBtn" class="btn" style="background:transparent; border:1px solid var(--border-light); color:var(--text-secondary);">Cancel</button>
                <button id="sendShareBtn" class="btn">Send Request</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const selectedRecipients = [];
    let searchTimeout = null;
    const self = this;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('cancelShareBtn').addEventListener('click', () => overlay.remove());

    const searchInput = document.getElementById('shareSearchInput');
    const resultsDiv = document.getElementById('shareSearchResults');

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = searchInput.value.trim();
        if (q.length < 1) { resultsDiv.style.display = 'none'; return; }
        searchTimeout = setTimeout(async () => {
            try {
                const res = await self.authFetch(`${API_URL}/users/search?q=${encodeURIComponent(q)}`);
                const users = await res.json();
                const available = users.filter(u => !selectedRecipients.includes(u.username));
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
                        if (!selectedRecipients.includes(uname)) {
                            selectedRecipients.push(uname);
                            renderShareChips();
                        }
                        searchInput.value = '';
                        resultsDiv.style.display = 'none';
                    });
                });
            } catch (e) { resultsDiv.style.display = 'none'; }
        }, 300);
    });

    const renderShareChips = () => {
        const container = document.getElementById('shareSelectedMembers');
        if (!container) return;
        container.innerHTML = selectedRecipients.map(m => `
            <span class="member-pill">
                ${escapeHTML(m)}
                <span class="remove-member" data-username="${escapeHTML(m)}">&times;</span>
            </span>
        `).join('');
        container.querySelectorAll('.remove-member').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = selectedRecipients.indexOf(btn.dataset.username);
                if (idx > -1) selectedRecipients.splice(idx, 1);
                renderShareChips();
            });
        });
    };

    document.getElementById('sendShareBtn').addEventListener('click', async () => {
        if (selectedRecipients.length === 0) return alert('Select at least one recipient.');

        const btn = document.getElementById('sendShareBtn');
        btn.textContent = 'Sending...';
        btn.disabled = true;

        try {
            const res = await self.authFetch(`${API_URL}/figures/${figureId}/request-assessment`, {
                method: 'POST',
                body: JSON.stringify({ recipients: selectedRecipients })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            btn.textContent = 'Sent!';
            btn.style.background = 'var(--success)';
            setTimeout(() => overlay.remove(), 1200);
        } catch (e) {
            alert(e.message || 'Failed to send assessment request.');
            btn.textContent = 'Send Request';
            btn.disabled = false;
        }
    });
};

// --- Notification methods (prototype extensions) --- //

TerminalApp.prototype.updateNotifBadge = async function () {
    try {
        const res = await this.authFetch(`${API_URL}/notifications/${encodeURIComponent(this.user.username)}/count`, { background: true });
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

        const icons = { comment: '💬', reaction: '❤️', co_reviewer: '📋', message: '🔒', follow: '👥', mention: '📢', flag: '🚩', assessment_request: '📊' };

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
                if (linkType === 'post') { sessionStorage.setItem('sharedPostId', linkId); this.currentView = 'feed'; this.renderApp(); }
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
        const res = await this.authFetch(`${API_URL}/rooms/unread-total`, { background: true });
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
