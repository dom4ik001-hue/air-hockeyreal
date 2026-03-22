/**
 * modals.js — Modal open/close helpers
 */

export function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/** Close modal when clicking the overlay background */
export function initModalOverlayClose() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  });
}

/** Bind all .modal-close buttons */
export function initModalCloseButtons() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.classList.add('hidden');
    });
  });
}
