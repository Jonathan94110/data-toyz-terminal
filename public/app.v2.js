// app.js

const API_URL = '/api';
let MOCK_FIGURES = [];

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

        try {
            const stored = localStorage.getItem('terminal_user');
            this.user = stored && stored !== 'undefined' ? JSON.parse(stored) : null;
        } catch (e) {
            console.error("Corrupted identity storage purged.", e);
            localStorage.removeItem('terminal_user');
            this.user = null;
        }


        this.init();
    }

    async init() {
        if (!this.user) {
            this.renderLogin();
        } else {
            await this.loadFigures();
            this.renderApp();
        }
    }

    async loadFigures() {
        try {
            const res = await fetch(`${API_URL}/figures`);
            if (res.ok) MOCK_FIGURES = await res.json();
        } catch (e) {
            console.error("Failed to fetch figure catalog from backend", e);
        }
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
                                <label for="loginPassword">Passcode</label>
                                <input type="password" id="loginPassword" placeholder="••••••••" required>
                            </div>
                            <button type="submit" class="btn">Authenticate</button>
                            <div style="margin-top:1.5rem; text-align:center; font-size:0.9rem; display:flex; flex-direction:column; gap:0.5rem;">
                                <a href="#" id="showRegisterBtn" style="color:var(--accent); text-decoration:none;">Initialize New Operative ID</a>
                                <a href="#" id="showResetBtn" style="color:var(--text-muted); text-decoration:none;">Forgot Passcode?</a>
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
                                <label for="regPassword">Passcode</label>
                                <input type="password" id="regPassword" placeholder="••••••••" required>
                            </div>
                            <button type="submit" class="btn" style="background:var(--success); color:#000;">Register Identity</button>
                            <div style="margin-top:1.5rem; text-align:center; font-size:0.9rem;">
                                <a href="#" id="showLoginBtn" style="color:var(--text-secondary); text-decoration:none;">Return to Authentication</a>
                            </div>
                        </form>
                    </div>

                    <div id="resetSection" style="display:none;">
                        <form id="resetForm">
                            <div class="input-group">
                                <label for="resUsername">My Username</label>
                                <input type="text" id="resUsername" required autocomplete="off">
                            </div>
                            <div class="input-group">
                                <label for="resEmail">My Registered Email Address</label>
                                <input type="email" id="resEmail" required autocomplete="email">
                            </div>
                            <div class="input-group">
                                <label for="resPassword">Re-enter password</label>
                                <input type="password" id="resPassword" placeholder="Type your new password..." required>
                            </div>
                            <button type="submit" class="btn" style="background:#eab308; color:#000;">Save New Password & Login</button>
                            <div style="margin-top:1.5rem; text-align:center; font-size:0.9rem;">
                                <a href="#" id="showLoginFromResetBtn" style="color:var(--text-secondary); text-decoration:none;">Cancel Override</a>
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

        document.getElementById('showResetBtn').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('resetSection').style.display = 'block';
        });

        document.getElementById('showLoginFromResetBtn').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('resetSection').style.display = 'none';
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

                this.user = data;
                localStorage.setItem('terminal_user', JSON.stringify(this.user));
                this.init();
            } catch (err) {
                alert(err.message);
            }
        });

        document.getElementById('resetForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('resUsername').value.trim();
            const email = document.getElementById('resEmail').value.trim();
            const newPassword = document.getElementById('resPassword').value;

            try {
                const res = await fetch(`${API_URL}/auth/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, newPassword })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Password override failed.');

                alert(data.message);
                document.getElementById('resetSection').style.display = 'none';
                document.getElementById('loginSection').style.display = 'block';
                document.getElementById('resetForm').reset();
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

                this.user = data;
                localStorage.setItem('terminal_user', JSON.stringify(this.user));
                this.init();
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
                        <img src="logo.png" alt="Data Toyz Logo" style="max-height: 80px; width: auto; margin-bottom: 0.5rem; filter: drop-shadow(0 0 10px rgba(255, 42, 95, 0.3));">
                        <h2 class="glow-text" style="font-size: 1.5rem; margin-bottom: 0;">DATA TOYZ</h2>
                        <small style="color:var(--text-muted); font-family:var(--font-body); letter-spacing:0.1em; text-transform:uppercase; font-size:0.75rem;">Terminal</small>
                    </div>
                    <nav class="sidebar-nav">
                        <div class="nav-item ${this.currentView === 'feed' ? 'active' : ''}" data-view="feed">
                            Comms Feed
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
                        ${(this.user.role === 'admin' || this.user.username === 'Prime Dynamixx') ? `
                        <div class="nav-item ${this.currentView === 'admin' ? 'active' : ''}" data-view="admin" style="margin-top:1rem; border-top:1px solid var(--border-light); padding-top:1rem;">
                            ⚙️ Admin Panel
                        </div>
                        ` : ''}
                    </nav>
                </aside>
                
                <main class="main-content">
                    <header class="topbar">
                        <div class="user-profile">
                            ${this.user.avatar ? `<img src="${this.user.avatar}" class="user-avatar" style="object-fit:cover; border:none; background:transparent;" onerror="this.onerror=null; this.outerHTML='<div class=\\'user-avatar\\'>${this.user.username.charAt(0).toUpperCase()}</div>';">` : `<div class="user-avatar">${this.user.username.charAt(0).toUpperCase()}</div>`}
                            <div style="line-height:1.2;">
                                <div style="font-weight:600; font-size:0.95rem;">${this.user.username}</div>
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

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.currentView = e.currentTarget.dataset.view;
                this.renderApp();
            });
        });

        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        this.renderCurrentView();
    }

    renderCurrentView() {
        const contentArea = document.getElementById('mainContent');
        if (this.currentView === 'feed') this.renderFeed(contentArea);
        else if (this.currentView === 'search') this.renderSearch(contentArea);
        else if (this.currentView === 'dashboard') this.renderDashboard(contentArea);
        else if (this.currentView === 'leaderboards') this.renderLeaderboards(contentArea);
        else if (this.currentView === 'pulse') this.renderPulse(contentArea);
        else if (this.currentView === 'submission') this.renderSubmission(contentArea);
        else if (this.currentView === 'add_target') this.renderAddTarget(contentArea);
        else if (this.currentView === 'profile') this.renderProfile(contentArea);
        else if (this.currentView === 'admin' && (this.user.role === 'admin' || this.user.username === 'Prime Dynamixx')) this.renderAdmin(contentArea);
    }

    async renderFeed(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Decrypting Global Comms Feed...</div>`;

        let posts = [];
        try {
            const res = await fetch(`${API_URL}/posts`);
            if (res.ok) posts = await res.json();
        } catch (e) {
            console.error("Failed fetching posts", e);
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
                            
                            <div class="segmented-control" style="margin:0; min-width:200px;">
                                <label class="risk-bullish" style="padding:0.5rem;">
                                    <input type="radio" name="sentiment" value="fire" required>
                                    <span style="font-size:1.2rem;">🔥 HOT</span>
                                </label>
                                <label class="risk-bearish" style="padding:0.5rem;">
                                    <input type="radio" name="sentiment" value="ice" required>
                                    <span style="font-size:1.2rem;">🧊 NOT</span>
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
                const badgeColor = isFire ? '#ef4444' : '#3b82f6';
                const badgeGlow = isFire ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                const badgeIcon = isFire ? '🔥' : '🧊';
                const dateStr = new Date(p.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

                let commentsHtml = '';
                if (p.comments && p.comments.length > 0) {
                    commentsHtml = '<div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-light);">';
                    p.comments.forEach(c => {
                        const cDate = new Date(c.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                        commentsHtml += `
                            <div style="margin-bottom: 0.75rem; padding-left: 1rem; border-left: 2px solid var(--border-light);">
                                <div style="display:flex; justify-content:space-between; margin-bottom: 0.25rem;">
                                    <span style="font-weight:700; font-size: 0.9rem; color:${this.user.username === c.author ? 'var(--accent)' : 'var(--text-primary)'};">${c.author}</span>
                                    <span style="font-size:0.7rem; color:var(--text-muted);">${cDate}</span>
                                </div>
                                <div style="font-size:0.9rem; color:var(--text-secondary); white-space:pre-wrap;">${c.content}</div>
                            </div>
                        `;
                    });
                    commentsHtml += '</div>';
                }

                let likes = 0, hearts = 0, lmaos = 0, sads = 0;
                let myReaction = null;
                if (p.reactions) {
                    p.reactions.forEach(r => {
                        if (r.emoji === 'like') likes++;
                        else if (r.emoji === 'heart') hearts++;
                        else if (r.emoji === 'lmao') lmaos++;
                        else if (r.emoji === 'sad') sads++;

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
                    <div style="display:flex; gap:0.5rem; margin-top:1rem; padding-top:0.75rem;">
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="like" style="${rBtnStyle('like')}">👍 ${likes}</button>
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="heart" style="${rBtnStyle('heart')}">❤️ ${hearts}</button>
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="lmao" style="${rBtnStyle('lmao')}">😂 ${lmaos}</button>
                        <button class="reactBtn" data-postid="${p.id}" data-emoji="sad" style="${rBtnStyle('sad')}">😢 ${sads}</button>
                    </div>
                `;

                const replyFormHtml = `
                    <form class="replyForm" data-postid="${p.id}" style="margin-top:1rem; display:flex; gap:0.5rem;">
                        <input type="text" class="replyContent" required placeholder="Write a reply..." style="flex:1; padding:0.5rem 0.75rem; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:0.9rem;">
                        <button type="submit" class="btn" style="padding:0.5rem 1rem; font-size:0.85rem; background:var(--bg-surface); border:1px solid var(--border-light); color:var(--text-secondary);">Reply</button>
                    </form>
                `;

                feedHtml += `
                    <div class="card feed-item animate-stagger" style="margin-bottom:1.5rem; padding:1.5rem; border-left: 4px solid ${badgeColor}; animation-delay: ${index * 0.08}s;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                            <div>
                                <div style="font-weight:800; font-size:1.1rem; color:${this.user.username === p.author ? 'var(--accent)' : 'var(--text-primary)'};">${p.author}</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">${dateStr}</div>
                            </div>
                            <div style="background:${badgeGlow}; color:${badgeColor}; border:1px solid ${badgeColor}; padding:0.25rem 0.75rem; border-radius:1rem; font-weight:800; font-size:0.85rem; box-shadow: 0 0 10px ${badgeGlow}; text-transform:uppercase;">
                                ${badgeIcon} ${p.sentiment}
                            </div>
                        </div>
                        <p style="font-size:1rem; line-height:1.6; color:var(--text-primary); margin-bottom:${p.imagePath ? '1rem' : '0'}; white-space:pre-wrap;">${p.content}</p>
                        ${p.imagePath ? `<img src="${p.imagePath}" style="max-width:100%; border-radius:var(--radius-sm); border:1px solid var(--border); max-height:400px; object-fit:contain; background:var(--bg-surface); display:block;">` : ''}
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
            const imageFile = document.getElementById('postImage').files[0];

            const formData = new FormData();
            formData.append('author', this.user.username);
            formData.append('content', content);
            formData.append('sentiment', sentiment);
            if (imageFile) formData.append('image', imageFile);

            try {
                const btn = e.target.querySelector('button');
                btn.disabled = true;
                btn.innerText = "Transmitting...";

                const res = await fetch(`${API_URL}/posts`, { method: 'POST', body: formData });
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

                    const res = await fetch(`${API_URL}/posts/${postId}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ author: this.user.username, content })
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

        // Emoji Reaction Handlers
        document.querySelectorAll('.reactBtn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const postId = btn.dataset.postid;
                const emoji = btn.dataset.emoji;
                try {
                    btn.style.opacity = '0.5';
                    const res = await fetch(`${API_URL}/posts/${postId}/react`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ author: this.user.username, emoji })
                    });
                    if (!res.ok) throw new Error("Reaction failed.");
                    this.renderFeed(container); // Refresh to grab updated arrays
                } catch (err) {
                    console.error(err);
                    btn.style.opacity = '1';
                }
            });
        });
    }


    renderSearch(container) {
        const uniqueBrands = [...new Set(MOCK_FIGURES.map(f => f.brand))].sort();

        container.innerHTML = `
            <div class="search-container animate-mount">
                <div style="margin-bottom:2rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <h2 style="font-size:2.5rem; margin-bottom:0.5rem;">Acquire Target</h2>
                        <p style="color:var(--text-secondary); font-size:1.1rem;">Search central database to initiate Trade Value Assessment.</p>
                    </div>
                    <button class="btn" style="padding: 0.75rem 1.5rem;" onclick="app.currentView='add_target'; app.renderApp();">+ Add New Target</button>
                </div>
                
                <div class="search-bar">
                    <input type="text" id="searchInput" placeholder="Search by name, brand, or line (e.g. FT-55, Optimus, XTB)...">
                    <button class="btn" style="width: auto; padding: 0 2rem;" id="searchBtn">SEARCH</button>
                </div>
                
                <div class="search-filters" style="margin-bottom:1.5rem; display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
                    <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.25rem;">Brands:</span>
                    <span class="badge brandFilter" data-brand="" style="border-color:var(--accent); color:var(--accent); font-weight:700; cursor:pointer;">ALL</span>
                    ${uniqueBrands.map(b => `<span class="badge brandFilter" data-brand="${b}" style="cursor:pointer;">${b}</span>`).join('')}
                </div>
                
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

            const results = MOCK_FIGURES.filter(f =>
                f.name.toLowerCase().includes(query) ||
                f.brand.toLowerCase().includes(query) ||
                f.line.toLowerCase().includes(query) ||
                (expanded && f.brand.toLowerCase().includes(expanded))
            );

            const resultsHTML = results.map((f, index) => `
                <div class="card target-card animate-stagger" style="animation-delay: ${index * 0.05}s;" onclick="app.selectTarget(${f.id})">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.5rem;">
                        <div style="color:var(--text-muted); font-size: 0.8rem; text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">${f.brand} &bull; ${f.line}</div>
                        <span class="tier-badge ${f.classTie.toLowerCase()}">${f.classTie}</span>
                    </div>
                    <h3 style="margin-bottom: 1.5rem; font-size: 1.25rem;">${f.name}</h3>
                    <div style="display:flex; justify-content:flex-end; align-items:center; border-top:1px solid var(--border-light); padding-top:1rem;">
                        <span style="color:var(--accent); font-weight:700; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em;">Assess Target &rarr;</span>
                    </div>
                </div>
            `).join('');

            document.getElementById('searchResults').innerHTML = results.length ? resultsHTML : '<div class="card" style="grid-column: span 2; text-align:center; padding:3rem;"><p style="color:var(--text-muted); font-size:1.1rem;">No targets matching criteria.</p></div>';
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
                document.getElementById('searchInput').value = tab.dataset.brand;
                doSearch();
            });
        });

        setTimeout(doSearch, 50);
    }



    renderAddTarget(container) {
        container.innerHTML = `
    < div style = "max-width: 600px; margin: 0 auto; padding-bottom: 3rem;" class="animate-mount" >
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
            </div >
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
            const req = await fetch(`${API_URL}/figures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (req.ok) {
                alert(`${data.name} has been successfully added to the catalog.`);
                await this.loadFigures(); // refresh the global array
                this.currentView = 'search';
                this.renderApp();
            } else {
                alert("Failed to create target. Check console.");
            }
        } catch (e) {
            console.error(e);
            alert("Connection error adding target.");
        }
    }

    selectTarget(id) {
        this.currentTarget = MOCK_FIGURES.find(f => f.id === id);
        this.currentView = 'pulse';
        this.renderApp();
    }

    async renderPulse(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Initiating secure scan on the Market Pulse...</div>`;

        let figureSubs = [];
        let overviewStats = {};
        let indexes = [];
        let headlines = [];
        try {
            const res = await fetch(`${API_URL}/submissions/target/${this.currentTarget.id}`);
            if (res.ok) figureSubs = await res.json();
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
                <div style="display:flex; align-items:center; gap:1rem; margin-bottom: 2rem;">
                    <button class="btn-outline" onclick="app.currentView='search'; app.renderApp();">&larr; Back to Search</button>
                    <div>
                        <h2 style="margin:0; font-size:2rem;">Market Pulse Analysis</h2>
                        <div style="color:var(--text-secondary); font-size:0.95rem; text-transform:uppercase; letter-spacing:0.05em; margin-top:0.25rem;">Target: ${this.currentTarget.brand} ${this.currentTarget.name}</div>
                    </div>
                </div>

                ${isGuestimate ? `
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); padding: 1rem 1.5rem; border-radius: var(--radius-sm); margin-bottom: 2rem; color: var(--text-primary);">
                        <strong style="color: var(--danger);">⚠️ Anti-Hype Notice:</strong> Insufficient community data. Displaying TVI Anchored Guestimate based on class tier (${this.currentTarget.classTie}).
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

                ${!isGuestimate && figureSubs.length > 0 ? `
                <div class="card" style="margin-bottom: 2.5rem; padding: 2rem;">
                    <h3 style="margin-bottom: 1rem;">Community Projections Trend</h3>
                    <div style="height: 250px; width: 100%;">
                        <canvas id="projectionsChart"></canvas>
                    </div>
                    <div id="imageGallery" style="margin-top:2rem; display:flex; justify-content:center; flex-wrap:wrap; gap:1rem; padding-bottom:1rem;"></div>
                </div>
                ` : ''}

                <div style="text-align: center; border-top: 1px solid var(--border-light); padding-top: 3rem;">
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
                                <div style="font-size:1.1rem; font-weight:700; margin-top:0.25rem;">${overviewStats.topFigure.name}</div>
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
                                        <div style="font-weight:700; font-size:0.95rem;">${idx.brand}</div>
                                        <div style="font-size:0.8rem; color:var(--text-muted);">${idx.line} • ${idx.targets} target${idx.targets !== 1 ? 's' : ''}</div>
                                    </div>
                                    <div style="text-align:right;">
                                        <span style="font-size:1.25rem; font-weight:800; color:${gradeColor};">${grade ? idx.avgGrade : '—'}</span>
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
                                        <div style="font-size:0.95rem; font-weight:500; line-height:1.4;">${h.headline}</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.35rem;">${h.brand} • ${h.classTie} • ${timeAgo}</div>
                                    </div>
                                    <div style="font-size:1.25rem; font-weight:800; color:${gradeColor}; white-space:nowrap;">${h.grade.toFixed(1)}</div>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        setTimeout(() => {
            if (!isGuestimate && figureSubs.length > 0) {
                const sortedSubs = [...figureSubs].sort((a, b) => new Date(a.date) - new Date(b.date));
                const labels = sortedSubs.map(s => new Date(s.date).toLocaleDateString());
                const gradePoints = sortedSubs.map(s => ((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1));
                const pricePoints = sortedSubs.map(s => s.data && s.data.market_price ? parseFloat(s.data.market_price) : null);

                const ctx = document.getElementById('projectionsChart');
                if (ctx) {
                    new Chart(ctx.getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [
                                {
                                    label: 'Overall Target Grade',
                                    data: gradePoints,
                                    borderColor: '#ff0f39',
                                    backgroundColor: 'rgba(255, 15, 57, 0.1)',
                                    tension: 0.3,
                                    fill: true,
                                    yAxisID: 'y'
                                },
                                {
                                    label: 'Aftermarket Price (USD)',
                                    data: pricePoints,
                                    borderColor: '#10b981', // Neon green for monetary value
                                    backgroundColor: 'transparent',
                                    borderDash: [5, 5],
                                    tension: 0.3,
                                    yAxisID: 'y1',
                                    spanGaps: true // Connects the line over null data points
                                }
                            ]
                        },
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
                                    grid: { drawOnChartArea: false } // Prevent gridlines from overlapping
                                }
                            }
                        }
                    });
                }

                let galleryHtml = '';
                sortedSubs.forEach(s => {
                    if (s.data && s.data.imagePath) {
                        galleryHtml += `<img src="${s.data.imagePath}" style="width:auto; height:180px; object-fit:contain; background:var(--bg-panel); border-radius:8px; border:1px solid var(--border); box-shadow: 0 4px 6px var(--accent-glow);" title="${s.author}'s Evidence">`;
                    }
                });
                if (galleryHtml) {
                    document.getElementById('imageGallery').innerHTML = galleryHtml;
                }
            }
        }, 100);
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

    createRiskSelector(id, label) {
        return `
            <div class="form-group">
                <label class="form-label">${label}</label>
                <div class="segmented-control">
                    <label class="risk-bullish"><input type="radio" name="${id}" value="bullish"><span>Bullish</span></label>
                    <label class="risk-neutral"><input type="radio" name="${id}" value="neutral" checked><span>Neutral</span></label>
                    <label class="risk-bearish"><input type="radio" name="${id}" value="bearish"><span>Bearish</span></label>
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
        container.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding-bottom: 3rem;">
                <div style="display:flex; align-items:center; gap:1rem; margin-bottom: 2rem;">
                    <button class="btn-outline" onclick="app.currentView='pulse'; app.renderApp();">&larr; Back</button>
                    <div>
                        <h2 style="margin:0; font-size:2rem;">Intelligence Submission</h2>
                        <div style="color:var(--accent); font-weight:700; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; margin-top:0.25rem;">Target: ${this.currentTarget.name}</div>
                    </div>
                </div>

                <form id="submissionForm">
                    <!-- SECTION 1: DATA TOYZ TRADING SCORE -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>1. Data Toyz Trading Score (DTS)</h3>
                            <p>Rate the following 5 Pillars (0-20 points each).</p>
                        </div>
                        <div class="grid-2">
                            ${this.createSlider('mts_community', 'Community Demand', 0, 20, 10, 'Hype & Desirability')}
                            ${this.createSlider('mts_buzz', 'Buzz Momentum', 0, 20, 10, 'Current Social Momentum')}
                            ${this.createSlider('mts_liquidity', 'Trade Liquidity', 0, 20, 10, 'Ease of moving the item')}
                            ${this.createSlider('mts_risk', 'Replaceability Risk', 0, 20, 10, 'Likelihood of alternative release')}
                            ${this.createSlider('mts_appeal', 'Cross-Faction Appeal', 0, 20, 10, 'Broader collector interest')}
                        </div>
                    </div>

                    <!-- SECTION 2: 4-AXIS FORECASTING -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>2. Risk Forecasting</h3>
                            <p>Assign risk bias and timeframe.</p>
                        </div>
                        
                        <div style="margin-bottom:1.5rem;">
                            <label class="form-label">Forecast Horizon</label>
                            <div class="segmented-control">
                                <label><input type="radio" name="timeframe" value="short" checked><span>Short (0-6m)</span></label>
                                <label><input type="radio" name="timeframe" value="mid"><span>Mid (6-18m)</span></label>
                                <label><input type="radio" name="timeframe" value="long"><span>Long (18-36m)</span></label>
                            </div>
                        </div>

                        <div class="grid-2">
                            ${this.createRiskSelector('risk_character', 'Character Demand')}
                            ${this.createRiskSelector('risk_engineering', 'Engineering Relevance')}
                            ${this.createRiskSelector('risk_ecosystem', 'Ecosystem Dependency')}
                            ${this.createRiskSelector('risk_redeco', 'Redeco Risk')}
                        </div>
                    </div>

                    <!-- SECTION 3: PHYSICAL QUALITY SCALES -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>3. Physical Quality Metrics</h3>
                            <p>Rate the in-hand objective quality (0.0 to 10.0).</p>
                        </div>
                        <div class="grid-2">
                            ${this.createSlider('pq_build', 'Build Quality', 0, 10, 5.0, '', 0.1)}
                            ${this.createSlider('pq_paint', 'Paint Application', 0, 10, 5.0, '', 0.1)}
                            ${this.createSlider('pq_articulation', 'Articulation/Function', 0, 10, 5.0, '', 0.1)}
                            ${this.createSlider('pq_accuracy', 'Design Accuracy', 0, 10, 5.0, '', 0.1)}
                            ${this.createSlider('pq_presence', 'Display Presence', 0, 10, 5.0, '', 0.1)}
                            ${this.createSlider('pq_value', 'Price/Value Ratio', 0, 10, 5.0, '', 0.1)}
                            ${this.createSlider('pq_packaging', 'Packaging/Extras', 0, 10, 5.0, '', 0.1)}
                        </div>
                        
                        <div style="margin-top:2rem; padding-top:2rem; border-top:1px solid var(--border-light);">
                            <h4 style="margin-bottom:1.5rem; color:var(--accent); font-size:1.2rem;">Transformation Analysis</h4>
                            
                            <div class="form-group" style="margin-bottom:2rem;">
                                <label class="form-label" style="font-size:1rem;">Transformation Frustration Scale (1.0 - 10.0)</label>
                                <input type="range" id="trans_frustration" name="trans_frustration" min="1.0" max="10.0" step="0.1" value="5.5" oninput="this.nextElementSibling.querySelector('span').innerText = parseFloat(this.value).toFixed(1); app.updateFrustrationLabel(this.value)">
                                <div style="display:flex; justify-content:space-between; margin-top:0.5rem;">
                                    <span style="font-weight:700; color:var(--accent);"><span>5.5</span> / 10</span>
                                    <span id="label_trans_frustration" style="color:var(--text-secondary); font-style:italic;">🤷 "Meh." — Average, forgettable.</span>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label" style="font-size:1rem;">After-Transformation Satisfaction Scale (1.0 - 10.0)</label>
                                <input type="range" id="trans_satisfaction" name="trans_satisfaction" min="1.0" max="10.0" step="0.1" value="5.5" oninput="this.nextElementSibling.querySelector('span').innerText = parseFloat(this.value).toFixed(1); app.updateSatisfactionLabel(this.value)">
                                <div style="display:flex; justify-content:space-between; margin-top:0.5rem;">
                                    <span style="font-weight:700; color:var(--accent);"><span>5.5</span> / 10</span>
                                    <span id="label_trans_satisfaction" style="color:var(--text-secondary); font-style:italic;">🤷 "Looks fine." — Average display payoff.</span>
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
                            <textarea id="analyst_notes" name="analyst_notes" rows="4" placeholder="Detail engineering quirks, market context, or specific observations..."></textarea>
                        </div>
                    </div>

                    <!-- SECTION 5: AFTERMARKET VALUATION -->
                    <div class="card form-section">
                        <div class="section-header">
                            <h3>5. Aftermarket Valuation</h3>
                            <p>What is the current true street value?</p>
                        </div>
                        <div class="form-group" style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:1.5rem; color:var(--text-secondary);">$</span>
                            <input type="number" name="market_price" step="0.01" min="0" required placeholder="120.00" style="width:100%; max-width:200px; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-size:1.25rem;">
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
                                <input type="radio" name="recommendation" value="yes" required>
                                <span>YES</span>
                            </label>
                            <label class="risk-bearish">
                                <input type="radio" name="recommendation" value="no" required>
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
                        <input type="hidden" id="tradeRating" name="tradeRating" value="0">
                        <div style="display:flex; justify-content:center; gap:0.5rem; margin-top:1rem;">
                            ${[1, 2, 3, 4, 5].map(n => `
                                <button type="button" class="starBtn" data-val="${n}" style="background:none; border:none; cursor:pointer; font-size:2.5rem; color:var(--border-light); transition:all 0.2s; padding:0.25rem;" onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'">
                                    ★
                                </button>
                            `).join('')}
                        </div>
                        <div id="tradeRatingLabel" style="text-align:center; margin-top:0.75rem; font-size:0.95rem; color:var(--text-muted); font-style:italic;">Select a rating</div>
                    </div>
                    
                    <button type="submit" class="btn" style="width:100%; padding:1.25rem; font-size:1.2rem; margin-top:1rem;">Commit Intelligence Report</button>
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
    }

    async submitIntel(form) {
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
        formPayload.append('date', new Date().toISOString());
        formPayload.append('author', this.user.username);
        formPayload.append('mtsTotal', mtsTotal.toString());
        formPayload.append('approvalScore', approvalScore.toString());

        data.overallGrade = overallGrade;
        formPayload.append('data', JSON.stringify(data));

        const imageFile = document.getElementById('image_upload').files[0];
        if (imageFile) {
            formPayload.append('image', imageFile);
        }

        try {
            const req = await fetch(`${API_URL}/submissions`, {
                method: 'POST',
                body: formPayload
            });
            if (req.ok) {
                alert(`Intelligence on ${this.currentTarget.name} securely cataloged to Market Pulse.\nOverall Target Grade: ${overallGrade}/100`);
                this.currentView = 'pulse';
                this.renderApp();
            }
        } catch (e) {
            alert("Connection error executing scan.");
        }
    }


    async renderDashboard(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Decrypting intelligence log from secure database...</div>`;

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
                        <td style="color:var(--text-secondary); font-size:0.9rem;">${d}</td>
                        <td style="font-weight:600;">
                            <span class="tier-badge ${tier.toLowerCase()}" style="margin-right:0.5rem; font-size:0.6rem;">${tier}</span>
                            <span style="cursor:pointer; text-decoration:underline; text-decoration-color:var(--border-light); text-underline-offset:4px; transition:color 0.2s;" onclick="app.selectTarget(${s.targetId})" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color=''">
                                ${s.targetName}
                            </span>
                        </td>
                        <td><span style="color:var(--accent); font-weight:700;">${((parseFloat(s.mtsTotal) + parseFloat(s.approvalScore)) / 2).toFixed(1)}</span></td>
                        <td style="text-align: right;">
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
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Accessing Global Intelligence Network...</div>`;

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
                        <td style="font-weight: 800; font-size: 1.1rem; color: ${this.user.username === authorName ? 'var(--accent)' : 'var(--text-primary)'};">${authorName} ${this.user.username === authorName ? '<span style="font-weight:400; font-size:0.75rem; color:var(--text-muted);">(You)</span>' : ''}</td>
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
                
                <div class="card" style="padding: 2.5rem;">
                    <form id="profileForm">
                        <div class="form-group" style="margin-bottom:1.5rem;">
                            <label class="form-label">Profile Avatar</label>
                            <div style="display:flex; align-items:center; gap:1rem;">
                                ${this.user.avatar ? `<img src="${this.user.avatar}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid var(--border);" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:50px; height:50px; border-radius:50%; background:var(--bg-surface); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-weight:700;\\'>${this.user.username.charAt(0).toUpperCase()}</div>';">` : `<div style="width:50px; height:50px; border-radius:50%; background:var(--bg-surface); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-weight:700;">${this.user.username.charAt(0).toUpperCase()}</div>`}
                                <input type="file" id="profAvatar" accept="image/*" style="flex:1; padding:0.5rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Active Username</label>
                            <input type="text" id="profUsername" value="${this.user.username}" required style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Secure Email Address</label>
                            <input type="email" id="profEmail" value="${this.user.email || ''}" required style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <div class="form-group" style="margin-bottom: 2rem;">
                            <label class="form-label">New Passcode (Leave blank to keep current)</label>
                            <input type="password" id="profPassword" placeholder="••••••••" style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </div>
                        <button type="submit" class="btn" style="width:100%; padding:1rem; font-size:1.1rem;">Encrypt & Update Profile</button>
                    </form>
                </div>
            </div>
        `;

        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('profUsername').value.trim();
            const email = document.getElementById('profEmail').value.trim();
            const password = document.getElementById('profPassword').value;
            const avatarFile = document.getElementById('profAvatar').files[0];

            const formData = new FormData();
            formData.append('username', username);
            formData.append('email', email);
            formData.append('oldUsername', this.user.username);
            if (password) formData.append('password', password);
            if (avatarFile) formData.append('avatar', avatarFile);

            try {
                const btn = e.target.querySelector('button');
                btn.disabled = true;
                btn.innerText = "Encrypting...";

                const res = await fetch(`${API_URL}/users/${this.user.id}`, {
                    method: 'PUT',
                    body: formData
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to update profile.');

                alert(data.message);
                this.user = data;
                localStorage.setItem('terminal_user', JSON.stringify(this.user));
                this.init(); // Refresh navbar
            } catch (err) {
                alert(err.message);
            }
        });
    }

    // --- ADMIN PANEL --- //
    async renderAdmin(container) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-secondary);">Loading Admin Panel...</div>`;

        const headers = { 'x-admin-user': this.user.username };
        let analytics = {}, users = [], figures = [];

        try {
            const [aRes, uRes, fRes] = await Promise.all([
                fetch(`${API_URL}/admin/analytics`, { headers }),
                fetch(`${API_URL}/admin/users`, { headers }),
                fetch(`${API_URL}/figures`)
            ]);
            if (aRes.ok) analytics = await aRes.json();
            if (uRes.ok) users = await uRes.json();
            if (fRes.ok) figures = await fRes.json();
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
                                    <div style="font-weight:600;">${a.author}</div>
                                    <div style="font-size:0.8rem; color:var(--text-muted);">${a.subs} report${a.subs != 1 ? 's' : ''}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
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
                                <th style="padding:0.75rem 1rem; color:var(--text-muted); font-weight:600; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${figures.map(f => `
                                <tr style="border-top:1px solid var(--border-light);" id="figRow-${f.id}">
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted);">${f.id}</td>
                                    <td style="padding:0.6rem 1rem; font-weight:600;">${f.name}</td>
                                    <td style="padding:0.6rem 1rem;">${f.brand}</td>
                                    <td style="padding:0.6rem 1rem;"><span class="tier-badge ${f.classTie.toLowerCase()}" style="font-size:0.7rem;">${f.classTie}</span></td>
                                    <td style="padding:0.6rem 1rem; color:var(--text-muted);">${f.line}</td>
                                    <td style="padding:0.6rem 1rem; text-align:right; white-space:nowrap;">
                                        <button class="editFigBtn" data-id="${f.id}" data-name="${f.name}" data-brand="${f.brand}" data-class="${f.classTie}" data-line="${f.line}" style="background:none; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">✏️ Edit</button>
                                        <button class="delFigBtn" data-id="${f.id}" data-name="${f.name}" style="background:none; border:1px solid var(--danger); color:var(--danger); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">🗑️ Delete</button>
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
                                        <td style="padding:0.6rem 1rem; font-weight:600;">${u.username} ${isAdmin ? '<span style="color:#fbbf24; font-size:0.75rem;">★ ADMIN</span>' : ''}</td>
                                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${u.email}</td>
                                        <td style="padding:0.6rem 1rem;"><span style="color:${isAdmin ? '#fbbf24' : 'var(--accent)'}; font-size:0.8rem; font-weight:600; text-transform:uppercase;">${u.role || 'analyst'}</span></td>
                                        <td style="padding:0.6rem 1rem;"><span style="color:${isSuspended ? 'var(--danger)' : 'var(--success)'}; font-size:0.8rem; font-weight:600;">${isSuspended ? '⛔ SUSPENDED' : '✅ ACTIVE'}</span></td>
                                        <td style="padding:0.6rem 1rem; color:var(--text-muted); font-size:0.85rem;">${joined}</td>
                                        <td style="padding:0.6rem 1rem; text-align:right; white-space:nowrap;">
                                            ${u.username !== 'Prime Dynamixx' ? `
                                                <button class="roleBtn" data-id="${u.id}" data-role="${u.role}" style="background:none; border:1px solid ${isAdmin ? 'var(--text-muted)' : '#fbbf24'}; color:${isAdmin ? 'var(--text-muted)' : '#fbbf24'}; cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">${isAdmin ? 'Demote' : 'Promote'}</button>
                                                <button class="suspendBtn" data-id="${u.id}" data-name="${u.username}" style="background:none; border:1px solid ${isSuspended ? 'var(--success)' : 'var(--danger)'}; color:${isSuspended ? 'var(--success)' : 'var(--danger)'}; cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-right:0.25rem;">${isSuspended ? '✅ Reinstate' : '⚠️ Suspend'}</button>
                                                <button class="delUserBtn" data-id="${u.id}" data-name="${u.username}" style="background:none; border:1px solid var(--danger); color:var(--danger); cursor:pointer; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.8rem;">🗑️ Delete</button>
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

        // Wire up admin action handlers
        const adminHeaders = { 'x-admin-user': this.user.username, 'Content-Type': 'application/json' };

        // Add User
        document.getElementById('addAdminUserBtn').addEventListener('click', async () => {
            const username = prompt("Enter new username:");
            if (!username) return;
            const password = prompt("Enter new passcode:");
            if (!password) return;
            // Fake email generation for manual admin adds
            const email = username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@datatoyz.net';
            const role = confirm("Should this user be an Admin? (OK for Admin, Cancel for Analyst)") ? 'admin' : 'analyst';

            const res = await fetch(`${API_URL}/admin/users`, {
                method: 'POST', headers: adminHeaders,
                body: JSON.stringify({ username, email, password, role })
            });
            if (res.ok) { this.renderAdmin(container); }
            else { const err = await res.json(); alert(err.error); }
        });

        // Toggle User Role
        document.querySelectorAll('.roleBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const isPromoting = btn.dataset.role !== 'admin';
                if (!confirm(`Are you sure you want to ${isPromoting ? 'PROMOTE' : 'DEMOTE'} this user?`)) return;
                const res = await fetch(`${API_URL}/admin/users/${btn.dataset.id}/role`, { method: 'PUT', headers: adminHeaders });
                if (res.ok) { this.renderAdmin(container); }
                else { const err = await res.json(); alert(err.error); }
            });
        });

        // Delete figure
        document.querySelectorAll('.delFigBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Delete "${btn.dataset.name}" and ALL associated intel? This cannot be undone.`)) return;
                const res = await fetch(`${API_URL}/admin/figures/${btn.dataset.id}`, { method: 'DELETE', headers: adminHeaders });
                if (res.ok) {
                    MOCK_FIGURES = MOCK_FIGURES.filter(f => f.id != btn.dataset.id);
                    this.renderAdmin(container);
                } else {
                    const err = await res.json();
                    alert(err.error);
                }
            });
        });

        // Edit figure
        document.querySelectorAll('.editFigBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const newName = prompt('Figure Name:', btn.dataset.name);
                if (!newName) return;
                const newBrand = prompt('Brand:', btn.dataset.brand);
                if (!newBrand) return;
                const newClass = prompt('Class Tier:', btn.dataset.class);
                if (!newClass) return;
                const newLine = prompt('Product Line:', btn.dataset.line);
                if (!newLine) return;

                fetch(`${API_URL}/admin/figures/${btn.dataset.id}`, {
                    method: 'PUT', headers: adminHeaders,
                    body: JSON.stringify({ name: newName, brand: newBrand, classTie: newClass, line: newLine })
                }).then(res => {
                    if (res.ok) {
                        const fig = MOCK_FIGURES.find(f => f.id == btn.dataset.id);
                        if (fig) { fig.name = newName; fig.brand = newBrand; fig.classTie = newClass; fig.line = newLine; }
                        this.renderAdmin(container);
                    }
                });
            });
        });

        // Suspend user
        document.querySelectorAll('.suspendBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const res = await fetch(`${API_URL}/admin/users/${btn.dataset.id}/suspend`, { method: 'PUT', headers: adminHeaders });
                if (res.ok) { this.renderAdmin(container); }
                else { const err = await res.json(); alert(err.error); }
            });
        });

        // Delete user
        document.querySelectorAll('.delUserBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Permanently delete user "${btn.dataset.name}"? This cannot be undone.`)) return;
                const res = await fetch(`${API_URL}/admin/users/${btn.dataset.id}`, { method: 'DELETE', headers: adminHeaders });
                if (res.ok) { this.renderAdmin(container); }
                else { const err = await res.json(); alert(err.error); }
            });
        });
    }

    async deleteSubmission(id) {
        if (!confirm("Are you sure you want to retract this intel from the Market Pulse?")) return;
        try {
            const res = await fetch(`${API_URL}/submissions/${id}`, { method: 'DELETE' });
            if (res.ok) { this.renderApp(); }
        } catch (e) {
            console.error(e);
        }
    }

    logout() {
        this.user = null;
        localStorage.removeItem('terminal_user');
        sessionStorage.removeItem('terminalView');
        sessionStorage.removeItem('terminalTarget');
        this.renderLogin();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new TerminalApp();
});
