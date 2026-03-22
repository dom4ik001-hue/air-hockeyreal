/**
 * navigation.js — Screen switching
 */
const screens = ['screen-auth', 'screen-menu', 'screen-play-setup', 'screen-game'];

export function showScreen(id) {
  screens.forEach(sid => {
    const el = document.getElementById(sid);
    if (!el) return;
    if (sid === id) {
      el.classList.remove('hidden');
      el.classList.add('active');
    } else {
      el.classList.add('hidden');
      el.classList.remove('active');
    }
  });
}
