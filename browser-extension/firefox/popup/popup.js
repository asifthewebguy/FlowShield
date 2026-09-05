// FlowShield Popup Script (Firefox MV2)

const API_BASE = 'https://flowshield.app';
const CIRCUMFERENCE = 2 * Math.PI * 42;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const screenAuth   = document.getElementById('screen-auth');
const screenMain   = document.getElementById('screen-main');
const btnLogout    = document.getElementById('btn-logout');
const formLogin    = document.getElementById('form-login');
const inputEmail   = document.getElementById('input-email');
const inputPwd     = document.getElementById('input-password');
const btnLogin     = document.getElementById('btn-login');
const authError    = document.getElementById('auth-error');

const distractionBanner = document.getElementById('distraction-banner');
const distractionDomain = document.getElementById('distraction-domain');

const stateNoSession     = document.getElementById('state-no-session');
const stateActiveSession = document.getElementById('state-active-session');
const sessionTypeLabel   = document.getElementById('session-type-label');
const timerDisplay       = document.getElementById('timer-display');
const ringProgress       = document.getElementById('ring-progress');
const sessionElapsed     = document.getElementById('session-elapsed');
const sessionPlanned     = document.getElementById('session-planned');
const btnSync            = document.getElementById('btn-sync');

const tabDomainDisplay = document.getElementById('tab-domain-display');
const tabDot           = document.getElementById('tab-dot');

const taskList = document.getElementById('task-list');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(Math.abs(seconds) / 60).toString().padStart(2, '0');
  const s = (Math.abs(seconds) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function setRingProgress(fraction) {
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction)));
  ringProgress.style.strokeDasharray  = CIRCUMFERENCE;
  ringProgress.style.strokeDashoffset = offset;
  ringProgress.style.stroke = fraction < 0.2 ? '#f97316' : '#0ea5e9';
}

function showScreen(name) {
  screenAuth.style.display = name === 'auth' ? '' : 'none';
  screenMain.style.display = name === 'main' ? '' : 'none';
  btnLogout.style.display  = name === 'main' ? '' : 'none';
}

function showError(msg) {
  authError.textContent   = msg;
  authError.style.display = '';
}

function clearError() {
  authError.style.display = 'none';
}

// ─── Token from page ──────────────────────────────────────────────────────────
// Read the token directly from the web app's localStorage via executeScript.
// This is the primary auth path — it works regardless of whether the content
// script has been injected, and avoids all event-page race conditions.
async function loadTokenFromPage() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab  = tabs && tabs[0];
    if (!tab || !tab.url || !tab.url.startsWith('https://flowshield.app/')) return;
    const results = await browser.tabs.executeScript(tab.id, {
      code: 'localStorage.getItem("token")',
    });
    const token = results && results[0];
    if (token) {
      await browser.storage.local.set({ token });
    }
  } catch {
    // Tab may not be accessible — fall through to stored token.
  }
}

// Write token back into the web app's localStorage so both stay in sync.
async function writeTokenToPage(token) {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab  = tabs && tabs[0];
    if (!tab || !tab.url || !tab.url.startsWith('https://flowshield.app/')) return;
    await browser.tabs.executeScript(tab.id, {
      code: `localStorage.setItem("token", ${JSON.stringify(token)})`,
    });
  } catch { /* ignore */ }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function checkAuth() {
  // Always try to read fresh token from the open flowshield.app tab first.
  await loadTokenFromPage();

  const { token } = await browser.storage.local.get('token');
  if (token) {
    showScreen('main');
    await new Promise(resolve =>
      browser.runtime.sendMessage({ type: 'FORCE_POLL_SESSION' }, resolve)
    );
    await refreshState();
    // Background clears token on 401 — re-check after the poll.
    const { token: current } = await browser.storage.local.get('token');
    if (!current) showScreen('auth');
  } else {
    showScreen('auth');
  }
}

formLogin.addEventListener('submit', async e => {
  e.preventDefault();
  clearError();
  btnLogin.disabled    = true;
  btnLogin.textContent = 'Signing in…';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: inputEmail.value.trim(), password: inputPwd.value }),
    });

    const data = await res.json();
    if (!res.ok) {
      showError(data.code === 'EMAIL_NOT_VERIFIED'
        ? 'Please verify your email. Check your inbox for the verification link.'
        : (data.error || 'Login failed'));
      return;
    }

    await browser.storage.local.set({ token: data.token, user: JSON.stringify(data.user) });
    await writeTokenToPage(data.token);
    browser.runtime.sendMessage({ type: 'TOKEN_UPDATED' });
    showScreen('main');
    await refreshState();
  } catch {
    showError('Network error — check your connection');
  } finally {
    btnLogin.disabled    = false;
    btnLogin.textContent = 'Sign In';
  }
});

btnLogout.addEventListener('click', async () => {
  await new Promise(resolve =>
    browser.runtime.sendMessage({ type: 'LOGOUT' }, resolve)
  );
  showScreen('auth');
});

// ─── Main state ───────────────────────────────────────────────────────────────
async function refreshState() {
  const state = await new Promise(resolve =>
    browser.runtime.sendMessage({ type: 'GET_STATE' }, resolve)
  );

  tabDomainDisplay.textContent = state.currentDomain || '—';
  tabDot.className = state.isDistraction ? 'tab-dot distraction' : 'tab-dot';

  if (state.isDistraction && state.currentDomain) {
    distractionBanner.style.display = '';
    distractionDomain.textContent   = state.currentDomain;
  } else {
    distractionBanner.style.display = 'none';
  }

  if (state.activeSession) {
    stateNoSession.style.display     = 'none';
    stateActiveSession.style.display = '';

    const remaining  = state.remainingSeconds ?? 0;
    const totalSecs  = state.activeSession.plannedDuration * 60;
    const elapsedSecs = totalSecs - remaining;

    sessionTypeLabel.textContent = state.activeSession.sessionType || 'WORK';
    timerDisplay.textContent     = formatTime(remaining);
    sessionElapsed.textContent   = `${Math.floor(elapsedSecs / 60)} min elapsed`;
    sessionPlanned.textContent   = `of ${state.activeSession.plannedDuration} min`;
    setRingProgress(remaining / totalSecs);
  } else {
    stateNoSession.style.display     = '';
    stateActiveSession.style.display = 'none';
    setRingProgress(1);
  }
}

// ─── Sync button ──────────────────────────────────────────────────────────────
btnSync.addEventListener('click', async () => {
  btnSync.disabled    = true;
  btnSync.textContent = 'Syncing…';
  await new Promise(resolve =>
    browser.runtime.sendMessage({ type: 'FORCE_SYNC' }, resolve)
  );
  btnSync.disabled    = false;
  btnSync.textContent = '✓ Synced!';
  setTimeout(() => { btnSync.textContent = 'Sync Activity Now'; }, 2000);
});

// ─── Tasks (read-only) ────────────────────────────────────────────────────────
async function renderTasks() {
  const { tasks } = await browser.storage.local.get('tasks');
  taskList.textContent = ''; // clear previous rows

  if (!Array.isArray(tasks) || tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tab-domain';
    empty.textContent = 'No tasks';
    taskList.appendChild(empty);
    return;
  }

  for (const task of tasks) {
    const row = document.createElement('div');
    row.className = 'tab-domain-row';

    const title = document.createElement('span');
    title.className = 'tab-domain';
    title.textContent = task.title;

    const status = document.createElement('span');
    status.className = 'tab-domain';
    status.textContent = task.status;

    row.appendChild(title);
    row.appendChild(status);
    taskList.appendChild(row);
  }
}

// ─── Live timer tick ──────────────────────────────────────────────────────────
let tickInterval = null;

function startTick() {
  if (tickInterval) return;
  tickInterval = setInterval(async () => {
    const state = await new Promise(resolve =>
      browser.runtime.sendMessage({ type: 'GET_STATE' }, resolve)
    );
    if (state.activeSession && state.remainingSeconds !== null) {
      const remaining  = state.remainingSeconds;
      const totalSecs  = state.activeSession.plannedDuration * 60;
      timerDisplay.textContent   = formatTime(remaining);
      sessionElapsed.textContent = `${Math.floor((totalSecs - remaining) / 60)} min elapsed`;
      setRingProgress(remaining / totalSecs);
    }
  }, 1000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await renderTasks();
  startTick();
});
