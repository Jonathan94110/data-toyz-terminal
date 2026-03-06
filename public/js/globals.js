// globals.js — Shared utilities and constants

const API_URL = '/api';
let MOCK_FIGURES = [];

// Service worker cleanup already runs inline in index.html <head> (earliest possible)

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
        if (username === 'everyone') {
            return `<span class="mention-link" style="color:#ff8e3c; cursor:default; font-weight:700;">@everyone</span>`;
        }
        return `<span class="mention-link user-link" onclick="event.stopPropagation(); app.viewUserProfile('${username}')" style="color:var(--accent); cursor:pointer; font-weight:600;">@${username}</span>`;
    });
}

// Render *[Figure Name] as clickable figure links (runs AFTER escapeHTML + renderMentions)
// Also supports legacy @[Figure Name] syntax for backward compatibility
// Also auto-links bare figure names that exist in the catalog (longest match first)
function renderFigureLinks(html) {
    // Step 1: Handle explicit *[Figure Name] (new) and @[Figure Name] (legacy) syntax
    html = html.replace(/(?:\*|@)\[([^\]]+)\]/g, (match, rawName) => {
        const name = rawName.trim();
        const figure = MOCK_FIGURES.find(f => f.name.toLowerCase() === name.toLowerCase());
        if (figure) {
            return `<span class="figure-link found" onclick="event.stopPropagation(); app.selectTarget(${figure.id})" title="View figure">${escapeHTML(figure.name)}</span>`;
        } else {
            const safeName = escapeHTML(name).replace(/'/g, "\\'");
            return `<span class="figure-link not-found" onclick="event.stopPropagation(); app.currentView='search'; app.renderApp(); setTimeout(()=>{const el=document.getElementById('searchInput');if(el){el.value='${safeName}';el.dispatchEvent(new Event('keyup'));}},100);" title="Search for this figure">${escapeHTML(name)}</span>`;
        }
    });

    // Step 2: Auto-link bare figure names (longest match first to avoid partial replacements)
    if (MOCK_FIGURES && MOCK_FIGURES.length > 0) {
        const sorted = MOCK_FIGURES.slice().sort((a, b) => b.name.length - a.name.length);
        for (const fig of sorted) {
            if (fig.name.length < 4) continue; // skip very short names to avoid false matches
            const escaped = fig.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(?<![\\w">])${escaped}(?![\\w<])`, 'gi');
            html = html.replace(regex, (match) => {
                return `<span class="figure-link found" onclick="event.stopPropagation(); app.selectTarget(${fig.id})" title="View figure">${match}</span>`;
            });
        }
    }

    return html;
}

// Auto-insert brackets + live autocomplete when typing *[...] for figure linking
function setupFigureLinkHelper(el) {
    // Cleanup any previous helper on this element
    if (el._acFigureDestroy) el._acFigureDestroy();
    let dropdown = null;
    let selectedIdx = -1;

    function getDropdown() {
        // If cached dropdown was removed from DOM (cleanup on re-render), reset
        if (dropdown && !dropdown.parentNode) dropdown = null;
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'figure-autocomplete';
            document.body.appendChild(dropdown);
        }
        const rect = el.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
        return dropdown;
    }

    function hideDropdown() {
        if (dropdown) dropdown.style.display = 'none';
        selectedIdx = -1;
    }

    // Expose destroy for cleanup when element is removed from DOM
    el._acFigureDestroy = function() {
        if (dropdown && dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
        dropdown = null;
    };

    function isVisible() {
        return dropdown && dropdown.style.display === 'block';
    }

    // Detect if cursor is inside *[...] brackets and return the partial query
    function getBracketQuery() {
        const pos = el.selectionStart;
        const before = el.value.substring(0, pos);
        const openIdx = before.lastIndexOf('*[');
        if (openIdx === -1) return null;
        const partial = before.substring(openIdx + 2);
        if (partial.includes(']')) return null;
        return partial;
    }

    function selectItem(name) {
        const val = el.value;
        const pos = el.selectionStart;
        const before = val.substring(0, pos);
        const openIdx = before.lastIndexOf('*[');
        const closeIdx = val.indexOf(']', pos);
        if (openIdx !== -1 && closeIdx !== -1) {
            el.value = val.substring(0, openIdx + 2) + name + val.substring(closeIdx);
            el.selectionStart = el.selectionEnd = openIdx + 2 + name.length + 1;
        }
        hideDropdown();
        el.focus();
    }

    function showMatches() {
        const query = getBracketQuery();
        if (query === null || query.length === 0) { hideDropdown(); return; }
        const q = query.toLowerCase();
        const matches = MOCK_FIGURES.filter(f => f.name.toLowerCase().includes(q)).slice(0, 6);
        if (matches.length === 0) { hideDropdown(); return; }

        selectedIdx = -1;
        const dd = getDropdown();
        dd.innerHTML = matches.map(f =>
            `<div class="figure-ac-item" data-name="${escapeHTML(f.name)}">
                <span class="figure-ac-name">${escapeHTML(f.name)}</span>
                <span class="figure-ac-brand">${escapeHTML(f.brand || '')}</span>
            </div>`
        ).join('');
        dd.style.display = 'block';

        dd.querySelectorAll('.figure-ac-item').forEach(item => {
            item.addEventListener('mousedown', function(ev) {
                ev.preventDefault();
                selectItem(this.dataset.name);
            });
        });
    }

    el.addEventListener('input', function(e) {
        // Auto-insert brackets on *
        if (e.data === '*') {
            const pos = this.selectionStart;
            const val = this.value;
            if (val[pos] !== '[') {
                this.value = val.slice(0, pos) + '[]' + val.slice(pos);
                this.selectionStart = this.selectionEnd = pos + 1;
            }
        }
        showMatches();
    });

    el.addEventListener('keydown', function(e) {
        if (!isVisible()) return;
        const items = dropdown.querySelectorAll('.figure-ac-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle('active', i === selectedIdx));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, 0);
            items.forEach((it, i) => it.classList.toggle('active', i === selectedIdx));
        } else if ((e.key === 'Enter' || e.key === 'Tab') && selectedIdx >= 0) {
            e.preventDefault();
            selectItem(items[selectedIdx].dataset.name);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideDropdown();
        }
    });

    el.addEventListener('blur', function() {
        setTimeout(hideDropdown, 150);
    });
}

// Live autocomplete for @mentions — searches users via API, always shows @everyone
function setupMentionHelper(el) {
    // Cleanup any previous helper on this element
    if (el._acMentionDestroy) el._acMentionDestroy();
    let dropdown = null;
    let selectedIdx = -1;
    let debounceTimer = null;

    function getDropdown() {
        // If cached dropdown was removed from DOM (cleanup on re-render), reset
        if (dropdown && !dropdown.parentNode) dropdown = null;
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'figure-autocomplete';
            document.body.appendChild(dropdown);
        }
        const rect = el.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
        return dropdown;
    }

    function hideDropdown() {
        if (dropdown) dropdown.style.display = 'none';
        selectedIdx = -1;
    }

    // Expose destroy for cleanup when element is removed from DOM
    el._acMentionDestroy = function() {
        clearTimeout(debounceTimer);
        if (dropdown && dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
        dropdown = null;
    };

    function isVisible() {
        return dropdown && dropdown.style.display === 'block';
    }

    // Detect if cursor is right after @... and return the partial query
    function getMentionQuery() {
        const pos = el.selectionStart;
        const before = el.value.substring(0, pos);
        const match = before.match(/@(\w*)$/);
        if (!match) return null;
        return match[1]; // partial username (can be empty string right after @)
    }

    function selectUser(username) {
        const pos = el.selectionStart;
        const before = el.value.substring(0, pos);
        const match = before.match(/@(\w*)$/);
        if (match) {
            const start = pos - match[1].length;
            el.value = before.substring(0, start) + username + ' ' + el.value.substring(pos);
            el.selectionStart = el.selectionEnd = start + username.length + 1;
        }
        hideDropdown();
        el.focus();
    }

    function renderResults(users, query) {
        selectedIdx = -1;
        const dd = getDropdown();
        // Always include @everyone if it matches
        let items = [];
        if ('everyone'.startsWith(query.toLowerCase())) {
            items.push({ username: 'everyone', label: '@everyone — notify all users' });
        }
        users.forEach(u => items.push({ username: u.username, label: u.username }));
        if (items.length === 0) { hideDropdown(); return; }

        dd.innerHTML = items.map(u =>
            `<div class="figure-ac-item" data-name="${escapeHTML(u.username)}">
                <span class="figure-ac-name" style="${u.username === 'everyone' ? 'color:#ff8e3c; font-weight:700;' : ''}">${escapeHTML(u.label)}</span>
            </div>`
        ).join('');
        dd.style.display = 'block';

        dd.querySelectorAll('.figure-ac-item').forEach(item => {
            item.addEventListener('mousedown', function(ev) {
                ev.preventDefault();
                selectUser(this.dataset.name);
            });
        });
    }

    async function showMatches() {
        const query = getMentionQuery();
        if (query === null) { hideDropdown(); return; }

        // Show @everyone immediately when query is empty
        if (query.length === 0) {
            renderResults([], '');
            return;
        }

        // Immediately show @everyone if it matches while waiting for API
        if ('everyone'.startsWith(query.toLowerCase())) {
            renderResults([], query);
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                const currentQuery = getMentionQuery();
                if (currentQuery === null) { hideDropdown(); return; }
                const resp = await fetch(`${API_URL}/users/search?q=${encodeURIComponent(currentQuery)}`, {
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('terminal_token') }
                });
                if (resp.ok) {
                    const users = await resp.json();
                    if (getMentionQuery() !== null) renderResults(users, currentQuery);
                } else {
                    // API error — still show @everyone if it matches
                    if (getMentionQuery() !== null) renderResults([], currentQuery);
                }
            } catch (e) {
                // Network error — still show @everyone if it matches
                const fallbackQuery = getMentionQuery();
                if (fallbackQuery !== null) renderResults([], fallbackQuery);
            }
        }, 150);
    }

    el.addEventListener('input', function() {
        showMatches();
    });

    el.addEventListener('keydown', function(e) {
        if (!isVisible()) return;
        const items = dropdown.querySelectorAll('.figure-ac-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle('active', i === selectedIdx));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, 0);
            items.forEach((it, i) => it.classList.toggle('active', i === selectedIdx));
        } else if ((e.key === 'Enter' || e.key === 'Tab') && selectedIdx >= 0) {
            e.preventDefault();
            selectUser(items[selectedIdx].dataset.name);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideDropdown();
        }
    });

    el.addEventListener('blur', function() {
        setTimeout(hideDropdown, 150);
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
