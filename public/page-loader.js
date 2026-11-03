(() => {
  const loader = document.getElementById('page-loader');
  if (!loader) return;

  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    loader.classList.add('is-hidden');
    loader.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => loader.remove(), 450);
  };

  const hideAfterDomReady = () => window.setTimeout(hide, 180);
  if (document.readyState === 'interactive' || document.readyState === 'complete') hideAfterDomReady();
  else document.addEventListener('DOMContentLoaded', hideAfterDomReady, { once: true });

  // Do not leave the app covered if a remote asset or request stalls.
  window.setTimeout(hide, 5000);
})();
