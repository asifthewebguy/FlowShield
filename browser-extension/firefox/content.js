// FlowShield Content Script
// Runs on flowshield.app pages. Syncs the web app's localStorage token
// to the extension so the two stay in sync automatically.

function pushToken() {
  const token = localStorage.getItem('token');
  const msg = token
    ? { type: 'TOKEN_UPDATED', token }
    : { type: 'TOKEN_CLEARED' };

  // Firefox MV2 event pages may not be ready when the content script first
  // runs. Retry up to 2 times (with 1.5 s gap) if the background drops the
  // message before its onMessage listener is registered.
  function trySend(attempt) {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError && attempt < 2) {
        setTimeout(() => trySend(attempt + 1), 1500);
      }
    });
  }
  trySend(0);
}

// Push on load
pushToken();

// Push whenever localStorage changes (login / logout on this tab)
window.addEventListener('storage', (e) => {
  if (e.key === 'token') {
    pushToken();
  }
});
