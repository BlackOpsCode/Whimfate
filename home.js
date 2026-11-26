/* Homepage-only interactions. The shared site.js remains limited to the header/footer. */
(() => {
  const toast = document.getElementById('game-toast');
  const actions = document.querySelectorAll('[data-game]');
  if (!toast || !actions.length) return;

  actions.forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.game || 'This game';
      toast.textContent = `${name} is on the workbench. The playable version will land here when it's ready — no fake results, promise.`;
      toast.hidden = false;
      toast.classList.remove('is-visible');
      requestAnimationFrame(() => toast.classList.add('is-visible'));
    });
  });
})();
