// ============================================================
// ProductivityPulse - Background Service Worker
// Tracks active tab time, classifies sites, stores analytics
// ============================================================

// --- Site Classification Database ---
const PRODUCTIVE_SITES = [
  'github.com', 'gitlab.com', 'stackoverflow.com', 'leetcode.com',
  'codepen.io', 'jsfiddle.net', 'codesandbox.io', 'replit.com',
  'developer.mozilla.org', 'docs.google.com', 'notion.so',
  'trello.com', 'asana.com', 'jira.atlassian.com', 'linear.app',
  'figma.com', 'sketch.com', 'coursera.org', 'udemy.com',
  'khanacademy.org', 'edx.org', 'medium.com', 'dev.to',
  'hashnode.com', 'freecodecamp.org', 'w3schools.com',
  'digitalocean.com', 'aws.amazon.com', 'cloud.google.com',
  'vercel.com', 'netlify.com', 'heroku.com', 'npmjs.com',
  'pypi.org', 'docs.python.org', 'reactjs.org', 'vuejs.org',
  'angular.io', 'typescriptlang.org', 'rust-lang.org',
  'go.dev', 'kotlinlang.org', 'swift.org', 'arxiv.org',
  'scholar.google.com', 'researchgate.net', 'pubmed.ncbi.nlm.nih.gov',
  'overleaf.com', 'wikipedia.org', 'britannica.com'
];

const UNPRODUCTIVE_SITES = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'tiktok.com', 'snapchat.com', 'reddit.com', 'pinterest.com',
  'tumblr.com', 'twitch.tv', 'discord.com', 'whatsapp.com',
  'telegram.org', 'netflix.com', 'hulu.com', 'disneyplus.com',
  'primevideo.com', 'hbomax.com', 'peacocktv.com', 'paramountplus.com',
  'buzzfeed.com', 'dailymail.co.uk', 'tmz.com', 'perez.com',
  '9gag.com', 'ifunny.co', 'ebaumsworld.com', 'collegehumor.com',
  'zynga.com', 'miniclip.com', 'friv.com', 'addictinggames.com',
  'online-games.io', 'poki.com', 'y8.com', 'coolmathgames.com',
  'espn.com', 'bleacherreport.com', 'thescore.com'
];

// --- State ---
let activeTabId = null;
let activeTabUrl = null;
let activeTabStartTime = null;
let isWindowActive = true;

// --- Helpers ---
function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function classifySite(domain) {
  if (!domain) return 'neutral';
  const d = domain.toLowerCase();
  if (PRODUCTIVE_SITES.some(s => d === s || d.endsWith('.' + s))) return 'productive';
  if (UNPRODUCTIVE_SITES.some(s => d === s || d.endsWith('.' + s))) return 'unproductive';
  return 'neutral';
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getWeekKey() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// --- Core Tracking ---
async function saveTime(url, seconds) {
  if (!url || seconds < 2) return;
  const domain = extractDomain(url);
  if (!domain || domain === 'newtab' || domain === '') return;

  const today = getTodayKey();
  const category = classifySite(domain);

  return new Promise((resolve) => {
    chrome.storage.local.get(['siteData', 'dailySummary', 'sessions'], (data) => {
      // Site data (all time per domain)
      const siteData = data.siteData || {};
      if (!siteData[domain]) {
        siteData[domain] = { total: 0, category, visits: 0, lastVisit: null };
      }
      siteData[domain].total += seconds;
      siteData[domain].visits += 1;
      siteData[domain].lastVisit = new Date().toISOString();
      siteData[domain].category = category; // keep updated

      // Daily summary
      const dailySummary = data.dailySummary || {};
      if (!dailySummary[today]) {
        dailySummary[today] = { productive: 0, unproductive: 0, neutral: 0, total: 0, sites: {} };
      }
      dailySummary[today][category] = (dailySummary[today][category] || 0) + seconds;
      dailySummary[today].total = (dailySummary[today].total || 0) + seconds;
      if (!dailySummary[today].sites[domain]) dailySummary[today].sites[domain] = 0;
      dailySummary[today].sites[domain] += seconds;

      // Sessions log (last 200)
      const sessions = data.sessions || [];
      sessions.push({
        domain,
        category,
        seconds,
        date: today,
        timestamp: new Date().toISOString()
      });
      if (sessions.length > 200) sessions.splice(0, sessions.length - 200);

      chrome.storage.local.set({ siteData, dailySummary, sessions }, resolve);
    });
  });
}

function stopCurrentTracking() {
  if (activeTabUrl && activeTabStartTime) {
    const elapsed = Math.floor((Date.now() - activeTabStartTime) / 1000);
    saveTime(activeTabUrl, elapsed);
  }
  activeTabUrl = null;
  activeTabStartTime = null;
}

function startTracking(url) {
  activeTabUrl = url;
  activeTabStartTime = Date.now();
}

// --- Tab Event Listeners ---
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  stopCurrentTracking();
  activeTabId = tabId;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && tab.url.startsWith('http')) {
      startTracking(tab.url);
    }
  } catch {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== activeTabId) return;
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    stopCurrentTracking();
    startTracking(tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    stopCurrentTracking();
    activeTabId = null;
  }
});

// --- Window Focus ---
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    isWindowActive = false;
    stopCurrentTracking();
  } else {
    isWindowActive = true;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
        activeTabId = tabs[0].id;
        startTracking(tabs[0].url);
      }
    });
  }
});

// --- Periodic Save (every 30 seconds) ---
chrome.alarms.create('periodicSave', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodicSave' && activeTabUrl && activeTabStartTime && isWindowActive) {
    const elapsed = Math.floor((Date.now() - activeTabStartTime) / 1000);
    saveTime(activeTabUrl, elapsed);
    activeTabStartTime = Date.now(); // reset for next interval
  }
  if (alarm.name === 'weeklyReport') {
    sendWeeklyReportNotification();
  }
});

// --- Weekly Report Notification ---
chrome.alarms.create('weeklyReport', { periodInMinutes: 10080 }); // 7 days
async function sendWeeklyReportNotification() {
  const data = await new Promise(resolve => chrome.storage.local.get(['dailySummary'], resolve));
  const dailySummary = data.dailySummary || {};
  let weeklyProductive = 0, weeklyTotal = 0;
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (dailySummary[key]) {
      weeklyProductive += dailySummary[key].productive || 0;
      weeklyTotal += dailySummary[key].total || 0;
    }
  }
  const pct = weeklyTotal > 0 ? Math.round((weeklyProductive / weeklyTotal) * 100) : 0;
  const hrs = Math.floor(weeklyTotal / 3600);
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '📊 Weekly Productivity Report',
    message: `You spent ${hrs}h online this week. Productivity score: ${pct}%. Open dashboard for details!`
  });
}

// --- Message Handler ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATS') {
    chrome.storage.local.get(['siteData', 'dailySummary', 'sessions', 'customCategories'], sendResponse);
    return true;
  }
  if (msg.type === 'SET_CATEGORY') {
    chrome.storage.local.get(['siteData', 'customCategories'], (data) => {
      const siteData = data.siteData || {};
      const customCategories = data.customCategories || {};
      if (siteData[msg.domain]) siteData[msg.domain].category = msg.category;
      customCategories[msg.domain] = msg.category;
      chrome.storage.local.set({ siteData, customCategories }, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (msg.type === 'CLEAR_DATA') {
    chrome.storage.local.clear(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'GET_CURRENT') {
    sendResponse({
      domain: activeTabUrl ? extractDomain(activeTabUrl) : null,
      elapsed: activeTabStartTime ? Math.floor((Date.now() - activeTabStartTime) / 1000) : 0
    });
    return true;
  }
});

// --- Init: grab current tab on startup ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
    activeTabId = tabs[0].id;
    startTracking(tabs[0].url);
  }
});

console.log('ProductivityPulse background worker started.');
