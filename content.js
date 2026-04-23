// ProductivityPulse Content Script
// Detects user activity (scroll, click, keypress) to avoid counting idle time

let idleTimer = null;
let isActive = true;

function notifyActive() {
  if (!isActive) {
    isActive = true;
    chrome.runtime.sendMessage({ type: 'USER_ACTIVE' }).catch(() => {});
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    isActive = false;
    chrome.runtime.sendMessage({ type: 'USER_IDLE' }).catch(() => {});
  }, 60000); // 60s idle threshold
}

document.addEventListener('mousemove', notifyActive, { passive: true });
document.addEventListener('keydown', notifyActive, { passive: true });
document.addEventListener('scroll', notifyActive, { passive: true });
document.addEventListener('click', notifyActive, { passive: true });

// Initial activity
notifyActive();
