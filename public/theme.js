(() => {
  const toggle = document.getElementById('theme-switch');
  if (!toggle) return;
  const root = document.documentElement;
  const storageKey = 'xiaozhi-color-scheme';

  let saved = '';
  try { saved = localStorage.getItem(storageKey) || ''; } catch {}
  const initial = saved === 'dark' ? 'dark' : 'light';
  root.dataset.theme = initial;
  toggle.checked = initial === 'dark';

  toggle.addEventListener('change', () => {
    const theme = toggle.checked ? 'dark' : 'light';
    root.dataset.theme = theme;
    try { localStorage.setItem(storageKey, theme); } catch {}
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'dark' ? '#071321' : '#dff5ff';
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Bật giao diện sáng' : 'Bật giao diện tối');
  });
})();
