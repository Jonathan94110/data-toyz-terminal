// views/feed.js — Community Feed
// Optimized: pagination (20 posts per page), lazy image loading, event delegation

TerminalApp.prototype.renderFeed = async function (container) {
    container.innerHTML = `<div style="padding:3rem;">${this.skeletonHTML('feed', 3)}</div>`;

    // Track pagination state on the instance
    this._feedOffset = 0;
    this._feedTotal = 0;
    this._feedContainer = container;

    let posts = [];
    try {
        const res = await this.authFetch(`${API_URL}/posts?limit=20&offset=0`);
        if (res.ok) {
            const data = await res.json();
            // Support both new {posts,total} format and legacy array format
            posts = Array.isArray(data) ? data : (Array.isArray(data.posts) ? data.posts : []);
            this._feedTotal = (typeof data.total === 'number') ? data.total : posts.length;
            this._feedOffset = posts.length;
        }
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
            <div style="margin-bottom:1rem;">
                <h2 style="font-size:2rem; margin-bottom:0.25rem; text-transform:uppercase; letter-spacing:0.03em;">Community Feed <a onclick="app.currentView='docs'; app.renderApp(); setTimeout(()=>{const el=document.getElementById('doc-community-feed');if(el)el.scrollIntoView({behavior:'smooth'});},200);" style="cursor:pointer; font-size:1rem; color:var(--text-muted); vertical-align:middle; margin-left:0.25rem;" title="View documentation">\u{1F4D6}</a></h2>
                <p style="color:var(--text-secondary); font-size:0.9rem;">Live operative intelligence chatter and market sentiment.</p>
            </div>

            <!-- NEW POST FORM -->
            <div class="card" style="margin-bottom:1.5rem; padding:1.25rem;">
                <form id="postForm">
                    <textarea id="postContent" required placeholder="Broadcast your observations..." style="width:100%; height:56px; padding:0.75rem 1rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); margin-bottom:0.75rem; font-family:var(--font-body); resize:vertical; font-size:0.9rem;"></textarea>

                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.75rem;">
                        <div>
                            <label for="postImage" style="cursor:pointer; padding:0.4rem 0.75rem; border:1px solid var(--border-light); border-radius:var(--radius-sm); font-size:0.8rem; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-light)'">
                                \u{1F4F8} Attach
                            </label>
                            <input type="file" id="postImage" accept="image/*" style="display:none;" onchange="document.getElementById('imgName').innerText = this.files[0] ? this.files[0].name : ''">
                            <span id="imgName" style="margin-left:0.5rem; font-size:0.75rem; color:var(--accent);"></span>
                        </div>

                        <div class="segmented-control" style="margin:0; min-width:280px;">
                            <label class="risk-bullish" style="padding:0.4rem;">
                                <input type="radio" name="sentiment" value="fire" required>
                                <span style="font-size:0.9rem; white-space:nowrap;">\ud83d\udd25 HOT</span>
                            </label>
                            <label class="risk-neutral" style="padding:0.4rem;">
                                <input type="radio" name="sentiment" value="fence" required>
                                <span style="font-size:0.9rem; white-space:nowrap;">\ud83e\udd37 FENCE</span>
                            </label>
                            <label class="risk-bearish" style="padding:0.4rem;">
                                <input type="radio" name="sentiment" value="ice" required>
                                <span style="font-size:0.9rem; white-space:nowrap;">\ud83e\uddca NOT</span>
                            </label>
                        </div>
                    </div>

                    <button type="submit" class="btn" style="width:100%; padding:0.65rem;">Submit</button>
                </form>
            </div>

            <!-- TIMELINE FEED -->
            <div id="timeline">
    `;

    if (posts.length === 0) {
        feedHtml += `<div style="text-align:center; color:var(--text-muted); padding:2rem;" class="animate-mount">No broadcasts detected on the secure network.</div>`;
    } else {
        posts.forEach((p, index) => {
            feedHtml += this._buildPostCard(p, index, sharedPostId);
        });
    }

    // Load More button (hidden if all posts already loaded)
    const hasMore = this._feedOffset < this._feedTotal;
    feedHtml += `
            </div>
            <div id="feedLoadMore" style="text-align:center; padding:1.5rem 0;${hasMore ? '' : ' display:none;'}">
                <button id="loadMoreBtn" class="btn" style="padding:0.65rem 2rem; background:var(--bg-surface); border:1px solid var(--border-light); color:var(--text-secondary);">
                    Load More (${this._feedTotal - this._feedOffset} remaining)
                </button>
            </div>
        </div>
    `;

    container.innerHTML = feedHtml;

    // Clean up any autocomplete dropdowns from previous renders
    document.querySelectorAll('.figure-autocomplete').forEach(el => el.remove());
    // Auto-bracket + autocomplete helper for figure linking (@[Figure Name])
    setupFigureLinkHelper(document.getElementById('postContent'));
    document.querySelectorAll('.replyContent').forEach(el => setupFigureLinkHelper(el));

    // --- EVENT DELEGATION on #timeline ---
    // Single listeners instead of per-post loops for reactions, replies, edit, delete, flag, share
    const timeline = document.getElementById('timeline');
    this._setupFeedDelegation(timeline, container);

    // Post form submit
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
            e.target.querySelector('button').innerText = "Submit";
        }
    });

    // Load More handler
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => this._loadMorePosts());
    }
};

// Build a single post card HTML string
TerminalApp.prototype._buildPostCard = function (p, index, sharedPostId) {
    const isFire = p.sentiment === 'fire';
    const isFence = p.sentiment === 'fence';
    const badgeColor = isFire ? '#ef4444' : isFence ? '#f59e0b' : '#3b82f6';
    const badgeGlow = isFire ? 'rgba(239, 68, 68, 0.2)' : isFence ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)';
    const badgeIcon = isFire ? '\ud83d\udd25' : isFence ? '\ud83e\udd37' : '\ud83e\uddca';
    const dateStr = new Date(p.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

    let commentsHtml = '';
    if (p.comments && p.comments.length > 0) {
        commentsHtml = '<div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-light);">';
        p.comments.forEach(c => {
            const cDate = new Date(c.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
            const isMyComment = this.user.username === c.author;
            const isAdmin = ['owner', 'admin', 'moderator'].includes(this.user.role);
            commentsHtml += `
                <div class="comment-item" data-commentid="${c.id}" data-postid="${p.id}" style="margin-bottom: 0.75rem; padding-left: 1rem; border-left: 2px solid var(--border-light);">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 0.25rem;">
                        <span style="font-weight:700; font-size: 0.9rem; color:${isMyComment ? 'var(--accent)' : 'var(--text-primary)'};" class="user-link" onclick="event.stopPropagation(); app.viewUserProfile('${escapeHTML(c.author).replace(/'/g, "\\'")}')">${escapeHTML(c.author)}</span>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:0.7rem; color:var(--text-muted);">${cDate}${c.editedAt ? ' <span style="font-style:italic;">(edited)</span>' : ''}</span>
                            ${isMyComment ? `<button class="editCommentBtn" data-commentid="${c.id}" data-postid="${p.id}" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; cursor:pointer; padding:0;">✏️</button>` : ''}
                            ${isMyComment || isAdmin ? `<button class="deleteCommentBtn" data-commentid="${c.id}" data-postid="${p.id}" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; cursor:pointer; padding:0;">🗑️</button>` : ''}
                        </div>
                    </div>
                    <div class="comment-content" style="font-size:0.9rem; color:var(--text-secondary); white-space:pre-wrap;">${renderFigureLinks(renderMentions(c.content))}</div>
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
            <button class="reactBtn" data-postid="${p.id}" data-emoji="like" style="${rBtnStyle('like')}">\ud83d\udc4d ${likes}</button>
            <button class="reactBtn" data-postid="${p.id}" data-emoji="heart" style="${rBtnStyle('heart')}">\u2764\ufe0f ${hearts}</button>
            <button class="reactBtn" data-postid="${p.id}" data-emoji="lmao" style="${rBtnStyle('lmao')}">\ud83d\ude02 ${lmaos}</button>
            <button class="reactBtn" data-postid="${p.id}" data-emoji="sad" style="${rBtnStyle('sad')}">\ud83d\ude22 ${sads}</button>
            <button class="reactBtn" data-postid="${p.id}" data-emoji="meh" style="${rBtnStyle('meh')}">\ud83d\ude10 ${mehs}</button>
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
    const isAdmin = ['owner', 'admin', 'moderator'].includes(this.user.role);

    // Calculate author rank
    const calculateRank = (count) => {
        if (count >= 50) return { icon: '\u{1F48E}', class: 'badge-legend' };
        if (count >= 20) return { icon: '\u{2B50}', class: 'badge-master' };
        if (count >= 5) return { icon: '\u{1F6E1}', class: 'badge-operative' };
        return { icon: '\u{1F530}', class: 'badge-recruit' };
    };
    const rankInfo = calculateRank(parseInt(p.submissionCount) || 0);

    // Post action buttons
    let postActionsHtml = '<div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">';
    if (isMyPost) {
        postActionsHtml += `
            <button class="editPostBtn" data-postid="${p.id}" data-sentiment="${p.sentiment || 'fire'}" style="background:none; border:1px solid var(--border-light); color:var(--text-muted); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;">\u270f\ufe0f Edit</button>
            <button class="deletePostBtn" data-postid="${p.id}" style="background:none; border:1px solid var(--border-light); color:var(--text-muted); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;">\ud83d\uddd1\ufe0f</button>
        `;
    } else if (isAdmin) {
        postActionsHtml += `
            <button class="deletePostBtn" data-postid="${p.id}" style="background:none; border:1px solid var(--danger, #ef4444); color:var(--danger, #ef4444); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;">\ud83d\uddd1\ufe0f Admin</button>
        `;
    }
    if (!isMyPost) {
        postActionsHtml += `<button class="flagPostBtn" data-postid="${p.id}" style="background:none; border:none; color:var(--text-muted); font-size:0.75rem; cursor:pointer; padding:0.25rem 0;">\ud83d\udea9 Report</button>`;
    }
    postActionsHtml += `<button class="sharePostBtn" data-postid="${p.id}" style="background:none; border:none; color:var(--text-muted); font-size:0.75rem; cursor:pointer; padding:0.25rem 0;">\ud83d\udccb Share</button>`;
    if (isAdmin && p.flagCount) {
        postActionsHtml += `<span style="color:var(--danger, #ef4444); font-size:0.75rem; font-weight:600; margin-left:auto;">\u26a0\ufe0f ${p.flagCount} flag${p.flagCount > 1 ? 's' : ''}</span>`;
    }
    postActionsHtml += '</div>';

    // Image: lazy-load from dedicated endpoint instead of inline base64
    const hasImage = p.hasImage || p.imagePath;
    const imageHtml = hasImage
        ? `<img src="${p.imagePath || (API_URL + '/posts/' + p.id + '/image')}" loading="lazy" style="max-width:100%; border-radius:var(--radius-sm); border:1px solid var(--border); max-height:400px; object-fit:contain; background:var(--bg-surface); display:block;">`
        : '';

    return `
        <div class="card feed-item animate-stagger" style="margin-bottom:1.5rem; padding:1.5rem; border-left: 4px solid ${badgeColor}; animation-delay: ${index * 0.08}s;${isSharedPost ? ' box-shadow: 0 0 20px rgba(255, 42, 95, 0.3); border: 1px solid var(--accent);' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                <div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <div style="font-weight:800; font-size:1.1rem; color:${this.user.username === p.author ? 'var(--accent)' : 'var(--text-primary)'};" class="user-link" onclick="event.stopPropagation(); app.viewUserProfile('${escapeHTML(p.author).replace(/'/g, "\\'")}')">${escapeHTML(p.author)}</div>
                        <span class="${rankInfo.class}" style="font-size:0.65rem; padding:0.15rem 0.4rem; border-radius:4px;" title="Analyst Rank">${rankInfo.icon}</span>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.15rem;">${dateStr}${p.editedAt ? ' <span style="color:var(--text-muted); font-style:italic;">(edited)</span>' : ''}</div>
                </div>
                <div style="background:${badgeGlow}; color:${badgeColor}; border:1px solid ${badgeColor}; padding:0.25rem 0.75rem; border-radius:1rem; font-weight:800; font-size:0.85rem; box-shadow: 0 0 10px ${badgeGlow}; text-transform:uppercase;">
                    ${badgeIcon} ${escapeHTML(p.sentiment)}
                </div>
            </div>
            <p class="post-content" style="font-size:1rem; line-height:1.6; color:var(--text-primary); margin-bottom:${hasImage ? '1rem' : '0'}; white-space:pre-wrap;">${renderFigureLinks(renderMentions(p.content))}</p>
            ${imageHtml}
            ${postActionsHtml}
            ${reactionsHtml}
            ${commentsHtml}
            ${replyFormHtml}
        </div>
    `;
};

// Load more posts (appends to timeline, no full re-render)
TerminalApp.prototype._loadMorePosts = async function () {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (!loadMoreBtn) return;
    loadMoreBtn.disabled = true;
    loadMoreBtn.innerText = 'Loading...';

    try {
        const res = await this.authFetch(`${API_URL}/posts?limit=20&offset=${this._feedOffset}`);
        if (!res.ok) throw new Error('Failed to load posts');
        const data = await res.json();
        const posts = Array.isArray(data) ? data : (Array.isArray(data.posts) ? data.posts : []);
        this._feedTotal = (typeof data.total === 'number') ? data.total : this._feedTotal;
        this._feedOffset += posts.length;

        const timeline = document.getElementById('timeline');
        const startIndex = timeline.querySelectorAll('.feed-item').length;

        let html = '';
        posts.forEach((p, i) => {
            html += this._buildPostCard(p, startIndex + i, null);
        });
        timeline.insertAdjacentHTML('beforeend', html);

        // Wire autocomplete on new reply inputs
        timeline.querySelectorAll('.replyContent').forEach(el => {
            if (!el._figureLinkReady) setupFigureLinkHelper(el);
        });

        // Update Load More button
        const remaining = this._feedTotal - this._feedOffset;
        if (remaining <= 0) {
            document.getElementById('feedLoadMore').style.display = 'none';
        } else {
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerText = `Load More (${remaining} remaining)`;
        }
    } catch (err) {
        console.error(err);
        loadMoreBtn.disabled = false;
        loadMoreBtn.innerText = 'Load More (retry)';
    }
};

// Event delegation — single listeners on #timeline for all post interactions
TerminalApp.prototype._setupFeedDelegation = function (timeline, container) {
    const self = this;

    // Reaction clicks
    timeline.addEventListener('click', async (e) => {
        const btn = e.target.closest('.reactBtn');
        if (!btn) return;
        const postId = btn.dataset.postid;
        const emoji = btn.dataset.emoji;
        try {
            btn.style.opacity = '0.5';
            const res = await self.authFetch(`${API_URL}/posts/${postId}/react`, {
                method: 'POST',
                body: JSON.stringify({ emoji })
            });
            if (!res.ok) throw new Error("Reaction failed.");
            const result = await res.json();

            const postBtns = document.querySelectorAll(`.reactBtn[data-postid="${postId}"]`);
            const emojiMap = { like: '\ud83d\udc4d', heart: '\u2764\ufe0f', lmao: '\ud83d\ude02', sad: '\ud83d\ude22', meh: '\ud83d\ude10' };

            postBtns.forEach(b => {
                const bEmoji = b.dataset.emoji;
                const currentText = b.textContent.trim();
                const currentCount = parseInt(currentText.replace(/[^\d]/g, '')) || 0;
                const wasActive = b.style.borderColor.includes('accent') || b.style.color.includes('accent') ||
                    b.style.cssText.includes('var(--accent)');

                if (bEmoji === emoji) {
                    if (result.action === 'removed') {
                        b.textContent = `${emojiMap[bEmoji]} ${Math.max(0, currentCount - 1)}`;
                        b.style.background = 'transparent';
                        b.style.borderColor = 'var(--border-light)';
                        b.style.color = 'var(--text-secondary)';
                    } else {
                        const newCount = result.action === 'added' ? currentCount + 1 : currentCount + 1;
                        b.textContent = `${emojiMap[bEmoji]} ${newCount}`;
                        b.style.background = 'var(--bg-panel)';
                        b.style.borderColor = 'var(--accent)';
                        b.style.color = 'var(--accent)';
                    }
                } else if (result.action === 'updated' && wasActive) {
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

    // Reply form submissions
    timeline.addEventListener('submit', async (e) => {
        const form = e.target.closest('.replyForm');
        if (!form) return;
        e.preventDefault();
        const postId = form.dataset.postid;
        const content = form.querySelector('.replyContent').value.trim();

        try {
            const btn = form.querySelector('button');
            btn.disabled = true;
            btn.innerText = "...";

            const res = await self.authFetch(`${API_URL}/posts/${postId}/comments`, {
                method: 'POST',
                body: JSON.stringify({ content })
            });
            if (!res.ok) throw new Error("Reply failed.");
            const result = await res.json();

            const cDate = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
            const author = self.user.username;
            const commentHtml = `
                <div class="comment-item" data-commentid="${result.id}" data-postid="${postId}" style="margin-bottom: 0.75rem; padding-left: 1rem; border-left: 2px solid var(--border-light);">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 0.25rem;">
                        <span style="font-weight:700; font-size: 0.9rem; color:var(--accent);" class="user-link" onclick="event.stopPropagation(); app.viewUserProfile('${escapeHTML(author).replace(/'/g, "\\'")}')">${escapeHTML(author)}</span>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:0.7rem; color:var(--text-muted);">${cDate}</span>
                            <button class="editCommentBtn" data-commentid="${result.id}" data-postid="${postId}" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; cursor:pointer; padding:0;">✏️</button>
                            <button class="deleteCommentBtn" data-commentid="${result.id}" data-postid="${postId}" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; cursor:pointer; padding:0;">🗑️</button>
                        </div>
                    </div>
                    <div class="comment-content" style="font-size:0.9rem; color:var(--text-secondary); white-space:pre-wrap;">${renderFigureLinks(renderMentions(content))}</div>
                </div>
            `;

            const postCard = form.closest('.feed-item');
            let commentsDiv = postCard.querySelector(':scope > div[style*="border-top"]');
            if (!commentsDiv) {
                commentsDiv = document.createElement('div');
                commentsDiv.style.cssText = 'margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-light);';
                postCard.insertBefore(commentsDiv, form);
            }
            commentsDiv.insertAdjacentHTML('beforeend', commentHtml);

            form.querySelector('.replyContent').value = '';
            btn.disabled = false;
            btn.innerText = "Reply";
        } catch (err) {
            alert(err.message);
            form.querySelector('button').disabled = false;
            form.querySelector('button').innerText = "Reply";
        }
    });

    // Edit, Delete, Flag, Share — single click handler
    timeline.addEventListener('click', async (e) => {
        // Skip if this was a reaction button (handled above)
        if (e.target.closest('.reactBtn')) return;

        // --- EDIT ---
        const editBtn = e.target.closest('.editPostBtn');
        if (editBtn) {
            e.stopPropagation();
            const postId = editBtn.dataset.postid;
            const currentSentiment = editBtn.dataset.sentiment || 'fire';
            const postCard = editBtn.closest('.feed-item');
            const contentEl = postCard.querySelector('.post-content');
            const currentText = contentEl.textContent;

            contentEl.innerHTML = `
                <textarea class="editTextarea" style="width:100%; min-height:80px; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--accent); color:var(--text-primary); border-radius:var(--radius-sm); font-family:var(--font-body); resize:vertical; font-size:1rem;">${escapeHTML(currentText)}</textarea>
                <div style="margin-top:0.5rem;">
                    <label style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.3rem; display:block;">Sentiment Tag</label>
                    <div class="segmented-control" style="margin:0; min-width:280px;">
                        <label class="risk-bullish" style="padding:0.35rem;">
                            <input type="radio" name="editSentiment_${postId}" value="fire" ${currentSentiment === 'fire' ? 'checked' : ''}>
                            <span style="font-size:0.95rem; white-space:nowrap;">\ud83d\udd25 HOT</span>
                        </label>
                        <label class="risk-neutral" style="padding:0.35rem;">
                            <input type="radio" name="editSentiment_${postId}" value="fence" ${currentSentiment === 'fence' ? 'checked' : ''}>
                            <span style="font-size:0.95rem; white-space:nowrap;">\ud83e\udd37 FENCE</span>
                        </label>
                        <label class="risk-bearish" style="padding:0.35rem;">
                            <input type="radio" name="editSentiment_${postId}" value="ice" ${currentSentiment === 'ice' ? 'checked' : ''}>
                            <span style="font-size:0.95rem; white-space:nowrap;">\ud83e\uddca NOT</span>
                        </label>
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <button class="saveEditBtn btn" style="padding:0.4rem 1rem; font-size:0.85rem;">Save</button>
                    <button class="cancelEditBtn" style="padding:0.4rem 1rem; font-size:0.85rem; background:none; border:1px solid var(--border-light); color:var(--text-secondary); border-radius:var(--radius-sm); cursor:pointer;">Cancel</button>
                </div>
            `;
            setupFigureLinkHelper(contentEl.querySelector('.editTextarea'));
            return;
        }

        // --- SAVE EDIT ---
        const saveBtn = e.target.closest('.saveEditBtn');
        if (saveBtn) {
            const postCard = saveBtn.closest('.feed-item');
            const contentEl = postCard.querySelector('.post-content');
            const newContent = contentEl.querySelector('.editTextarea').value.trim();
            if (!newContent) return;
            const postId = postCard.querySelector('.editPostBtn, .deletePostBtn')?.dataset.postid ||
                postCard.querySelector('.reactBtn')?.dataset.postid;
            const sentimentInput = contentEl.querySelector('input[name^="editSentiment_"]:checked');
            const sentiment = sentimentInput ? sentimentInput.value : 'fire';
            try {
                const res = await self.authFetch(`${API_URL}/posts/${postId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ content: newContent, sentiment })
                });
                if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                self.renderFeed(container);
            } catch (err) { alert(err.message); }
            return;
        }

        // --- CANCEL EDIT ---
        const cancelBtn = e.target.closest('.cancelEditBtn');
        if (cancelBtn) {
            self.renderFeed(container);
            return;
        }

        // --- DELETE ---
        const deleteBtn = e.target.closest('.deletePostBtn');
        if (deleteBtn) {
            e.stopPropagation();
            const postId = deleteBtn.dataset.postid;
            if (!confirm('Are you sure you want to purge this broadcast? This cannot be undone.')) return;
            try {
                const res = await self.authFetch(`${API_URL}/posts/${postId}`, { method: 'DELETE' });
                if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                self.renderFeed(container);
            } catch (err) { alert(err.message); }
            return;
        }

        // --- FLAG ---
        const flagBtn = e.target.closest('.flagPostBtn');
        if (flagBtn) {
            e.stopPropagation();
            const postId = flagBtn.dataset.postid;
            const reason = prompt('Why are you reporting this broadcast? (optional)');
            if (reason === null) return;
            try {
                flagBtn.disabled = true;
                flagBtn.textContent = 'Reporting...';
                const res = await self.authFetch(`${API_URL}/posts/${postId}/flag`, {
                    method: 'POST',
                    body: JSON.stringify({ reason: reason || '' })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                flagBtn.textContent = '\u2713 Reported';
                flagBtn.style.color = 'var(--success, #22c55e)';
            } catch (err) {
                alert(err.message);
                flagBtn.disabled = false;
                flagBtn.textContent = '\ud83d\udea9 Report';
            }
            return;
        }

        // --- EDIT COMMENT ---
        const editCommentBtn = e.target.closest('.editCommentBtn');
        if (editCommentBtn) {
            e.stopPropagation();
            const commentItem = editCommentBtn.closest('.comment-item');
            const contentEl = commentItem.querySelector('.comment-content');
            const currentText = contentEl.textContent;

            contentEl.innerHTML = `
                <textarea class="editCommentTextarea" style="width:100%; min-height:60px; padding:0.5rem; background:var(--bg-surface); border:1px solid var(--accent); color:var(--text-primary); border-radius:var(--radius-sm); font-family:var(--font-body); resize:vertical; font-size:0.9rem;">${escapeHTML(currentText)}</textarea>
                <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
                    <button class="saveCommentEditBtn btn" style="padding:0.3rem 0.75rem; font-size:0.8rem;">Save</button>
                    <button class="cancelCommentEditBtn" style="padding:0.3rem 0.75rem; font-size:0.8rem; background:none; border:1px solid var(--border-light); color:var(--text-secondary); border-radius:var(--radius-sm); cursor:pointer;">Cancel</button>
                </div>
            `;
            editCommentBtn.style.display = 'none';
            const editTA = contentEl.querySelector('.editCommentTextarea');
            setupFigureLinkHelper(editTA);
            editTA.focus();
            return;
        }

        // --- SAVE COMMENT EDIT ---
        const saveCommentBtn = e.target.closest('.saveCommentEditBtn');
        if (saveCommentBtn) {
            const commentItem = saveCommentBtn.closest('.comment-item');
            const contentEl = commentItem.querySelector('.comment-content');
            const newContent = contentEl.querySelector('.editCommentTextarea').value.trim();
            if (!newContent) return;
            const commentId = commentItem.dataset.commentid;
            const postId = commentItem.dataset.postid;
            try {
                saveCommentBtn.disabled = true;
                saveCommentBtn.innerText = '...';
                const res = await self.authFetch(`${API_URL}/posts/${postId}/comments/${commentId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ content: newContent })
                });
                if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                contentEl.innerHTML = `<span style="font-size:0.9rem; color:var(--text-secondary); white-space:pre-wrap;">${renderFigureLinks(renderMentions(newContent))}</span>`;
                // Show edit button again and add (edited) indicator
                const editBtn = commentItem.querySelector('.editCommentBtn');
                if (editBtn) editBtn.style.display = '';
                const dateSpan = commentItem.querySelector('div > div > span[style*="font-size:0.7rem"]');
                if (dateSpan && !dateSpan.innerHTML.includes('(edited)')) {
                    dateSpan.innerHTML += ' <span style="font-style:italic;">(edited)</span>';
                }
            } catch (err) { alert(err.message); }
            return;
        }

        // --- CANCEL COMMENT EDIT ---
        const cancelCommentBtn = e.target.closest('.cancelCommentEditBtn');
        if (cancelCommentBtn) {
            self.renderFeed(container);
            return;
        }

        // --- DELETE COMMENT ---
        const deleteCommentBtn = e.target.closest('.deleteCommentBtn');
        if (deleteCommentBtn) {
            e.stopPropagation();
            if (!confirm('Delete this reply? This cannot be undone.')) return;
            const commentItem = deleteCommentBtn.closest('.comment-item');
            const commentId = commentItem.dataset.commentid;
            const postId = commentItem.dataset.postid;
            try {
                const res = await self.authFetch(`${API_URL}/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
                if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                commentItem.remove();
            } catch (err) { alert(err.message); }
            return;
        }

        // --- SHARE ---
        const shareBtn = e.target.closest('.sharePostBtn');
        if (shareBtn) {
            e.stopPropagation();
            const postId = shareBtn.dataset.postid;
            const url = `${window.location.origin}${window.location.pathname}?post=${postId}`;
            navigator.clipboard.writeText(url).then(() => {
                shareBtn.textContent = '\u2713 Link Copied!';
                setTimeout(() => { shareBtn.textContent = '\ud83d\udccb Share'; }, 2000);
            }).catch(() => {
                shareBtn.textContent = '\u2717 Failed';
                setTimeout(() => { shareBtn.textContent = '\ud83d\udccb Share'; }, 2000);
            });
            return;
        }
    });
};
