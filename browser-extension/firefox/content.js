// FlowShield Content Script
// Runs on flowshield.app pages. Syncs the web app's localStorage token
// to the extension so the two stay in sync automatically.

function pushToken() {
  const token = localStorage.getItem('token');
  const msg   = token ? { type: 'TOKEN_UPDATED', token } : { type: 'TOKEN_CLEARED' };

  // Use browser.* (always promise-based in Firefox) — chrome.storage.local.set()
  // does NOT return a Promise from a content script context in Firefox MV2.
  (token
    ? browser.storage.local.set({ token })
    : browser.storage.local.remove('token')
  ).then(() => {
    // Notify background so it can refresh session/prefs data. Fire-and-forget.
    browser.runtime.sendMessage(msg).catch(() => {});
  }).catch(() => {});
}

// Push on load
pushToken();

// Push whenever localStorage changes (login / logout on this tab)
window.addEventListener('storage', (e) => {
  if (e.key === 'token') {
    pushToken();
  }
});
