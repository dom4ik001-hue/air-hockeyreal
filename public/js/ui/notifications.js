/**
 * notifications.js — Toast notification system
 */

const ICONS = {
  success: '✅',
  error:   '⚠️',
  info:    'ℹ️',
  warning: '⚠️'
};

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration — ms before auto-dismiss
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${ICONS[type]}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
