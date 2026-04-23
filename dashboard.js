// ProductivityPulse Dashboard Script

// --- Utilities ---
function formatTime(s) {
  if (!s || s < 1) return '0m';
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function formatTimeShort(s) {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${(m%60) > 0 ? (m%60)+'m' : ''}`;
  return `${m}m`;
}

function getTodayKey() { return new Date().toISOString().split('T')[0]; }

function getDateKey(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function getWeekDates() {
  const dates = [];
  for (let i = 6; i >= 0; i--) dates.push(getDateKey(-i));
  return dates;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function catColor(cat) {
  if (cat === 'productive') return '#00e5a0';
  if (cat === 'unproductive') return '#ff4d6d';
  return '#7b8cde';
}

// --- Chart instances ---
let donutChart, topSitesChart, hourlyChart, weeklyChart;

// --- Load data ---
async function loadData() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, d => resolve(d || {}));
  });
}

// --- Navigation ---
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    renderPage(page);
  });
});

// Check hash for direct nav
if (location.hash === '#weekly') {
  setTimeout(() => {
    document.querySelector('[data-page="weekly"]').click();
  }, 100);
}

// --- Render dispatcher ---
async function renderPage(page) {
  const data = await loadData();
  if (page === 'overview') renderOverview(data);
  else if (page === 'sites') renderAllSites(data);
  else if (page === 'weekly') renderWeekly(data);
  else if (page === 'categories') renderCategories(data);
  else if (page === 'settings') renderSettings(data);
}

// --- Overview ---
function renderOverview(data) {
  const today = getTodayKey();
  const daily = data.dailySummary?.[today] || {};
  const total = daily.total || 0;
  const prod = daily.productive || 0;
  const unprod = daily.unproductive || 0;
  const neutral = daily.neutral || 0;
  const pct = total > 0 ? Math.round((prod / total) * 100) : 0;

  // Date
  document.getElementById('overviewDate').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Stats
  document.getElementById('ov-total').textContent = formatTime(total);
  document.getElementById('ov-score').textContent = pct + '%';
  document.getElementById('ov-prod').textContent = formatTime(prod);
  document.getElementById('ov-unprod').textContent = formatTime(unprod);
  document.getElementById('ov-score-sub').textContent = pct >= 60 ? '🔥 Crushing it!' : pct >= 40 ? '⚡ Keep going' : '😐 Push harder';

  // Donut chart
  const donutCtx = document.getElementById('donutChart').getContext('2d');
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels: ['Productive', 'Leisure', 'Neutral'],
      datasets: [{
        data: [prod || 0.1, unprod || 0.1, neutral || 0.1],
        backgroundColor: ['#00e5a0', '#ff4d6d', '#7b8cde'],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#888898', font: { family: 'Syne', size: 11 }, padding: 16, boxWidth: 10 }
        },
        tooltip: {
          callbacks: { label: ctx => ` ${formatTime(ctx.raw)}` }
        }
      }
    }
  });

  // Top sites bar chart
  const sites = daily.sites || {};
  const topSites = Object.entries(sites).sort((a,b) => b[1]-a[1]).slice(0,5);
  const siteData = data.siteData || {};

  const topCtx = document.getElementById('topSitesChart').getContext('2d');
  if (topSitesChart) topSitesChart.destroy();
  topSitesChart = new Chart(topCtx, {
    type: 'bar',
    data: {
      labels: topSites.map(([d]) => d.length > 16 ? d.slice(0,14)+'…' : d),
      datasets: [{
        data: topSites.map(([,s]) => Math.round(s/60)),
        backgroundColor: topSites.map(([d]) => catColor(siteData[d]?.category || 'neutral') + 'cc'),
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw}m` } } },
      scales: {
        x: {
          ticks: { color: '#5a5a6e', font: { family: 'Space Mono', size: 10 } },
          grid: { color: '#28282f' }
        },
        y: {
          ticks: { color: '#888898', font: { family: 'Syne', size: 11 } },
          grid: { display: false }
        }
      }
    }
  });

  // Hourly chart - reconstruct from sessions
  const sessions = data.sessions || [];
  const hourlyData = new Array(24).fill(0);
  sessions.forEach(s => {
    if (s.date === today) {
      try {
        const h = new Date(s.timestamp).getHours();
        hourlyData[h] += Math.round(s.seconds / 60);
      } catch {}
    }
  });

  const hourCtx = document.getElementById('hourlyChart').getContext('2d');
  if (hourlyChart) hourlyChart.destroy();
  hourlyChart = new Chart(hourCtx, {
    type: 'bar',
    data: {
      labels: hourlyData.map((_, i) => i % 3 === 0 ? `${i}:00` : ''),
      datasets: [{
        data: hourlyData,
        backgroundColor: '#00e5a040',
        borderColor: '#00e5a0',
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw}m` } } },
      scales: {
        x: {
          ticks: { color: '#5a5a6e', font: { family: 'Space Mono', size: 9 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#5a5a6e', font: { family: 'Space Mono', size: 10 } },
          grid: { color: '#28282f' }
        }
      }
    }
  });
}

// --- All Sites ---
function renderAllSites(data) {
  const siteData = data.siteData || {};
  const entries = Object.entries(siteData).sort((a,b) => b[1].total - a[1].total);
  const maxTime = entries[0]?.[1]?.total || 1;
  const tbody = document.getElementById('allSitesTbody');

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:32px">No data yet</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([domain, info]) => {
    const pct = (info.total / maxTime * 100).toFixed(1);
    return `
    <tr>
      <td>
        <div class="site-name-cell">
          <div class="site-icon-sm">${domain[0].toUpperCase()}</div>
          <span style="font-weight:600">${domain}</span>
        </div>
      </td>
      <td><span class="cat-badge cat-${info.category || 'neutral'}">${info.category || 'neutral'}</span></td>
      <td>
        <div class="time-bar-wrap">
          <div class="time-bar-track">
            <div class="time-bar-fill" style="width:${pct}%;background:${catColor(info.category)}"></div>
          </div>
          <span class="time-mono">${formatTimeShort(info.total)}</span>
        </div>
      </td>
      <td style="font-family:'Space Mono',monospace;font-size:12px;color:var(--muted2)">${info.visits || 0}</td>
      <td>
        <select class="settings-select" style="font-size:11px;padding:4px 8px"
          onchange="updateCategory('${domain}', this.value)">
          <option ${info.category==='productive'?'selected':''} value="productive">✅ Productive</option>
          <option ${info.category==='unproductive'?'selected':''} value="unproductive">🚫 Leisure</option>
          <option ${(info.category||'neutral')==='neutral'?'selected':''} value="neutral">⚪ Neutral</option>
        </select>
      </td>
    </tr>`;
  }).join('');
}

// --- Weekly ---
function renderWeekly(data) {
  const daily = data.dailySummary || {};
  const dates = getWeekDates();
  const today = getTodayKey();

  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const todayIdx = (new Date().getDay() + 6) % 7;

  let weekTotal = 0, weekProd = 0;

  const grid = document.getElementById('weekGrid');
  grid.innerHTML = dates.map((date, i) => {
    const d = daily[date] || {};
    const t = d.total || 0;
    const p = d.productive || 0;
    const pct = t > 0 ? Math.round((p/t)*100) : 0;
    weekTotal += t;
    weekProd += p;
    const barH = Math.min(100, Math.round(t / 36)); // max ~1hr = 100%
    const scoreColor = pct >= 60 ? 'var(--prod)' : pct >= 30 ? 'var(--warn)' : 'var(--unprod)';
    return `
      <div class="day-card ${date === today ? 'today' : ''}">
        <div class="day-name">${dayNames[i % 7]}</div>
        <div class="day-bar">
          <div class="day-bar-fill" style="height:${barH}%;background:${catColor('productive')}44;border-top:2px solid var(--prod)"></div>
        </div>
        <div class="day-total">${t > 0 ? formatTimeShort(t) : '—'}</div>
        <div class="day-score" style="color:${t>0?scoreColor:'var(--muted)'}">
          ${t > 0 ? pct + '%' : '—'}
        </div>
      </div>`;
  }).join('');

  const weekAvgPct = weekTotal > 0 ? Math.round((weekProd/weekTotal)*100) : 0;
  document.getElementById('wk-total').textContent = formatTime(weekTotal);
  document.getElementById('wk-score').textContent = weekAvgPct + '%';
  document.getElementById('wk-prod').textContent = formatTime(weekProd);

  const rangeStart = new Date(dates[0]).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  const rangeEnd = new Date(dates[6]).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  document.getElementById('weekRange').textContent = `${rangeStart} – ${rangeEnd}`;

  // Weekly chart
  const wCtx = document.getElementById('weeklyChart').getContext('2d');
  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(wCtx, {
    type: 'bar',
    data: {
      labels: dates.map((d,i) => dayNames[i%7]),
      datasets: [
        {
          label: 'Productive',
          data: dates.map(d => Math.round((daily[d]?.productive||0)/60)),
          backgroundColor: '#00e5a066',
          borderColor: '#00e5a0',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false
        },
        {
          label: 'Leisure',
          data: dates.map(d => Math.round((daily[d]?.unproductive||0)/60)),
          backgroundColor: '#ff4d6d55',
          borderColor: '#ff4d6d',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false
        },
        {
          label: 'Neutral',
          data: dates.map(d => Math.round((daily[d]?.neutral||0)/60)),
          backgroundColor: '#7b8cde44',
          borderColor: '#7b8cde',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false
        }
      ]
    },
    options: {
      plugins: {
        legend: { labels: { color: '#888898', font: { family:'Syne', size:11 }, padding:16 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw}m` } }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#5a5a6e', font: { family:'Syne', size:11 } },
          grid: { display: false }
        },
        y: {
          stacked: true,
          ticks: { color: '#5a5a6e', font: { family:'Space Mono', size:10 }, callback: v => v+'m' },
          grid: { color: '#28282f' }
        }
      }
    }
  });
}

// --- Categories ---
function renderCategories(data) {
  const customCat = data.customCategories || {};
  const listEl = document.getElementById('customCategoriesList');
  const entries = Object.entries(customCat);

  if (entries.length === 0) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No custom rules yet</div>';
  } else {
    listEl.innerHTML = entries.map(([domain, cat]) => `
      <div class="settings-row">
        <div>
          <div class="settings-row-label">${domain}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="cat-badge cat-${cat}">${cat}</span>
          <button class="edit-cat-btn" onclick="removeCustomCat('${domain}')">Remove</button>
        </div>
      </div>`).join('');
  }
}

// --- Settings ---
function renderSettings(data) {
  // no dynamic data needed beyond what's in storage
}

// --- Actions ---
function updateCategory(domain, category) {
  chrome.runtime.sendMessage({ type: 'SET_CATEGORY', domain, category }, () => {
    showToast(`✅ ${domain} set to ${category}`);
  });
}

window.updateCategory = updateCategory;

function removeCustomCat(domain) {
  chrome.storage.local.get(['customCategories'], d => {
    const cc = d.customCategories || {};
    delete cc[domain];
    chrome.storage.local.set({ customCategories: cc }, () => {
      showToast(`Removed custom rule for ${domain}`);
      renderPage('categories');
    });
  });
}

window.removeCustomCat = removeCustomCat;

document.getElementById('addCustomSiteBtn').addEventListener('click', () => {
  const domain = document.getElementById('customSiteInput').value.trim()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const cat = document.getElementById('customSiteCat').value;
  if (!domain) { showToast('⚠️ Enter a domain name'); return; }
  chrome.runtime.sendMessage({ type: 'SET_CATEGORY', domain, category: cat }, () => {
    showToast(`✅ ${domain} → ${cat}`);
    document.getElementById('customSiteInput').value = '';
    renderPage('categories');
  });
});

const clearAll = () => {
  if (confirm('Clear ALL tracking data? This cannot be undone.')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_DATA' }, () => {
      showToast('🗑 All data cleared');
      renderPage('overview');
    });
  }
};

document.getElementById('clearDataBtn').addEventListener('click', clearAll);
document.getElementById('clearDataBtn2').addEventListener('click', clearAll);

document.getElementById('exportBtn').addEventListener('click', async () => {
  const data = await loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `productivitypulse-export-${getTodayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📁 Data exported!');
});

// --- Init ---
renderPage('overview');
