/* Durable entry into the comparison overview; ?legacy=1 preserves the pilot. */
(function () {
  'use strict';
  var current = new URL(window.location.href);
  if (current.searchParams.get('legacy') === '1') return;
  var target = new URL('overview.html', current);
  target.search = current.search;
  target.hash = current.hash;
  target.searchParams.delete('legacy');
  if (!target.searchParams.has('mode') && target.searchParams.has('init')) {
    target.searchParams.set('mode', 'operational');
  }
  window.location.replace(target.href);
}());
