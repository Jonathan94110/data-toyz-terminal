// views/profile.js — Profile Settings
TerminalApp.prototype.renderProfile = function(container) {
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
                                ${this.user.avatar ? `<img src="${this.user.avatar}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid var(--border);" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:80px; height:80px; border-radius:50%; background:var(--bg-surface); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-weight:700;\\'>${escapeHTML(this.user.username).charAt(0).toUpperCase()}</div>';">` : `<div style="width:80px; height:80px; border-radius:50%; background:var(--bg-surface); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-weight:700;">${escapeHTML(this.user.username).charAt(0).toUpperCase()}</div>`}
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

                        <!-- Row: DM & Group Chat Messages -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm);">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me of new messages in DMs & Group Chats</span>
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

                        <!-- Row: Assessment Requests -->
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm);">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Assessment requests from other users</span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="assessment_request_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="assessment_request_inapp">
                                </label>
                            </div>
                        </div>

                        <!-- Row: Flagged Posts (Admin Only) -->
                        ${['owner', 'admin', 'moderator'].includes(this.user.role) ? `
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm);">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when posts are flagged <span style="color:${{owner:'#a855f7',admin:'#fbbf24',moderator:'#3b82f6'}[this.user.role]}; font-size:0.75rem;">${{owner:'\u{2B50} Owner',admin:'\u{2605} Admin',moderator:'\u{1F6E1}\u{FE0F} Mod'}[this.user.role]}</span></span>
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

                        <!-- Row: Pending Brand Requests (Admin/Owner Only) -->
                        ${['owner', 'admin'].includes(this.user.role) ? `
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm); margin-top:0.5rem;">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when a new brand is submitted for approval <span style="color:${{owner:'#a855f7',admin:'#fbbf24'}[this.user.role]}; font-size:0.75rem;">${{owner:'⭐ Owner',admin:'★ Admin'}[this.user.role]}</span></span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="pending_brand_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="pending_brand_inapp">
                                </label>
                            </div>
                        </div>
                        ` : ''}

                        <!-- Row: Trade Validation (Admin/Platinum) -->
                        ${['owner', 'admin'].includes(this.user.role) || this.user.platinum ? `
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-sm); margin-top:0.5rem;">
                            <span style="color:var(--text-primary); font-size:0.9rem;">Notify me when a figure is listed for trade (pending validation) <span style="color:#a855f7; font-size:0.75rem;">💎 Validator</span></span>
                            <div style="display:flex; gap:0; flex-shrink:0;">
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="trade_validation_email">
                                </label>
                                <label style="width:64px; display:flex; justify-content:center; cursor:pointer;">
                                    <input type="checkbox" class="notifPref notif-toggle" data-key="trade_validation_inapp">
                                </label>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    <div id="notifPrefsSaved" style="display:none; text-align:center; color:var(--success); font-size:0.85rem; margin-top:0.75rem;">Preferences saved.</div>
                </div>

                ${this.user.role !== 'owner' ? `
                <div class="card" style="padding: 2.5rem; margin-top:2rem; border:1px solid var(--danger); border-radius:var(--radius);">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:0.95rem; color:var(--danger); margin-bottom:0.5rem;">&#9888;&#65039; Danger Zone</h3>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1.5rem;">Permanently delete your account and all associated data. This action <strong style="color:var(--text-primary);">cannot be undone</strong>. All your intel reports, broadcasts, messages, and profile data will be erased.</p>
                    <div class="form-group" style="margin-bottom:1rem;">
                        <label class="form-label" style="color:var(--danger);">Confirm your password to proceed</label>
                        <input type="password" id="deleteAccountPassword" placeholder="Enter your password" style="width:100%; padding:0.75rem; background:var(--bg-surface); border:1px solid var(--danger); color:var(--text-primary); border-radius:var(--radius-sm);">
                    </div>
                    <button id="deleteAccountBtn" style="width:100%; padding:1rem; font-size:1.1rem; background:var(--danger); color:white; border:none; border-radius:var(--radius-sm); cursor:pointer; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Delete My Account</button>
                    <div id="deleteAccountMsg" style="margin-top:0.75rem; font-size:0.85rem; text-align:center;"></div>
                </div>
                ` : ''}
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
                this.user = { id: data.id, username: data.username, email: data.email, avatar: data.avatar, role: data.role, platinum: data.platinum };
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
            if (newPassword.length < 8) { alert('Password must be at least 8 characters, with uppercase, lowercase, and a number.'); return; }

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

        // Delete account handler
        const deleteBtn = document.getElementById('deleteAccountBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                const password = document.getElementById('deleteAccountPassword').value;
                const msgEl = document.getElementById('deleteAccountMsg');
                if (!password) {
                    msgEl.innerHTML = '<span style="color:var(--danger);">Please enter your password.</span>';
                    return;
                }
                if (!confirm('Are you sure you want to permanently delete your account? This CANNOT be undone. All your data will be erased.')) return;

                deleteBtn.disabled = true;
                deleteBtn.innerText = 'Deleting...';
                msgEl.innerHTML = '';

                try {
                    const res = await this.authFetch(`${API_URL}/users/me/account`, {
                        method: 'DELETE',
                        body: JSON.stringify({ password })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Failed to delete account.');

                    // Clear all local state
                    localStorage.removeItem('terminal_token');
                    localStorage.removeItem('terminal_user');
                    if (this.notifInterval) clearInterval(this.notifInterval);
                    if (this.tickerInterval) clearInterval(this.tickerInterval);

                    alert('Your account has been permanently deleted. You will now be redirected.');
                    window.location.reload();
                } catch (err) {
                    msgEl.innerHTML = `<span style="color:var(--danger);">${escapeHTML(err.message)}</span>`;
                    deleteBtn.disabled = false;
                    deleteBtn.innerText = 'Delete My Account';
                }
            });
        }

        // Load notification preferences
        this.loadNotifPrefs();
};

TerminalApp.prototype.loadNotifPrefs = async function() {
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
};

TerminalApp.prototype.saveNotifPref = async function(key, value) {
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
};
