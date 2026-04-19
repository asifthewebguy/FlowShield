// FlowShield Content Script (Firefox MV2)
// Keeps extension storage in sync with the web app's localStorage token.

function syncToken() {
  const token = localStorage.getItem('token');
  if (token) {
    browser.storage.local.set({ token }).catch(() => {});
  } else {
    browser.storage.local.remove('token').catch(() => {});
  }
}

syncToken();

window.addEventListener('storage', e => {
  if (e.key === 'token') syncToken();
});
