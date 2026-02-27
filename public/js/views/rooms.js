// views/rooms.js — Breakout Rooms, chat, DMs

TerminalApp.prototype.renderRoomsList = async function(container) {
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
                    const preview = lastMsg ? `${escapeHTML(lastMsg.author === self ? 'You' : lastMsg.author)}: ${escapeHTML(lastMsg.content) || '\u{1F4F8} Image'}` : 'No messages yet';
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

    // Room card click -> open chat
    container.querySelectorAll('.room-card').forEach(card => {
        card.addEventListener('click', () => {
            sessionStorage.setItem('activeRoomId', card.dataset.roomId);
            this.currentView = 'room_chat';
            this.renderCurrentView();
        });
    });

    // New Room button
    document.getElementById('newRoomBtn').addEventListener('click', () => this.showNewRoomModal());
};

TerminalApp.prototype.showNewRoomModal = function() {
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
};

TerminalApp.prototype._renderSelectedMembers = function(members) {
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
};

TerminalApp.prototype.renderRoomChat = async function(container) {
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
                    <button id="roomMembersBtn" style="background:none; border:1px solid var(--border-light); color:var(--text-secondary); cursor:pointer; padding:0.4rem 0.8rem; border-radius:var(--radius-sm); font-size:0.85rem;">\u{1F465} Members</button>
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
                    <label for="chatImageInput" style="cursor:pointer; padding:0.6rem; border:1px solid var(--border-light); border-radius:50%; font-size:1.1rem; transition:all 0.2s; flex-shrink:0;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-light)'">\u{1F4F8}</label>
                    <input type="file" id="chatImageInput" accept="image/*" style="display:none;">
                    <textarea id="chatInput" placeholder="Transmit message..." rows="1" style="flex:1; resize:none; min-height:44px; max-height:120px; padding:0.75rem 1rem; font-size:0.95rem; border-radius:22px; background:var(--bg-surface); border:1px solid var(--border-light); color:var(--text-primary); font-family:var(--font-body);"></textarea>
                    <button id="chatSendBtn" class="btn" style="padding:0.6rem 1.25rem; border-radius:22px; flex-shrink:0;">Send \u27A4</button>
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
            btn.textContent = 'Send \u27A4';
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
};

TerminalApp.prototype._renderMessage = function(m, self) {
    const isOwn = m.author === self;
    const initial = escapeHTML(m.author).charAt(0).toUpperCase();
    const emojis = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F622}', '\u{1F610}'];
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
};

TerminalApp.prototype._appendMessage = function(msg, self) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    // Remove empty state if present
    const emptyState = chatMessages.querySelector('[style*="text-align:center"]');
    if (emptyState && chatMessages.children.length === 1) emptyState.remove();

    const div = document.createElement('div');
    div.innerHTML = this._renderMessage(msg, self);
    chatMessages.appendChild(div.firstElementChild);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

TerminalApp.prototype._pollRoomMessages = async function(roomId, self) {
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
};

TerminalApp.prototype._showMembersPanel = function(room, iAmOwner) {
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
                            ${m.role === 'owner' ? '<span style="font-size:0.7rem; color:#fbbf24; margin-left:0.5rem;">\u2605 COMMANDER</span>' : ''}
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
};

TerminalApp.prototype.startDM = async function(username) {
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
};
