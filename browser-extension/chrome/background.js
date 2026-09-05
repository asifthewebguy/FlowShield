// FlowShield Background Service Worker (Manifest V3)
// Tracks active tab time, syncs to API, updates badge with session timer.

const API_BASE = 'https://flowshield.app';
const SYNC_INTERVAL_MINUTES = 1;    // sync activity every 1 min
const SESSION_POLL_SECONDS  = 30;   // refresh active session every 30s

// ─── State ────────────────────────────────────────────────────────────────────

let currentTabId   = null;
let currentUrl     = '';
let currentDomain  = '';
let tabStartTime   = null;
let pendingLogs    = [];    // buffered before next sync
let activeSession  = null;  // { id, plannedDuration, startTime, sessionType }
let distractions   = [];    // from user preferences

// ─── Persistence helpers ──────────────────────────────────────────────────────

const MAX_PENDING_LOGS = 500; // matches desktop's offline-queue bound

async function persistPendingLogs() {
  if (pendingLogs.length > MAX_PENDING_LOGS) {
    pendingLogs = pendingLogs.slice(-MAX_PENDING_LOGS); // keep newest
  }
  await chrome.storage.local.set({ pendingLogs });
}

async function restorePendingLogs() {
  const { pendingLogs: stored } = await chrome.storage.local.get('pendingLogs');
  if (Array.isArray(stored) && stored.length) {
    pendingLogs = [...stored, ...pendingLogs];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken() {
  const data = await chrome.storage.local.get('token');
  return data.token || null;
}

function domainFromUrl(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function categoryForDomain(domain) {
  if (!domain) return 'Unknown';
  const lc = domain.toLowerCase();
  if (/github|gitlab|stackoverflow|developer|docs\.|devdocs/.test(lc)) return 'Development';
  if (/youtube|netflix|twitch|hulu|disneyplus|spotify/.test(lc)) return 'Entertainment';
  if (/twitter|x\.com|facebook|instagram|tiktok|reddit|linkedin/.test(lc)) return 'Social Media';
  if (/gmail|outlook|mail\.|notion|slack|teams|zoom/.test(lc)) return 'Communication';
  if (/google\.com|bing|duckduckgo|search/.test(lc)) return 'Browsing';
  if (/figma|canva|adobe|sketch/.test(lc)) return 'Creative';
  return 'Browsing';
}

function isDistraction(domain) {
  if (!domain || !distractions.length) return false;
  return distractions.some(d => domain.includes(d.toLowerCase()));
}

function sessionRemainingSeconds() {
  if (!activeSession) return null;
  const elapsed = Math.floor((Date.now() - new Date(activeSession.startTime).getTime()) / 1000);
  const total   = activeSession.plannedDuration * 60;
  return Math.max(0, total - elapsed);
}

function formatBadge(seconds) {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m}m` : '<1m';
}

async function updateBadge() {
  const remaining = sessionRemainingSeconds();
  const text  = formatBadge(remaining);
  const color = remaining !== null && isDistraction(currentDomain) ? '#ef4444' : '#0ea5e9';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

// ─── Tab tracking ─────────────────────────────────────────────────────────────

function flushCurrentTab() {
  if (!currentDomain || !tabStartTime) return;
  const duration = Math.floor((Date.now() - tabStartTime) / 1000);
  if (duration < 2) return; // ignore sub-2s blips

  pendingLogs.push({
    timestamp:       new Date(tabStartTime).toISOString(),
    durationSeconds: duration,
    applicationName: currentDomain,
    processName:     'chrome',
    windowTitle:     currentDomain,
    url:             currentUrl,
    category:        categoryForDomain(currentDomain),
    activityLevel:   50,
    sessionId:       activeSession?.id || null,
  });
}

function startTrackingTab(tabId, url) {
  flushCurrentTab();
  currentTabId   = tabId;
  currentUrl     = url || '';
  currentDomain  = domainFromUrl(url) || '';
  tabStartTime   = Date.now();
  updateBadge();
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function syncActivities() {
  const token = await getToken();
  if (!token || !pendingLogs.length) return;

  const logsToSend = [...pendingLogs];
  pendingLogs = [];

  try {
    const res = await fetch(`${API_BASE}/api/activity/sync`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ source: 'browser', activities: logsToSend }),
    });
    if (res.status === 401) {
      // Token expired/revoked — clear it so popup shows login, but KEEP the
      // logs: they sync after re-login (TOKEN_UPDATED triggers a replay).
      await chrome.storage.local.remove('token');
      pendingLogs = [...logsToSend, ...pendingLogs];
    } else if (!res.ok) {
      // Transient error — put logs back for next sync
      pendingLogs = [...logsToSend, ...pendingLogs];
    }
  } catch {
    pendingLogs = [...logsToSend, ...pendingLogs];
  }

  // Persist survivors so an MV3 worker restart doesn't lose them.
  await persistPendingLogs();
}

async function fetchActiveSession() {
  const token = await getToken();
  if (!token) { activeSession = null; updateBadge(); return; }

  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`${API_BASE}/api/sessions?date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      // Token expired or logged out — clear stored token
      await chrome.storage.local.remove('token');
      activeSession = null;
      updateBadge();
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    const sessions = data.sessions || [];
    activeSession = sessions.find(s => !s.completed && !s.endTime) || null;
    updateBadge();
  } catch {
    // silently fail
  }
}

async function fetchUserPreferences() {
  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/user/preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    distractions = data.preferences?.primaryDistractions || [];
    await chrome.storage.local.set({ distractions });
  } catch {
    // silently fail
  }
}

async function fetchTasks() {
  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    await chrome.storage.local.set({ tasks: data.tasks || [] });
  } catch {
    // silently fail
  }
}

// ─── Alarms ───────────────────────────────────────────────────────────────────

chrome.alarms.create('syncActivity',    { periodInMinutes: SYNC_INTERVAL_MINUTES });
chrome.alarms.create('pollSession',     { periodInMinutes: SESSION_POLL_SECONDS / 60 });
chrome.alarms.create('pollPreferences', { periodInMinutes: 15 });
chrome.alarms.create('pollTasks',       { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncActivity') {
    flushCurrentTab();
    await syncActivities();
    tabStartTime = Date.now(); // reset timer after flush
  }
  if (alarm.name === 'pollSession') {
    await fetchActiveSession();
  }
  if (alarm.name === 'pollPreferences') {
    await fetchUserPreferences();
  }
  if (alarm.name === 'pollTasks') {
    await fetchTasks();
  }
});

// ─── Tab event listeners ──────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (info) => {
  try {
    const tab = await chrome.tabs.get(info.tabId);
    startTrackingTab(info.tabId, tab.url || '');
  } catch {
    // tab may have closed
  }
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return; // top-level frame only
  if (details.tabId === currentTabId) {
    startTrackingTab(details.tabId, details.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    flushCurrentTab();
    currentTabId  = null;
    currentUrl    = '';
    currentDomain = '';
    tabStartTime  = null;
  }
});

// ─── Messages from popup ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    sendResponse({
      activeSession,
      currentDomain,
      isDistraction: isDistraction(currentDomain),
      remainingSeconds: sessionRemainingSeconds(),
    });
    return true;
  }
  if (msg.type === 'TOKEN_UPDATED') {
    // Content script sends the actual token; popup just signals an update
    (msg.token
      ? chrome.storage.local.set({ token: msg.token })
      : Promise.resolve()
    ).then(async () => {
      await fetchActiveSession();
      await fetchUserPreferences();
      await fetchTasks();
      await syncActivities(); // replay logs preserved across the logged-out period
    });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'TOKEN_CLEARED') {
    chrome.storage.local.remove('token').then(() => {
      activeSession = null;
      updateBadge();
    });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'LOGOUT') {
    (async () => {
      // Explicit logout: last-chance sync while the token still works,
      // then clear all auth + buffered state.
      flushCurrentTab();
      await syncActivities();
      pendingLogs = [];
      await chrome.storage.local.remove(['token', 'user', 'pendingLogs', 'tasks']);
      activeSession = null;
      updateBadge();
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg.type === 'FORCE_SYNC') {
    flushCurrentTab();
    syncActivities().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'FORCE_POLL_SESSION') {
    // Force an immediate session fetch so popup always opens with fresh data
    fetchActiveSession().then(() => sendResponse({
      activeSession,
      currentDomain,
      isDistraction: isDistraction(currentDomain),
      remainingSeconds: sessionRemainingSeconds(),
    }));
    return true;
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  await restorePendingLogs();
  const stored = await chrome.storage.local.get(['distractions']);
  distractions = stored.distractions || [];
  await fetchActiveSession();
  // Track the currently active tab on startup
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) startTrackingTab(tab.id, tab.url || '');
  } catch {
    // no active tab
  }
})();
