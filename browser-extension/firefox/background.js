// FlowShield Background Event Page (Manifest V2 — Firefox)
// Tracks active tab time, syncs to API, updates badge with session timer.

const API_BASE = 'https://flowshield.app';
const SYNC_INTERVAL_MINUTES = 1;
const SESSION_POLL_SECONDS  = 30;

// ─── State ────────────────────────────────────────────────────────────────────

let currentTabId  = null;
let currentUrl    = '';
let currentDomain = '';
let tabStartTime  = null;
let pendingLogs   = [];
let activeSession = null;
let distractions  = [];

// ─── Persistence helpers ──────────────────────────────────────────────────────

const MAX_PENDING_LOGS = 500; // matches desktop's offline-queue bound

async function persistPendingLogs() {
  if (pendingLogs.length > MAX_PENDING_LOGS) {
    pendingLogs = pendingLogs.slice(-MAX_PENDING_LOGS); // keep newest
  }
  await browser.storage.local.set({ pendingLogs });
}

async function restorePendingLogs() {
  const { pendingLogs: stored } = await browser.storage.local.get('pendingLogs');
  if (Array.isArray(stored) && stored.length) {
    pendingLogs = [...stored, ...pendingLogs];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken() {
  const data = await browser.storage.local.get('token');
  return data.token || null;
}

function domainFromUrl(url) {
  if (!url || url.startsWith('moz-extension://') || url.startsWith('about:')) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function categoryForDomain(domain) {
  if (!domain) return 'Unknown';
  const lc = domain.toLowerCase();
  if (/github|gitlab|stackoverflow|developer|docs\.|devdocs/.test(lc)) return 'Development';
  if (/youtube|netflix|twitch|hulu|disneyplus|spotify/.test(lc))        return 'Entertainment';
  if (/twitter|x\.com|facebook|instagram|tiktok|reddit|linkedin/.test(lc)) return 'Social Media';
  if (/gmail|outlook|mail\.|notion|slack|teams|zoom/.test(lc))          return 'Communication';
  if (/google\.com|bing|duckduckgo|search/.test(lc))                    return 'Browsing';
  if (/figma|canva|adobe|sketch/.test(lc))                              return 'Creative';
  return 'Browsing';
}

function isDistraction(domain) {
  if (!domain || !distractions.length) return false;
  return distractions.some(d => domain.includes(d.toLowerCase()));
}

function sessionRemainingSeconds() {
  if (!activeSession) return null;
  const elapsed = Math.floor((Date.now() - new Date(activeSession.startTime).getTime()) / 1000);
  return Math.max(0, activeSession.plannedDuration * 60 - elapsed);
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
  await browser.browserAction.setBadgeText({ text });
  await browser.browserAction.setBadgeBackgroundColor({ color });
}

// ─── Tab tracking ─────────────────────────────────────────────────────────────

function flushCurrentTab() {
  if (!currentDomain || !tabStartTime) return;
  const duration = Math.floor((Date.now() - tabStartTime) / 1000);
  if (duration < 2) return;
  pendingLogs.push({
    timestamp:       new Date(tabStartTime).toISOString(),
    durationSeconds: duration,
    applicationName: currentDomain,
    processName:     'firefox',
    windowTitle:     currentDomain,
    url:             currentUrl,
    category:        categoryForDomain(currentDomain),
    activityLevel:   50,
    sessionId:       activeSession?.id || null,
  });
}

function startTrackingTab(tabId, url) {
  flushCurrentTab();
  currentTabId  = tabId;
  currentUrl    = url || '';
  currentDomain = domainFromUrl(url) || '';
  tabStartTime  = Date.now();
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
      await browser.storage.local.remove('token');
      pendingLogs = [...logsToSend, ...pendingLogs];
    } else if (!res.ok) {
      // Transient error — put logs back for next sync
      pendingLogs = [...logsToSend, ...pendingLogs];
    }
  } catch {
    pendingLogs = [...logsToSend, ...pendingLogs];
  }

  // Persist survivors so an event-page restart doesn't lose them.
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
      await browser.storage.local.remove('token');
      activeSession = null;
      updateBadge();
      return;
    }
    if (!res.ok) return;
    const { sessions = [] } = await res.json();
    activeSession = sessions.find(s => !s.completed && !s.endTime) || null;
    updateBadge();
  } catch { /* silently fail */ }
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
    await browser.storage.local.set({ distractions });
  } catch { /* silently fail */ }
}

// ─── Alarms ───────────────────────────────────────────────────────────────────

browser.alarms.create('syncActivity',    { periodInMinutes: SYNC_INTERVAL_MINUTES });
browser.alarms.create('pollSession',     { periodInMinutes: SESSION_POLL_SECONDS / 60 });
browser.alarms.create('pollPreferences', { periodInMinutes: 15 });

browser.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'syncActivity') {
    flushCurrentTab();
    await syncActivities();
    tabStartTime = Date.now();
  }
  if (alarm.name === 'pollSession')     await fetchActiveSession();
  if (alarm.name === 'pollPreferences') await fetchUserPreferences();
});

// ─── Tab listeners ────────────────────────────────────────────────────────────

browser.tabs.onActivated.addListener(async info => {
  try {
    const tab = await browser.tabs.get(info.tabId);
    startTrackingTab(info.tabId, tab.url || '');
  } catch { /* tab closed */ }
});

browser.webNavigation.onCompleted.addListener(details => {
  if (details.frameId !== 0) return;
  if (details.tabId === currentTabId) startTrackingTab(details.tabId, details.url);
});

browser.tabs.onRemoved.addListener(tabId => {
  if (tabId === currentTabId) {
    flushCurrentTab();
    currentTabId = null; currentUrl = ''; currentDomain = ''; tabStartTime = null;
  }
});

// ─── Messages ─────────────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    sendResponse({ activeSession, currentDomain,
      isDistraction: isDistraction(currentDomain),
      remainingSeconds: sessionRemainingSeconds() });
    return true;
  }
  if (msg.type === 'TOKEN_UPDATED') {
    (async () => {
      await fetchActiveSession();
      await fetchUserPreferences();
      await syncActivities(); // replay logs preserved across the logged-out period
    })().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'TOKEN_CLEARED') {
    browser.storage.local.remove('token').then(() => { activeSession = null; updateBadge(); });
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
      await browser.storage.local.remove(['token', 'user', 'pendingLogs']);
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
    fetchActiveSession().then(() => sendResponse({
      activeSession, currentDomain,
      isDistraction: isDistraction(currentDomain),
      remainingSeconds: sessionRemainingSeconds(),
    }));
    return true;
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  await restorePendingLogs();
  const stored = await browser.storage.local.get(['distractions']);
  distractions = stored.distractions || [];
  await fetchActiveSession();
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) startTrackingTab(tab.id, tab.url || '');
  } catch { /* no active tab */ }
})();
