// FlowShield Popup Script

const API_BASE = 'https://flowshield.app';
const CIRCUMFERENCE = 2 * Math.PI * 42; // ring-progress r=42

// ─── DOM refs ──────────────────────────────────────────────────────────────────
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

// ─── Helpers ───────────────────────────────────────────────────────────────────
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
  authError.textContent    = msg;
  authError.style.display  = '';
}

function clearError() {
  authError.style.display = 'none';
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  const { token } = await chrome.storage.local.get('token');
  if (token) {
    showScreen('main');
    // Force a fresh session fetch so the popup never shows stale cached data
    await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'FORCE_POLL_SESSION' }, resolve)
    );
    await refreshState();
    // Background may have cleared a stale/expired token during refreshState
    const { token: current } = await chrome.storage.local.get('token');
    if (!current) showScreen('auth');
  } else {
    showScreen('auth');
  }
}

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  btnLogin.disabled    = true;
  btnLogin.textContent = 'Signing in…';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:    inputEmail.value.trim(),
        password: inputPwd.value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Login failed');
      return;
    }

    await chrome.storage.local.set({ token: data.token, user: JSON.stringify(data.user) });
    // Notify background service worker
    chrome.runtime.sendMessage({ type: 'TOKEN_UPDATED' });
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
  await chrome.storage.local.remove(['token', 'user']);
  showScreen('auth');
});

// ─── Main state ────────────────────────────────────────────────────────────────
async function refreshState() {
  // Ask background worker for current state
  const state = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, resolve)
  );

  // Current tab
  if (state.currentDomain) {
    tabDomainDisplay.textContent = state.currentDomain;
    if (state.isDistraction) {
      tabDot.className = 'tab-dot distraction';
    } else {
      tabDot.className = 'tab-dot';
    }
  } else {
    tabDomainDisplay.textContent = '—';
  }

  // Distraction banner
  if (state.isDistraction && state.currentDomain) {
    distractionBanner.style.display = '';
    distractionDomain.textContent   = state.currentDomain;
  } else {
    distractionBanner.style.display = 'none';
  }

  // Session
  if (state.activeSession) {
    stateNoSession.style.display     = 'none';
    stateActiveSession.style.display = '';

    const session      = state.activeSession;
    const remaining    = state.remainingSeconds ?? 0;
    const totalSecs    = session.plannedDuration * 60;
    const elapsedSecs  = totalSecs - remaining;
    const fraction     = remaining / totalSecs;

    sessionTypeLabel.textContent = session.sessionType || 'WORK';
    timerDisplay.textContent     = formatTime(remaining);
    sessionElapsed.textContent   = `${Math.floor(elapsedSecs / 60)} min elapsed`;
    sessionPlanned.textContent   = `of ${session.plannedDuration} min`;
    setRingProgress(fraction);
  } else {
    stateNoSession.style.display     = '';
    stateActiveSession.style.display = 'none';
    setRingProgress(1);
  }
}

// ─── Sync button ───────────────────────────────────────────────────────────────
btnSync.addEventListener('click', async () => {
  btnSync.disabled    = true;
  btnSync.textContent = 'Syncing…';
  await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'FORCE_SYNC' }, resolve)
  );
  btnSync.disabled    = false;
  btnSync.textContent = '✓ Synced!';
  setTimeout(() => { btnSync.textContent = 'Sync Activity Now'; }, 2000);
});

// ─── Live timer tick ───────────────────────────────────────────────────────────
let tickInterval = null;

function startTick() {
  if (tickInterval) return;
  tickInterval = setInterval(async () => {
    const state = await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, resolve)
    );
    if (state.activeSession && state.remainingSeconds !== null) {
      const remaining   = state.remainingSeconds;
      const totalSecs   = state.activeSession.plannedDuration * 60;
      timerDisplay.textContent = formatTime(remaining);
      setRingProgress(remaining / totalSecs);
      sessionElapsed.textContent = `${Math.floor((totalSecs - remaining) / 60)} min elapsed`;
    }
  }, 1000);
}

// ─── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  startTick();
});
