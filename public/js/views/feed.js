// views/feed.js — Community Feed

TerminalApp.prototype.renderFeed = async function (container) {
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
            <div style="margin-bottom:1rem;">
                <h2 style="font-size:2rem; margin-bottom:0.25rem; text-transform:uppercase; letter-spacing:0.03em;">Community Feed</h2>
                <p style="color:var(--text-secondary); font-size:0.9rem;">Live operative intelligence chatter and market sentiment.</p>
            </div>

            <!-- NEW POST FORM -->
            <div class="card" style="margin-bottom:1.5rem; padding:1.25rem;">
                <form id="postForm">
                    <textarea id="postContent" required placeholder="Broadcast your observations..." style="width:100%; height:56px; padding:0.75rem 1rem; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); margin-bottom:0.75rem; font-family:var(--font-body); resize:vertical; font-size:0.9rem;"></textarea>

                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.75rem;">
                        <div>
                            <label for="postImage" style="cursor:pointer; padding:0.4rem 0.75rem; border:1px solid var(--border-light); border-radius:var(--radius-sm); font-size:0.8rem; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-light)'">
                                📸 Attach
                            </label>
                            <input type="file" id="postImage" accept="image/*" style="display:none;" onchange="document.getElementById('imgName').innerText = this.files[0] ? this.files[0].name : ''">
                            <span id="imgName" style="margin-left:0.5rem; font-size:0.75rem; color:var(--accent);"></span>
                        </div>

                        <div class="segmented-control" style="margin:0; min-width:280px;">
                            <label class="risk-bullish" style="padding:0.4rem;">
                                <input type="radio" name="sentiment" value="fire" required>
                                <span style="font-size:0.9rem; white-space:nowrap;">🔥 HOT</span>
                            </label>
                            <label class="risk-neutral" style="padding:0.4rem;">
                                <input type="radio" name="sentiment" value="fence" required>
                                <span style="font-size:0.9rem; white-space:nowrap;">🤷 FENCE</span>
                            </label>
                            <label class="risk-bearish" style="padding:0.4rem;">
                                <input type="radio" name="sentiment" value="ice" required>
                                <span style="font-size:0.9rem; white-space:nowrap;">🧊 NOT</span>
                            </label>
                        </div>
                    </div>

                    <button type="submit" class="btn" style="width:100%; padding:0.65rem;">Transmit Broadcast</button>
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
            const badgeIcon = isFire ? '\ud83d\udd25' : isFence ? '\ud83e\udd37' : '\ud83e\uddca';
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
                            <div style="font-size:0.9rem; color:var(--text-secondary); white-space:pre-wrap;">${renderFigureLinks(renderMentions(c.content))}</div>
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
            const isAdmin = this.user.role === 'admin';

            // Post action buttons (edit/delete for author, admin delete, flag, share)
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
                    <p class="post-content" style="font-size:1rem; line-height:1.6; color:var(--text-primary); margin-bottom:${p.imagePath ? '1rem' : '0'}; white-space:pre-wrap;">${renderFigureLinks(renderMentions(p.content))}</p>
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

    // Clean up any autocomplete dropdowns from previous renders
    document.querySelectorAll('.figure-autocomplete').forEach(el => el.remove());
    // Auto-bracket + autocomplete helper for figure linking (@[Figure Name])
    setupFigureLinkHelper(document.getElementById('postContent'));
    document.querySelectorAll('.replyContent').forEach(el => setupFigureLinkHelper(el));

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

                // In-place comment injection (no full re-render)
                const cDate = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                const author = this.user.username;
                const commentHtml = `
                    <div style="margin-bottom: 0.75rem; padding-left: 1rem; border-left: 2px solid var(--border-light);">
                        <div style="display:flex; justify-content:space-between; margin-bottom: 0.25rem;">
                            <span style="font-weight:700; font-size: 0.9rem; color:var(--accent);" class="user-link" onclick="event.stopPropagation(); app.viewUserProfile('${escapeHTML(author).replace(/'/g, "\\'")}')">${escapeHTML(author)}</span>
                            <span style="font-size:0.7rem; color:var(--text-muted);">${cDate}</span>
                        </div>
                        <div style="font-size:0.9rem; color:var(--text-secondary); white-space:pre-wrap;">${renderFigureLinks(renderMentions(content))}</div>
                    </div>
                `;

                // Find or create the comments container above the reply form
                const postCard = form.closest('.feed-item');
                let commentsDiv = postCard.querySelector(':scope > div[style*="border-top"]');
                if (!commentsDiv) {
                    commentsDiv = document.createElement('div');
                    commentsDiv.style.cssText = 'margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-light);';
                    postCard.insertBefore(commentsDiv, form);
                }
                commentsDiv.insertAdjacentHTML('beforeend', commentHtml);

                // Reset the input
                form.querySelector('.replyContent').value = '';
                btn.disabled = false;
                btn.innerText = "Reply";
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
                const emojiMap = { like: '\ud83d\udc4d', heart: '\u2764\ufe0f', lmao: '\ud83d\ude02', sad: '\ud83d\ude22', meh: '\ud83d\ude10' };

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
            const currentSentiment = btn.dataset.sentiment || 'fire';
            const postCard = btn.closest('.feed-item');
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

            // Wire autocomplete to the edit textarea
            setupFigureLinkHelper(contentEl.querySelector('.editTextarea'));

            contentEl.querySelector('.saveEditBtn').addEventListener('click', async () => {
                const newContent = contentEl.querySelector('.editTextarea').value.trim();
                if (!newContent) return;
                const selectedSentiment = contentEl.querySelector(`input[name="editSentiment_${postId}"]:checked`);
                const sentiment = selectedSentiment ? selectedSentiment.value : currentSentiment;
                try {
                    const res = await app.authFetch(`${API_URL}/posts/${postId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ content: newContent, sentiment })
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
                btn.textContent = '\u2713 Reported';
                btn.style.color = 'var(--success, #22c55e)';
            } catch (err) {
                alert(err.message);
                btn.disabled = false;
                btn.textContent = '\ud83d\udea9 Report';
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
                btn.textContent = '\u2713 Link Copied!';
                setTimeout(() => { btn.textContent = '\ud83d\udccb Share'; }, 2000);
            }).catch(() => {
                btn.textContent = '\u2717 Failed';
                setTimeout(() => { btn.textContent = '\ud83d\udccb Share'; }, 2000);
            });
        });
    });
};
