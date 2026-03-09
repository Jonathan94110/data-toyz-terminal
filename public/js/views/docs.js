// views/docs.js — Documentation
TerminalApp.prototype.renderDocs = function(container) {
        const isAdmin = this.user && ['owner', 'admin'].includes(this.user.role);
        const sections = [
            { id: 'overview', title: 'Platform Overview' },
            { id: 'categories', title: 'Categories' },
            { id: 'navigation', title: 'Navigation Guide' },
            { id: 'community-feed', title: 'Community Feed' },
            { id: 'breakout-rooms', title: 'DMs & Group Chats' },
            { id: 'target-search', title: 'Action Figure Registration' },
            { id: 'trade-scan', title: 'Trade Scan (Submissions)' },
            { id: 'grading', title: 'Grading System' },
            { id: 'market-pulse', title: 'Market Pulse Dashboard' },
            { id: 'intel-history', title: 'My Intel History' },
            { id: 'leaderboards', title: 'Global Leaderboard & Ranks' },
            { id: 'figure-leaderboard', title: 'Figure Leaderboard' },
            { id: 'profile', title: 'Profile Settings' },
            { id: 'notifications', title: 'Notifications' },
            { id: 'profiles-following', title: 'User Profiles & Following' },
            { id: 'flagging', title: 'Flagging a Post' },
            { id: 'collection-tracker', title: 'Collection Tracker' },
            { id: 'platinum-badge', title: 'Platinum Badge & Trade Validation' },
            ...(isAdmin ? [
                { id: 'admin', title: 'Admin Panel' },
                { id: 'security', title: 'Security & Authentication' },
                { id: 'soc2', title: 'SOC 2 Alignment' },
            ] : []),
            { id: 'glossary', title: 'Glossary' }
        ];

        container.innerHTML = `
            <div style="max-width:860px; margin:0 auto; padding-bottom:4rem;">
                <div style="margin-bottom:2.5rem; text-align:center;">
                    <h2 style="font-size:2.5rem; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em;">Data Toyz Documentation</h2>
                    <p style="color:var(--text-secondary); font-size:1.1rem;">Comprehensive field manual for all Data Toyz operations.${isAdmin ? ' <span style="color:var(--accent); font-weight:600;">[Admin View]</span>' : ''}</p>
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
                        <strong>Data Toyz Terminal</strong> is a community-driven intelligence platform for action figure collectors. The platform uses a spy/intelligence agency theme where collectors are <strong>operatives</strong>, figures are <strong>targets</strong>, and reviews are <strong>intel reports</strong>.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The core mission: evaluate, rate, and track the collectible market for action figures across all brands and product lines. Operatives submit detailed intelligence reports grading each figure on market sentiment and physical quality, building a comprehensive database of community-driven reviews.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The platform supports <strong>two categories</strong> &mdash; <strong>Transformers</strong> and <strong>Action Figures</strong> &mdash; each with their own filtered catalog, leaderboards, and market analytics. Use the category switcher in the sidebar to toggle between them.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8;">
                        <strong>Transformers Brands:</strong> Hasbro, Takara Tomy, Fans Toys, X-Transbots, and other 3rd party manufacturers.<br>
                        <strong>Action Figure Brands:</strong> Hasbro (GI Joe, Star Wars), Mattel (He-Man/MOTU), Bandai (Voltron), and more.<br>
                        <strong>Transformer Tiers:</strong> Core, Deluxe, Voyager, Leader, Commander, Titan, Masterpiece.<br>
                        <strong>Action Figure Tiers:</strong> 3.75", 6", 7", 12".
                    </p>
                </div>

                <!-- 02. CATEGORIES -->
                <div id="doc-categories" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">02. Categories</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Data Toyz supports two collector communities, each with their own independent catalog, leaderboards, and market analytics:
                    </p>
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:1rem;">
                        <thead>
                            <tr style="text-align:left; border-bottom:2px solid var(--border-light);">
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Category</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Size Classes</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Transformation</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Transformers</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Core, Deluxe, Voyager, Leader, Commander, Titan, Masterpiece</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Included by default</td></tr>
                            <tr><td style="padding:0.6rem 1rem; font-weight:600;">Action Figures</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">3.75", 6", 7", 12"</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Opt-in (for M.A.S.K., Voltron, Go-Bots, etc.)</td></tr>
                        </tbody>
                    </table>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Switching Categories:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        Use the <strong>Transformers / Action Figures</strong> toggle in the sidebar (below the logo) to switch between categories. When you switch, all views automatically reload with filtered data &mdash; only figures in the active category are shown across Search, Leaderboard, Market Pulse, and your Intel History.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Transformation Opt-In:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        The submission form includes a <strong>"Has Transformation?"</strong> checkbox. For Transformers this is checked by default; for Action Figures it is unchecked. You can override this for edge cases like M.A.S.K., Voltron, or Go-Bots that do transform. When unchecked, the Transformation Frustration and Satisfaction sliders are hidden and the Approval Score formula adjusts from /90 to /70.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">When the sidebar is collapsed, the category switcher shows abbreviated labels: <strong>TF</strong> (Transformers) and <strong>AF</strong> (Action Figures).</p>
                </div>

                <!-- 03. NAVIGATION GUIDE -->
                <div id="doc-navigation" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">03. Navigation Guide</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">The left sidebar contains all primary navigation tabs:</p>
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="text-align:left; border-bottom:2px solid var(--border-light);">
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Tab</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Community Feed</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Social timeline for posting updates, comments, and reactions</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">DMs & Group Chats</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Private encrypted channels for 1-on-1 DMs and group chats</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Market Pulse</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Dashboard with market statistics, brand indexes, and top-rated figures</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Action Figure Registration</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Browse, search, and register figures in the catalog with real-time filtering</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">My Intel History</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">View all your past intel report submissions</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Global Leaderboard</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Top operatives ranked by number of submissions</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Profile Settings</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Update your username, email, avatar, and password</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Documentation</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">This page &mdash; full platform reference</td></tr>
                            <tr><td style="padding:0.6rem 1rem; font-weight:600;">Admin Panel</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Admin-only: manage users, figures, and view analytics</td></tr>
                        </tbody>
                    </table>
                    <p style="color:var(--text-primary); line-height:1.8; margin-top:1rem; margin-bottom:0.75rem;"><strong>Topbar:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Global Search</strong> &mdash; Search across targets, users, and intel from the top search bar</li>
                        <li><strong>Notifications</strong> &mdash; Bell icon shows unread count; click to expand the notifications panel</li>
                        <li><strong>View Profile</strong> &mdash; Click your avatar or username in the top-right corner to open your operative dossier</li>
                        <li><strong>Sign Out</strong> &mdash; Log out of the terminal via the exit icon</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Browser Navigation:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        The terminal supports browser back and forward buttons. Navigating between views creates browser history entries, so you can use your browser's back/forward buttons (or swipe gestures on mobile) to move between previously visited pages within the app.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">The theme toggle at the bottom switches between Dark Mode and Light Mode. The sidebar can be collapsed for more screen space. Your current view is preserved across page reloads.</p>
                </div>

                <!-- 03. COMMS FEED -->
                <div id="doc-community-feed" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">04. Community Feed</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Community Feed is the social hub of the terminal. Operatives can broadcast messages to the entire community, attach images, and engage with each other.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Features:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Post Broadcasts</strong> &mdash; Share text updates with optional image attachments</li>
                        <li><strong>Sentiment Tags</strong> &mdash; Each post is tagged with a sentiment: \u{1F525} HOT (bullish), \u{1F937} FENCE (neutral), or \u{1F9CA} NOT (bearish)</li>
                        <li><strong>Comments</strong> &mdash; Reply to any broadcast to start a discussion thread</li>
                        <li><strong>Emoji Reactions</strong> &mdash; React to posts with one of four emojis: \u{1F44D} \u{2764}\u{FE0F} \u{1F602} \u{1F610} (one reaction per user per post, toggles on/off)</li>
                        <li><strong>@-Mentions</strong> &mdash; Tag other operatives with <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">@username</code> in posts or comments. As you type after <code>@</code>, a live autocomplete dropdown searches all registered operatives and lets you select with arrow keys + Enter/Tab. The mentioned operative receives an in-app notification and the mention appears as a clickable profile link.</li>
                        <li><strong>@everyone</strong> &mdash; Use <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">@everyone</code> in a post or comment to send a notification to all operatives on the platform. The @everyone tag renders in orange and is available in the autocomplete dropdown.</li>
                        <li><strong>User Profiles</strong> &mdash; Click any username to view their operative dossier</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Post Management:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Edit Post</strong> &mdash; Authors can edit their own broadcasts by clicking the \u{270F}\u{FE0F} button. The edit form allows updating the post text, changing the sentiment tag (\u{1F525} HOT / \u{1F937} FENCE / \u{1F9CA} NOT), and using figure linking with autocomplete. Edited posts display an <em>(edited)</em> tag next to the timestamp.</li>
                        <li><strong>Delete Post</strong> &mdash; Authors can delete their own broadcasts via the \u{1F5D1}\u{FE0F} button. Admins can delete any broadcast.</li>
                        <li><strong>Share Post</strong> &mdash; Click \u{1F4CB} to copy a direct link to any broadcast. Shared links work as deep links &mdash; recipients are taken straight to that post after login.</li>
                        <li><strong>Figure Linking</strong> &mdash; Reference any figure directly inside a post or comment using the <code>*[Figure Name]</code> syntax (see workflow below). Additionally, <strong>bare figure names</strong> that match existing figures in the catalog are automatically linked &mdash; no special syntax required. Names shorter than 4 characters are excluded to avoid false matches.</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Figure Linking &mdash; How It Works:</strong></p>
                    <ol style="color:var(--text-secondary); line-height:2.2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Type <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">*</code> &rarr; brackets auto-insert: <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">*[]</code> with the cursor placed inside</li>
                        <li>Start typing a figure name (e.g. <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">*[Road</code>) &rarr; a dropdown appears searching the entire figure catalog in real time</li>
                        <li>Matching figures show their name + brand label (e.g. <strong>Roadking</strong> &mdash; <span style="color:var(--text-muted); text-transform:uppercase; font-size:0.8rem;">X-TRANSBOTS</span>)</li>
                        <li>Click a result or use <kbd>&uarr;</kbd><kbd>&darr;</kbd> arrow keys + <kbd>Enter</kbd>/<kbd>Tab</kbd> to select &mdash; the full name fills in and the cursor jumps past the closing bracket</li>
                        <li><kbd>Escape</kbd> dismisses the dropdown; blur auto-hides it</li>
                    </ol>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:0.5rem;">
                        Works in the main post textarea, all reply inputs, and the edit post form. Known figures render as clickable chips that open the figure page. Unknown names render as dashed chips that open Action Figure Registration with the name pre-filled. Bare figure names (without <code>*[]</code> syntax) are also auto-detected and linked when they match an existing catalog entry. The dropdown cleans up on feed re-render so there are no orphaned elements. Use <code>@username</code> to mention other users in posts and replies.
                    </p>

                    <p style="color:var(--text-muted); font-size:0.85rem;">Posts appear in reverse chronological order (newest first). Images are uploaded as base64-encoded data.</p>
                </div>

                <!-- 04. BREAKOUT ROOMS -->
                <div id="doc-breakout-rooms" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">05. DMs & Group Chats</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        DMs & Group Chats are encrypted private channels within the Community Feed. Unlike the public Community Feed, DMs & Group Chats allow operatives to communicate in private &mdash; either one-on-one or in small groups.
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
                        You can open a direct channel with any operative by clicking the <strong>"\u{1F4AC} Send Message"</strong> button on their profile dossier. This is accessible from any username link across the platform (Community Feed, Leaderboard, etc.). You can also start a DM from your own profile by clicking <strong>"\u{1F4AC} New Message"</strong> and searching for an operative.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Filter Tabs:</strong></p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The room list supports three filter views: <strong>All</strong> (every channel), <strong>DMs</strong> (1-on-1 only), and <strong>Groups</strong> (multi-member channels only). Rooms are sorted by most recent activity.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Messages poll for updates every 3 seconds while you are inside a channel. The nav badge polls every 15 seconds for total unread messages across all rooms.</p>
                </div>

                <!-- 05. TARGET SEARCH -->
                <div id="doc-target-search" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">06. Action Figure Registration</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Action Figure Registration page is the central figure catalog. Every Transformers figure in the database is listed here with real-time search and filtering.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>How it works:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Search</strong> &mdash; Type to instantly filter by figure name, brand, class tier, or product line</li>
                        <li><strong>Minimum Grade Filter</strong> &mdash; Use the grade dropdown to filter figures by minimum average grade (50+, 60+, 70+, etc.)</li>
                        <li><strong>Class Tier Badges</strong> &mdash; Color-coded badges show the figure's class (Deluxe, Voyager, Leader, Commander, Masterpiece)</li>
                        <li><strong>Select a Target</strong> &mdash; Click any figure to view its full intel page with all submissions, charts, and gallery</li>
                        <li><strong>Add New Target</strong> &mdash; Any authenticated operative can register a new figure with a name, brand, product line, class tier, and <strong>mandatory MSRP</strong> (retail price). The MSRP establishes the price baseline used across all market analytics. The brand field is a dropdown populated from all admin-approved brands in the database. If you need a brand not yet in the list, select "Other" and enter the new brand name &mdash; it will be submitted for admin approval before the figure can be created.</li>
                        <li><strong>Duplicate Detection</strong> &mdash; As you type a figure name on the registration form, a live autocomplete dropdown shows up to 8 existing figures that match your input using fuzzy search (substring, reverse substring, and Levenshtein distance). Click any match to navigate to that figure instead of creating a duplicate. An inline warning also displays the number of similar figures found.</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Brand Approval Process:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Admin-approved brands appear in the dropdown for all operatives</li>
                        <li>When a non-admin operative uses a new brand, it is automatically submitted as a <strong>Pending Brand Request</strong> for admin review</li>
                        <li>Admins can approve or reject pending brand requests from the Admin Panel</li>
                        <li>Once approved, the brand becomes available in the dropdown for all future figure registrations</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>After Registration:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        When you successfully register a new figure, the app automatically navigates you to the figure's profile page so you can immediately submit your first intel report by clicking <strong>"Rate Figure"</strong>.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8;">
                        <strong>Figure Data:</strong> Each target has a name, brand (Hasbro, Takara Tomy, etc.), class tier, and product line. Figures can also display a ranked list sorted by average community grade.
                    </p>
                </div>

                <!-- 06. TRADE SCAN -->
                <div id="doc-trade-scan" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">07. Trade Scan (Submissions)</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Trade Scan is the core evaluation form. When you select a figure from Action Figure Registration, click <strong>"Rate Figure"</strong> to submit a detailed intel report grading the figure across multiple dimensions.
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
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">3</td><td style="padding:0.6rem 1rem; font-weight:600;">Physical Quality Scales</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">7 core attributes (Build, Paint, Articulation, Accuracy, Presence, Value, Packaging) plus 2 optional Transformation scores (Frustration & Satisfaction) &mdash; each rated 1-10. Transformation scores appear when "Has Transformation?" is checked.</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">4</td><td style="padding:0.6rem 1rem; font-weight:600;">Evidence</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Upload a photo of the figure as field evidence (appears in the gallery)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">5</td><td style="padding:0.6rem 1rem; font-weight:600;">What Did You Pay?</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Select your purchase source (<span style="color:#10b981;">Overseas Retail</span>, <span style="color:#f59e0b;">US Retail</span>, or <span style="color:#ef4444;">Aftermarket/Resale</span>) and enter the price you paid</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; color:var(--text-muted);">6</td><td style="padding:0.6rem 1rem; font-weight:600;">Community Recommendation</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Yes or No &mdash; do you recommend acquiring this target?</td></tr>
                            <tr><td style="padding:0.6rem 1rem; color:var(--text-muted);">7</td><td style="padding:0.6rem 1rem; font-weight:600;">Trade Value Star Rating</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Overall 1-5 star rating for the figure</td></tr>
                        </tbody>
                    </table>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Editing Reports:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        After submitting, you can edit any of your own reports from <strong>My Intel History</strong>. Click \u{270F}\u{FE0F} Edit &mdash; the form reopens pre-populated with your original data. Update any fields (DTS scores, risk forecasting, physical quality, evidence image, market price, recommendation, star rating) and save. Edited reports display an <em>(edited)</em> indicator next to the submission date.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Ownership Status &amp; Pop Count:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        At the top of every Trade Scan form, you must declare your ownership status:
                    </p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong style="color:#10b981;">In Hand (Physically Owned)</strong> &mdash; You physically possess this figure. Your submission counts toward the figure's <strong>Community Pop Count</strong> (unique verified owners).</li>
                        <li><strong style="color:#6366f1;">Observed / Digital Review Only</strong> &mdash; You are reviewing based on online research or photos. This does not count toward the Pop Count.</li>
                    </ul>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        The Pop Count appears on each figure's Market Pulse detail page as a 4-stat card: <strong>Unique Owners</strong>, <strong>In-Hand Reports</strong>, <strong>Digital Reviews</strong>, and <strong>Total Submissions</strong>. It also appears as an owner count on the Figure Leaderboard. This community-driven metric provides rarity and demand intelligence.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Each submission is recorded and visible to the entire community. You can edit or retract your own submissions from My Intel History.</p>
                </div>

                <!-- 07. GRADING SYSTEM -->
                <div id="doc-grading" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">08. Grading System</h3>
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
                            Calculated from the Physical Quality ratings (each 1&ndash;10).<br>
                            With Transformation (9 ratings): <code style="background:var(--bg-surface); padding:0.2rem 0.5rem; border-radius:3px; font-size:0.85rem;">(sum / 90) &times; 100</code><br>
                            Without Transformation (7 ratings): <code style="background:var(--bg-surface); padding:0.2rem 0.5rem; border-radius:3px; font-size:0.85rem;">(sum / 70) &times; 100</code><br>
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
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">09. Market Pulse Dashboard</h3>
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
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        When you click a figure from Action Figure Registration, you see a <strong>detailed intel page</strong> with: all submissions listed, a grade trend chart over time, a price trend chart, community recommendation votes, and a <strong>Field Evidence Gallery</strong> of uploaded photos.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Value Signal Badge:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        Each figure displays a <strong>Value Signal</strong> badge indicating its market position. When both MSRP and secondary market data are available, the signal compares prices: <strong>UNDERVALUED</strong>, <strong>FAIR VALUE</strong>, <strong>HOLD</strong>, <strong>HOT</strong>, or <strong>OVERVALUED</strong>. When only grade data is available, a grade-only fallback is used: <strong>STRONG BUY</strong>, <strong>SOLID</strong>, <strong>MIXED</strong>, or <strong>WEAK</strong>.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Price Tiers Card:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        The Price Tiers card shows average prices across three purchase channels, each color-coded to match the chart: <span style="color:#10b981;"><strong>Overseas (MSRP)</strong></span> &mdash; baseline retail, <span style="color:#f59e0b;"><strong>Stateside (US Retail)</strong></span> &mdash; with tariff/shipping markup, and <span style="color:#ef4444;"><strong>Secondary Market</strong></span> &mdash; aftermarket/resale prices. Cross-tier percentage differences show how much each tier costs relative to the others.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Community Projections Trend Chart:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        The trend chart plots the community grade (red line, left axis) against three separate price lines by purchase source (right axis): <span style="color:#10b981;"><strong>Overseas</strong></span> (solid green), <span style="color:#f59e0b;"><strong>Stateside</strong></span> (dashed amber), and <span style="color:#ef4444;"><strong>Secondary</strong></span> (dotted red). A yellow dashed <strong>MSRP Baseline</strong> reference line shows the retail price floor. Each line can be toggled on/off independently.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>DTS Breakdown &amp; Scarcity:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        The DTS (Data Toyz Trading Score) breakdown shows 5 horizontal bars: Community, Buzz, Liquidity, Scarcity, and Appeal. All bars use a consistent scale where <strong>higher = better</strong>. The Scarcity bar indicates how hard a figure is to replace in the current market &mdash; higher scarcity means the figure is rarer and harder to find.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Smart MSRP:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        The platform uses a "Smart MSRP" system for price analysis. If an admin-set MSRP exists, that is used. Otherwise, the community's average overseas retail price serves as the MSRP baseline. This ensures price comparisons and value signals work even before an admin manually sets the MSRP.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Figure Title Editing:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8;">
                        The operative who originally created a figure can rename it by clicking the \u{270F}\u{FE0F} button next to the figure title on the intel page. An inline editor appears to type the new name and save or cancel. Admins retain full editing authority over all figure titles regardless of who created them. Figures created before this feature was introduced can only be renamed by admins.
                    </p>
                </div>

                <!-- 09. MY INTEL HISTORY -->
                <div id="doc-intel-history" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">10. My Intel History</h3>
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
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">11. Global Leaderboard & Ranks</h3>
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

                <!-- 10b. FIGURE LEADERBOARD -->
                <div id="doc-figure-leaderboard" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">10b. Figure Leaderboard</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Figure Leaderboard ranks action figures by community data. Access it from the sidebar under <strong>Figure Leaderboard</strong>. The top 3 figures display on a podium with medals.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Leaderboard Modes:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Top Rated</strong> &mdash; Sorted by average community grade (default)</li>
                        <li><strong>Rising</strong> &mdash; Figures with positive 30-day price momentum</li>
                        <li><strong>Most Reviewed</strong> &mdash; Sorted by total submission count</li>
                        <li><strong>Sleepers</strong> &mdash; Under-reviewed figures (1&ndash;5 submissions) with high grades (&ge;70)</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Data Columns:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Grade</strong> &mdash; Average DTS + Physical Quality score</li>
                        <li><strong>Price</strong> &mdash; Latest secondary market price</li>
                        <li><strong>MSRP Diff</strong> &mdash; Percentage above or below retail MSRP</li>
                        <li><strong>30d Change</strong> &mdash; Price trend over the last 30 days</li>
                        <li><strong>Pop</strong> &mdash; Unique verified owners (Community Pop Count)</li>
                        <li><strong>Reviews</strong> &mdash; Total intel submissions</li>
                    </ul>
                    <p style="color:var(--text-secondary); line-height:1.8;">Use the brand filter dropdown to narrow results by manufacturer. Results are paginated (25 per page).</p>
                </div>

                <!-- 11. PROFILE SETTINGS -->
                <div id="doc-profile" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">12. Profile Settings</h3>
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
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">13. Notifications</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The notification bell in the top-right corner alerts you to activity on your content. Click a notification to navigate directly to the relevant post or figure. Use "Mark all read" to clear unread badges. Notifications poll for updates every 30 seconds.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Notification Types:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Reply to my broadcast</strong> &mdash; When someone comments on your Community Feed post</li>
                        <li><strong>Reaction to my post</strong> &mdash; When someone reacts with an emoji to your broadcast</li>
                        <li><strong>Co-reviewer on same figure</strong> &mdash; When another operative submits an intel report on a figure you also reviewed</li>
                        <li><strong>New figure added to catalog</strong> &mdash; When an admin adds a new figure to the database</li>
                        <li><strong>Important updates from HQ</strong> &mdash; System-wide announcements from Terminal administrators</li>
                        <li><strong>DM & Group Chat Messages</strong> &mdash; When a new message is sent in a DM or Group Chat you are a member of</li>
                        <li><strong>@-Mention</strong> &mdash; When someone tags you with <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">@yourusername</code> or <code style="background:var(--bg-surface); padding:0.15rem 0.4rem; border-radius:3px; font-size:0.85rem;">@everyone</code> in a broadcast or comment</li>
                        <li><strong>New Follower</strong> &mdash; When another operative starts following you</li>
                        <li><strong>Assessment Requests</strong> &mdash; When another operative requests your assessment on a specific figure</li>
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
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">14. User Profiles & Following</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        Every operative has a public profile (dossier) that showcases their activity and standing in the community. You can view any operative's profile by clicking their username anywhere on the platform.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Operative Dossiers:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Avatar &amp; Identity</strong> &mdash; Profile image, username, and operative rank title</li>
                        <li><strong>Join Date</strong> &mdash; When the operative first registered</li>
                        <li><strong>Submission Count</strong> &mdash; Total number of intel reports filed</li>
                        <li><strong>Recent Intel</strong> &mdash; A list of their most recent submissions with grades</li>
                        <li><strong>Follower / Following Counts</strong> &mdash; See how many operatives follow them and how many they follow. Click either count to expand an inline list showing usernames with avatars. Each name is clickable to visit that operative's dossier.</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Following & Messaging:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Follow</strong> &mdash; Click the "Follow" button on any operative's dossier to follow them. You will be notified when they post new intel.</li>
                        <li><strong>Unfollow</strong> &mdash; Click "Following" to unfollow and stop receiving notifications about their activity.</li>
                        <li><strong>\u{1F4AC} Send Message</strong> &mdash; Click "Send Message" on any operative's dossier to start a private DM conversation with them.</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Your Profile:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        Your own dossier is accessible by clicking your avatar or username in the top-right corner of the topbar. It shows your stats, submission history, and follower counts.
                    </p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>\u{1F4AC} New Message</strong> &mdash; On your own profile, click "New Message" to search for an operative by username and start a DM conversation directly from your dossier.</li>
                    </ul>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Tip: You can also start DMs from the "DMs & Group Chats" section, or click any operative's username anywhere on the platform to visit their dossier and message them.</p>
                </div>

                <!-- 14. FLAGGING A POST -->
                <div id="doc-flagging" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">15. Flagging a Post</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        If you encounter a broadcast that violates community guidelines or contains inappropriate content, you can flag it for admin review. Flagging is anonymous to the post author &mdash; they will not be notified that their post was flagged.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>How to Flag:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Click the <strong>\u{1F6A9} Report</strong> button on any broadcast in the Community Feed</li>
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

                <!-- COLLECTION TRACKER -->
                <div id="doc-collection-tracker" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">Collection Tracker</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The <strong>Collection Tracker</strong> lets you manage your personal figure inventory from the Dashboard. Track which figures you own, want, have available for trade, or have sold &mdash; and see the total market value of your collection at a glance.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Adding Figures to Your Collection:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Navigate to any figure's detail page via Search or the Figure Leaderboard</li>
                        <li>Use the collection status buttons to mark it as <strong>Owned</strong>, <strong>Wishlist</strong>, <strong>For Trade</strong>, or <strong>Sold</strong></li>
                        <li>Owned, Wishlist, and Sold statuses are applied instantly</li>
                        <li><strong>For Trade</strong> listings require validation by an Admin or Platinum member before appearing publicly</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>My Collection Tab (Dashboard):</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Stat Cards</strong> &mdash; Market Value, Total MSRP, Gain/Loss, and Items Owned for your collection</li>
                        <li><strong>Value Chart</strong> &mdash; Line graph showing how your collection's total market value changes over time</li>
                        <li><strong>Filter Buttons</strong> &mdash; Filter your collection by status (All, Owned, Wishlist, For Trade, Sold)</li>
                        <li><strong>Collection Table</strong> &mdash; Sortable table with figure name, brand, class, current market value, and status</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Public Collection:</strong></p>
                    <p style="color:var(--text-secondary); line-height:1.8; margin-bottom:1rem;">
                        Your collection is visible on your public profile (dossier). Other operatives can see your owned figures, wishlist, and validated trade listings. Unvalidated trade listings are hidden from public view until approved.
                    </p>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Market values are based on the latest secondary market transaction data. Figures without price data will show a dash (&mdash;) in the Value column.</p>
                </div>

                <!-- PLATINUM BADGE & TRADE VALIDATION -->
                <div id="doc-platinum-badge" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">Platinum Badge & Trade Validation</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        <strong>Platinum</strong> is an elevated community status granted by admins to trusted, experienced operatives. Platinum members are recognized with a <span style="color:#a78bfa;">\u{1F48E}</span> diamond badge displayed next to their username across the platform.
                    </p>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Platinum Privileges:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Trade Validation</strong> &mdash; Review and approve or reject pending "For Trade" listings from other operatives</li>
                        <li><strong>Pending Trades Queue</strong> &mdash; Access the pending trade listings in the Admin Panel</li>
                        <li><strong>Visual Badge</strong> &mdash; Diamond badge shown on profiles, leaderboards, feed posts, and chat messages</li>
                    </ul>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Trade Validation Process:</strong></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>When an operative marks a figure as "For Trade," the listing enters a <strong>pending</strong> state</li>
                        <li>Admin and Platinum members are notified and can review pending listings</li>
                        <li><strong>Approve</strong> &mdash; The listing becomes publicly visible on the operative's profile and figure detail page</li>
                        <li><strong>Reject</strong> &mdash; The listing is removed and the operative is notified</li>
                        <li>All validation actions are recorded in the audit log</li>
                    </ul>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Platinum status is managed by platform admins and owners via the Admin Panel user management section.</p>
                </div>

                ${isAdmin ? `
                <!-- 15. ADMIN PANEL -->
                <div id="doc-admin" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">16. Admin Panel</h3>
                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:1rem;">
                        The Admin Panel is visible to operatives with the <strong>Owner</strong>, <strong>Admin</strong>, or <strong>Moderator</strong> role. Access and capabilities depend on your permission level.
                    </p>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Permission Roles:</strong></p>
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:1rem;">
                        <thead>
                            <tr style="text-align:left; border-bottom:2px solid var(--border-light);">
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Role</th>
                                <th style="padding:0.6rem 1rem; color:var(--text-muted); font-weight:600;">Access Level</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600; color:#a855f7;">&#11088; Owner</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Full platform control. Can promote users to Admin. Protected from demotion or deletion.</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600; color:#fbbf24;">&#9733; Admin</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Full panel access: users, figures, brands, analytics, flags, leaderboard controls. Can assign Analyst and Moderator roles.</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600; color:#3b82f6;">&#128737;&#65039; Moderator</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Analytics dashboard, flag management, and leaderboard visibility toggles. Cannot manage users, figures, or brands.</td></tr>
                            <tr><td style="padding:0.6rem 1rem; font-weight:600; color:var(--accent);">Analyst</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Standard operative. No admin panel access.</td></tr>
                        </tbody>
                    </table>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Analytics Dashboard:</strong> <span style="color:var(--text-muted); font-size:0.85rem;">(All staff roles)</span></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Total figures, users, submissions, and posts at a glance</li>
                        <li>Top contributors ranked by submission count</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Leaderboard Controls:</strong> <span style="color:var(--text-muted); font-size:0.85rem;">(Moderator+)</span></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Visibility Toggle</strong> &mdash; Hide or show figures on the public Figure Leaderboard (Moderator+)</li>
                        <li><strong>Pin Toggle</strong> &mdash; Pin figures to the top of the leaderboard (Admin only)</li>
                        <li><strong>Rank Override</strong> &mdash; Manually set a figure's leaderboard position (Admin only)</li>
                        <li><strong>Category</strong> &mdash; Assign figures to leaderboard categories like "rising" or "sleeper" (Admin only)</li>
                        <li>Searchable table with all figures and their current leaderboard settings</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Flagged Posts Queue:</strong> <span style="color:var(--text-muted); font-size:0.85rem;">(Moderator+)</span></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Review broadcasts reported by the community</li>
                        <li>View the post content, flag count, and reporter reasons</li>
                        <li>Dismiss flags if the content is acceptable</li>
                        <li>Delete the flagged broadcast if it violates community guidelines</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Figure Management:</strong> <span style="color:var(--text-muted); font-size:0.85rem;">(Admin only)</span></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Edit figure details (name, brand, class tier, product line, MSRP)</li>
                        <li>Merge duplicate figures</li>
                        <li>Delete figures and all associated intel reports</li>
                        <li><strong>Search &amp; Pagination</strong> &mdash; Search bar to filter figures by name or brand, with paginated results (20 per page)</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>User Management:</strong> <span style="color:var(--text-muted); font-size:0.85rem;">(Admin only)</span></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li>Add new users manually with a selected role</li>
                        <li>Assign roles via dropdown: Analyst, Moderator, or Admin (only Owner can promote to Admin)</li>
                        <li>Suspend or reinstate user accounts</li>
                        <li>Reset a user's password (admin backup)</li>
                        <li>Delete user accounts permanently</li>
                        <li>Higher-ranked users are protected from actions by lower-ranked users</li>
                        <li><strong>Search &amp; Pagination</strong> &mdash; Search bar to filter users by username or email, with paginated results (20 per page)</li>
                    </ul>

                    <p style="color:var(--text-primary); line-height:1.8; margin-bottom:0.75rem;"><strong>Brand Management:</strong> <span style="color:var(--text-muted); font-size:0.85rem;">(Admin only)</span></p>
                    <ul style="color:var(--text-secondary); line-height:2; padding-left:1.5rem; margin-bottom:1rem;">
                        <li><strong>Pending Requests</strong> &mdash; Approve or reject brand submissions from non-admin operatives</li>
                        <li><strong>Approved Brands</strong> &mdash; View, rename, add, or remove brands from the approved list</li>
                    </ul>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-top:1rem;">The Owner account is protected and cannot be demoted, suspended, or deleted through the admin panel.</p>
                </div>

                <!-- 16. SECURITY & AUTHENTICATION -->
                <div id="doc-security" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">17. Security & Authentication</h3>
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
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">18. SOC 2 Alignment</h3>
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
                ` : ''}

                <!-- GLOSSARY -->
                <div id="doc-glossary" class="card" style="margin-bottom:2rem;">
                    <h3 style="text-transform:uppercase; letter-spacing:0.05em; font-size:1.1rem; color:var(--text-secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;">${isAdmin ? '18' : '15'}. Glossary</h3>
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
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Community Feed</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The social timeline / news feed</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Broadcast</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A post on the Community Feed</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">DM / Group Chat</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A private encrypted channel (DM or group chat)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Secure Channel</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A direct message (DM) between two operatives</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Commander</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The owner/creator of a DM or Group Chat channel</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Market Pulse</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The analytics dashboard showing market trends</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">DTS (Data Toyz Trading Score)</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The market sentiment portion of a grade (0&ndash;100)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Approval Score</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">The physical quality percentage (0&ndash;100)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Password</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Your account password</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Class Tier</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Figure size class (Deluxe, Voyager, Leader, Commander, Masterpiece)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Field Evidence</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Photos uploaded with intel reports</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Dossier</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A user's public profile page</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Clearance Level</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">User role (Analyst or Admin)</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">@-Mention</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Tagging another operative with @username to notify them; autocomplete suggests matching usernames as you type</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">@everyone</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Special mention that sends a notification to all operatives on the platform</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Follow</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Subscribe to another operative's activity to receive notifications</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Flag</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Report a broadcast for admin review</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Toast</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Brief confirmation message that appears at the top of the screen</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Deep Link</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">A URL that links directly to a specific broadcast or figure</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Collection</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Your personal inventory of figures tracked as Owned, Wishlist, For Trade, or Sold</td></tr>
                            <tr style="border-bottom:1px solid var(--border-light);"><td style="padding:0.6rem 1rem; font-weight:600;">Platinum</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Elevated community status granting trade validation privileges and a diamond badge</td></tr>
                            <tr><td style="padding:0.6rem 1rem; font-weight:600;">Trade Validation</td><td style="padding:0.6rem 1rem; color:var(--text-secondary);">Admin/Platinum review process for approving "For Trade" listings before public visibility</td></tr>
                        </tbody>
                    </table>
                </div>

            </div>
        `;
};
