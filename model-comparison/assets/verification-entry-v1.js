/* Preserve the original comparison page and add access to the new results. */
(function () {
  'use strict';
  function addResultsLink() {
    if (document.getElementById('verification-overview-link-v3')) return;
    var actions = document.querySelector('.hero__actions');
    if (!actions) return;
    var link = document.createElement('a');
    link.id = 'verification-overview-link-v3';
    link.className = 'button button--glass';
    link.href = 'overview.html';
    link.textContent = '2025 research and 6/12/24-hour verification';
    actions.appendChild(link);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addResultsLink, { once: true });
  } else addResultsLink();
}());
