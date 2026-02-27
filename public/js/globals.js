// globals.js — Shared utilities and constants

const API_URL = '/api';
let MOCK_FIGURES = [];

// PWA: Unregister stale service workers (SW disabled during active development)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
    });
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

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
        return `<span class="mention-link user-link" onclick="event.stopPropagation(); app.viewUserProfile('${username}')" style="color:var(--accent); cursor:pointer; font-weight:600;">@${username}</span>`;
    });
}

// Render @[Figure Name] as clickable figure links (runs AFTER escapeHTML + renderMentions)
function renderFigureLinks(html) {
    return html.replace(/@\[([^\]]+)\]/g, (match, rawName) => {
        const name = rawName.trim();
        const figure = MOCK_FIGURES.find(f => f.name.toLowerCase() === name.toLowerCase());
        if (figure) {
            return `<span class="figure-link found" onclick="event.stopPropagation(); app.selectTarget(${figure.id})" title="View scorecard">${escapeHTML(figure.name)}</span>`;
        } else {
            const safeName = escapeHTML(name).replace(/'/g, "\\'");
            return `<span class="figure-link not-found" onclick="event.stopPropagation(); app.currentView='search'; app.renderApp(); setTimeout(()=>{const el=document.getElementById('searchInput');if(el){el.value='${safeName}';el.dispatchEvent(new Event('keyup'));}},100);" title="Search for this figure">${escapeHTML(name)}</span>`;
        }
    });
}

// Auto-insert brackets when user types @ for figure linking
function setupFigureLinkHelper(el) {
    el.addEventListener('input', function(e) {
        if (e.data === '@') {
            const pos = this.selectionStart;
            const val = this.value;
            // Only auto-insert if next char isn't already [
            if (val[pos] !== '[') {
                this.value = val.slice(0, pos) + '[]' + val.slice(pos);
                this.selectionStart = this.selectionEnd = pos + 1; // cursor between [ and ]
            }
        }
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
