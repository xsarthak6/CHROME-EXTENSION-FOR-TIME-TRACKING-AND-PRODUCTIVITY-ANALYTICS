// ProductivityPulse Popup Script

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getScoreMsg(pct) {
  if (pct >= 80) return '🔥 Crushing it today!';
  if (pct >= 60) return '💪 Great focus!';
  if (pct >= 40) return '⚡ Decent progress';
  if (pct >= 20) return '😐 Could be better';
  return '😴 Let\'s get to work!';
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

async function loadData() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, resolve);
  });
}

async function getCurrentSite() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT' }, resolve);
  });
}

function renderPopup(data, current) {
  const today = getTodayKey();
  const daily = data.dailySummary?.[today] || { productive: 0, unproductive: 0, neutral: 0, total: 0, sites: {} };

  const total = daily.total || 0;
  const prod = daily.productive || 0;
  const unprod = daily.unproductive || 0;
  const neutral = daily.neutral || 0;
  const pct = total > 0 ? Math.round((prod / total) * 100) : 0;

  // Ring
  const circumference = 226;
  const offset = circumference - (pct / 100) * circumference;
  document.getElementById('ringFill').style.strokeDashoffset = offset;
  document.getElementById('ringFill').style.stroke = pct >= 60 ? 'var(--prod)' : pct >= 30 ? 'var(--warn)' : 'var(--unprod)';
  document.getElementById('scorePct').textContent = pct + '%';
  document.getElementById('scorePct').style.color = pct >= 60 ? 'var(--prod)' : pct >= 30 ? 'var(--warn)' : 'var(--unprod)';

  // Times
  document.getElementById('totalTime').textContent = formatTime(total);
  document.getElementById('scoreMsg').textContent = getScoreMsg(pct);

  // Bars
  document.getElementById('prodTime').textContent = formatTime(prod);
  document.getElementById('unprodTime').textContent = formatTime(unprod);
  document.getElementById('neutralTime').textContent = formatTime(neutral);

  document.getElementById('prodBar').style.width = total > 0 ? (prod / total * 100) + '%' : '0%';
  document.getElementById('unprodBar').style.width = total > 0 ? (unprod / total * 100) + '%' : '0%';
  document.getElementById('neutralBar').style.width = total > 0 ? (neutral / total * 100) + '%' : '0%';

  // Current site
  if (current && current.domain) {
    document.getElementById('currentSite').style.display = 'flex';
    document.getElementById('currentDomain').textContent = current.domain;
    document.getElementById('currentTimer').textContent = formatTimer(current.elapsed || 0);
  }

  // Top sites today
  const sites = daily.sites || {};
  const siteEntries = Object.entries(sites)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const siteData = data.siteData || {};
  const listEl = document.getElementById('siteList');

  if (siteEntries.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="emoji">🌐</div><div>No data yet. Start browsing!</div></div>`;
    return;
  }

  listEl.innerHTML = siteEntries.map(([domain, secs]) => {
    const cat = siteData[domain]?.category || 'neutral';
    const catLabel = cat === 'productive' ? 'Work' : cat === 'unproductive' ? 'Leisure' : 'Neutral';
    const initial = domain[0].toUpperCase();
    return `
      <div class="site-item" data-domain="${domain}">
        <div class="site-favicon">${initial}</div>
        <div class="site-domain">${domain}</div>
        <span class="site-cat-badge cat-${cat}">${catLabel}</span>
        <div class="site-time">${formatTime(secs)}</div>
      </div>
    `;
  }).join('');
}

// Auto-refresh current timer
let timerInterval = null;
function startTimerRefresh(elapsed) {
  let secs = elapsed || 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    secs++;
    document.getElementById('currentTimer').textContent = formatTimer(secs);
  }, 1000);
}

async function init() {
  const [data, current] = await Promise.all([loadData(), getCurrentSite()]);
  renderPopup(data || {}, current || {});
  if (current && current.domain && current.elapsed) {
    startTimerRefresh(current.elapsed);
  }
}

// Buttons
document.getElementById('refreshBtn').addEventListener('click', init);

document.getElementById('dashBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

document.getElementById('dashBtn2').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

document.getElementById('weekBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') + '#weekly' });
});

init();
