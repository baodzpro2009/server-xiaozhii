(() => {
  const search = document.getElementById('global-search');
  const docs = () => [...(document.getElementById('explorer-endpoint')?.options || [])].map(option => ({method: option.textContent.split(' ')[0], path: option.textContent.slice(option.textContent.indexOf(' ')+1)}));
  const goEndpoint = async path => {
    const select = document.getElementById('explorer-endpoint');
    if (!select) return;
    await (window.apiDocsReady || Promise.resolve());
    const option = [...select.options].find(item => item.textContent.includes(path));
    if (option) { select.value = option.value; select.dispatchEvent(new Event('change')); window.updateExplorer?.(); }
    location.hash = '#api-explorer';
  };
  const refreshSearch = () => {
    const list = document.getElementById('api-search-options');
    if (!list) return;
    list.innerHTML = docs().map(item => `<option value="${item.method} ${item.path}"></option>`).join('');
  };
  const copyText = async text => {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch {}
    field.remove();
    return copied;
  };
  const endpointSelect = document.getElementById('explorer-endpoint');
  if (endpointSelect) new MutationObserver(refreshSearch).observe(endpointSelect, { childList: true });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search?.focus(); }
    if (event.key === 'Escape' && document.activeElement === search) search.blur();
  });
  search?.addEventListener('change', () => {
    const match = search.value.match(/(\/api\/[^\s?]+)/);
    if (match) goEndpoint(match[1]);
    else document.querySelectorAll('section[id]').forEach(section => { if (section.id.toLowerCase().includes(search.value.toLowerCase())) location.hash = '#'+section.id; });
  });
  document.addEventListener('click', event => {
    const pick = event.target.closest('[data-pick-path]');
    if (pick) { event.preventDefault(); goEndpoint(pick.dataset.pickPath); }
    const category = event.target.closest('[data-category-jump]');
    if (category) {
      const card = category.closest('.category-card');
      card?.classList.toggle('expanded');
      category.innerHTML = card?.classList.contains('expanded') ? 'Thu gọn <span>↑</span>' : 'Xem gợi ý <span>→</span>';
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      const old = copy.textContent;
      copy.disabled = true;
      copyText(copy.dataset.copy).then(copied => {
        copy.textContent = copied ? 'Đã sao chép' : 'Không sao chép được';
        window.setTimeout(() => { copy.textContent = old; copy.disabled = false; }, 1400);
      });
    }
  });
  document.querySelectorAll('.side-nav a').forEach(link => link.addEventListener('click', () => {
    document.querySelectorAll('.side-nav a').forEach(item => item.classList.remove('active')); link.classList.add('active');
  }));
  const theme = document.getElementById('theme-toggle');
  theme?.addEventListener('click', () => { document.body.classList.toggle('light-theme'); theme.textContent=document.body.classList.contains('light-theme')?'☾':'☼'; });
  window.addEventListener('load', () => setTimeout(refreshSearch, 100));
  document.addEventListener('change', event => { if (event.target.id === 'explorer-endpoint') refreshSearch(); });
})();
