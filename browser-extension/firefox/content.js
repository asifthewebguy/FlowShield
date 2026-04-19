// FlowShield Content Script
// Runs on flowshield.app pages. Syncs the web app's localStorage token
// to the extension so the two stay in sync automatically.

// Popup pulls the token on demand via GET_TOKEN (reliable — no race condition).
// SET_TOKEN lets a popup login propagate back to the web app's localStorage.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_TOKEN') {
    sendResponse({ token: localStorage.getItem('token') || null });
    return true;
  }
  if (msg.type === 'SET_TOKEN') {
    if (msg.token) localStorage.setItem('token', msg.token);
    else           localStorage.removeItem('token');
    sendResponse({ ok: true });
    return true;
  }
});

// Best-effort push on load and on storage changes (tab-to-extension sync).
function pushToken() {
  const token = localStorage.getItem('token');
  browser.storage.local
    .set(token ? { token } : {})
    .catch(() => {});
  if (!token) browser.storage.local.remove('token').catch(() => {});
}

pushToken();

window.addEventListener('storage', (e) => {
  if (e.key === 'token') pushToken();
});
