// FlowShield Content Script
// Runs on flowshield.app pages. Syncs the web app's localStorage token
// to the extension so the two stay in sync automatically.

function pushToken() {
  const token = localStorage.getItem('token');
  if (token) {
    chrome.runtime.sendMessage({ type: 'TOKEN_UPDATED', token });
  } else {
    chrome.runtime.sendMessage({ type: 'TOKEN_CLEARED' });
  }
}

// Push on load
pushToken();

// Push whenever localStorage changes (login / logout on this tab)
window.addEventListener('storage', (e) => {
  if (e.key === 'token') {
    pushToken();
  }
});
