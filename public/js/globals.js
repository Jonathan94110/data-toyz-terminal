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
