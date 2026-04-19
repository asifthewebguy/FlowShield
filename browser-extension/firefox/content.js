// FlowShield Content Script
// Runs on flowshield.app pages. Syncs the web app's localStorage token
// to the extension so the two stay in sync automatically.

function pushToken() {
  const token = localStorage.getItem('token');

  // Write directly to storage so the popup finds the token immediately,
  // bypassing the Firefox MV2 event-page message-passing race entirely.
  const storageOp = token
    ? chrome.storage.local.set({ token })
    : chrome.storage.local.remove('token');

  storageOp.then(() => {
    // Also notify background so it can refresh session/prefs data.
    // Fire-and-forget — if the event page isn't awake yet that's fine;
    // the popup's FORCE_POLL_SESSION will trigger the fetch instead.
    chrome.runtime.sendMessage(
      token ? { type: 'TOKEN_UPDATED', token } : { type: 'TOKEN_CLEARED' },
      () => void chrome.runtime.lastError
    );
  });
}

// Push on load
pushToken();

// Push whenever localStorage changes (login / logout on this tab)
window.addEventListener('storage', (e) => {
  if (e.key === 'token') {
    pushToken();
  }
});
