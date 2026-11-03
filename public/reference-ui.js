(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const nav = document.getElementById('endpoint-groups');
  const filter = document.getElementById('endpoint-filter');
  let endpoints = [];
  const iconPaths = {
    system: '<path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42m-9.88 9.88-1.42 1.42"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    weather: '<path d="M7 18h10a4 4 0 0 0 .3-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z"/><path d="M8 3v2m-5 2 2 1m10-3 2-2"/>',
    news: '<path d="M5 4h14v16H5zM8 8h8M8 12h3m2 0h3m-8 4h8"/><path d="M3 7v12a2 2 0 0 0 2 2"/>',
    sparkle: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm7 11 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/>',
    tool: '<path d="M14 6a5 5 0 0 0-6.5 6.5L3 17l4 4 4.5-4.5A5 5 0 0 0 18 10l-3 3-4-4 3-3Z"/>',
    chart: '<path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22zM4 5.5v16.5M8 7h8m-8 4h8"/>',
    nodes: '<circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m11 7-4 9m6-9 4 9M8.5 18h7"/>',
    fallback: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  };
  function iconName(category) {
    const key = String(category).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (key.includes('youtube') || key.includes('video')) return 'video';
    if (key.includes('weather') || key.includes('thoi tiet')) return 'weather';
    if (key.includes('news') || key.includes('tin tuc')) return 'news';
    if (key.includes('ai') || key.includes('suggest')) return 'sparkle';
    if (key.includes('finance') || key.includes('tai chinh') || key.includes('market') || key.includes('thi truong')) return 'chart';
    if (key.includes('audio') || key.includes('sound') || key.includes('am thanh')) return 'music';
    if (key.includes('content') || key.includes('noi dung')) return 'book';
    if (key.includes('mcp')) return 'nodes';
    if (key.includes('download')) return 'download';
    if (key.includes('utility') || key.includes('tien ich')) return 'tool';
    if (key.includes('system') || key.includes('he thong')) return 'system';
    return 'fallback';
  }
  function categoryIcon(category) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[iconName(category)]}</svg>`;
  }
  async function copyText(text) {
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
  }

  function endpointLabel(endpoint) {
    const labels = {
      '/api/youtube/search': 'T\u00ecm video YouTube',
      '/api/music/youtube/play': 'Ph\u00e1t nh\u1ea1c YouTube',
      '/api/music/soundcloud/search': 'T\u00ecm b\u00e0i SoundCloud',
      '/api/music/soundcloud/play': 'Ph\u00e1t nh\u1ea1c SoundCloud',
      '/api/music/channel3/play': 'Ph\u00e1t VOV3',
      '/api/radio/play': 'Ph\u00e1t radio',
    };
    return labels[endpoint.path] || endpoint.path.split('/').filter(Boolean).pop() || endpoint.path;
  }

  function renderGroups(query = '') {
    if (!nav) return;
    const normalized = query.trim().toLowerCase();
    const groups = new Map();
    endpoints.forEach((endpoint, index) => {
      const category = endpoint.category || 'Other';
      const searchable = `${endpoint.method} ${endpoint.path} ${category} ${endpoint.description || ''}`.toLowerCase();
      if (normalized && !searchable.includes(normalized)) return;
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push({ endpoint, index });
    });
    nav.innerHTML = [...groups.entries()].map(([category, entries], groupIndex) => `<details class="endpoint-group" ${groupIndex === 0 || normalized ? 'open' : ''}><summary>${categoryIcon(category)}<span>${esc(category)}</span><b>${entries.length}</b></summary><div class="endpoint-group-items">${entries.map(({ endpoint, index }) => `<button type="button" class="endpoint-row" data-endpoint-index="${index}" title="${esc(endpoint.description || endpoint.path)}"><span>${esc(endpointLabel(endpoint))}</span><span class="endpoint-methods">${esc(endpoint.method)}</span></button>`).join('')}</div></details>`).join('') || '<p class="endpoint-empty">No endpoints match.</p>';
  }

  async function loadReference() {
    if (!nav) return;
    try {
      const response = await fetch('/api/docs',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      endpoints = data.endpoints || [];
      window.xiaozhiApiDocs = endpoints;
      window.dispatchEvent(new CustomEvent('xiaozhi-api-docs-ready',{detail:{endpoints}}));
      const categories = new Set(endpoints.map(item => item.category || 'Other'));
      document.getElementById('sidebar-route-count').textContent = `${endpoints.length} endpoints`;
      document.getElementById('sidebar-group-count').textContent = `${categories.size} groups`;
      document.getElementById('base-url-value').textContent = location.origin;
      renderGroups(filter?.value || '');
    } catch (error) {
      window.dispatchEvent(new CustomEvent('xiaozhi-api-docs-ready',{detail:{error:error.message}}));
      nav.innerHTML = `<p class="endpoint-empty">Could not load endpoints: ${esc(error.message)}</p>`;
    }
  }

  async function refreshRuntimeStats() {
    const requestJson = async path => {
      const response = await fetch(path);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    };
    const [healthResult, statusResult, metricsResult] = await Promise.allSettled([
      requestJson('/api/health'), requestJson('/api/status'), requestJson('/api/admin/metrics'),
    ]);
    const status = document.getElementById('landing-status');
    const uptime = document.getElementById('landing-uptime');
    const requests = document.getElementById('landing-requests');
    const memory = document.getElementById('landing-memory');
    if (healthResult.status === 'fulfilled') {
      const online = Boolean(healthResult.value.ok);
      status.textContent = online ? 'ONLINE' : String.fromCharCode(0x2014);
      status.classList.toggle('runtime-bad', !online);
    } else {
      status.textContent = 'UNAVAILABLE';
      status.classList.add('runtime-bad');
    }
    if (statusResult.status === 'fulfilled') {
      const seconds = Math.max(0, Number(statusResult.value.uptime_seconds) || 0);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor(seconds % 86400 / 3600);
      const minutes = Math.floor(seconds % 3600 / 60);
      uptime.textContent = days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
      const rssBytes = Number(statusResult.value.memory?.process_rss_bytes);
      memory.textContent = Number.isFinite(rssBytes) ? `${Math.round(rssBytes / 1048576)} MB` : 'N/A';
    } else {
      uptime.textContent = String.fromCharCode(0x2014);
      memory.textContent = String.fromCharCode(0x2014);
    }
    requests.textContent = metricsResult.status === 'fulfilled'
      ? Number(metricsResult.value.total_requests || 0).toLocaleString()
      : String.fromCharCode(0x2014);
  }

  filter?.addEventListener('input', () => renderGroups(filter.value));
  filter?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { filter.value = ''; renderGroups(); filter.blur(); }
  });
  document.getElementById('expand-endpoints')?.addEventListener('click', event => {
    const groups = [...nav.querySelectorAll('details')];
    const expand = groups.some(group => !group.open);
    groups.forEach(group => { group.open = expand; });
    event.currentTarget.textContent = expand ? 'COLLAPSE ALL' : String.fromCharCode(0x2014);
  });
  nav?.addEventListener('click', async event => {
    const button = event.target.closest('[data-endpoint-index]');
    if (!button) return;
    event.preventDefault();
    const endpoint = endpoints[Number(button.dataset.endpointIndex)];
    const select = document.getElementById('explorer-endpoint');
    const form = document.getElementById('explorer-form');
    if (!endpoint || !select || !form) return;
    await (window.apiDocsReady || Promise.resolve());
    const option = [...select.options].find(item => item.textContent.trim() === endpoint.method + ' ' + endpoint.path);
    if (!option) {
      const output = document.getElementById('explorer-result');
      if (output) output.textContent = 'Kh\u00f4ng t\u00ecm th\u1ea5y endpoint trong API Explorer. H\u00e3y t\u1ea3i l\u1ea1i trang.';
      location.hash = '#api-explorer';
      return;
    }
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    location.hash = '#api-explorer';
    if (String(endpoint.method).toUpperCase() === 'GET') {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-pick-path]');
    if (!link) return;
    const select = document.getElementById('explorer-endpoint');
    const option = [...(select?.options || [])].find(item => item.textContent.includes(link.dataset.pickPath));
    if (!select || !option) return;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.getElementById('copy-base-url')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const original = button.textContent;
    const copied = await copyText(location.origin);
    button.textContent = copied ? 'COPIED' : String.fromCharCode(0x2014);
    setTimeout(() => { button.textContent = original; }, 1400);
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      event.preventDefault(); filter?.focus();
    }
  });

  const explorer = document.getElementById('api-explorer');
  const docs = document.getElementById('api-docs');
  if (explorer && docs) explorer.before(docs);
  const docsList = document.getElementById('docs-list');
  const decorateDocCategories = () => docsList?.querySelectorAll('.category-tag:not([data-icon-ready])').forEach(tag => {
    tag.dataset.iconReady = 'true';
    tag.insertAdjacentHTML('afterbegin', categoryIcon(tag.textContent));
  });
  if (docsList) new MutationObserver(decorateDocCategories).observe(docsList, { childList: true, subtree: true });
  decorateDocCategories();
  loadReference();
  refreshRuntimeStats();
  setInterval(refreshRuntimeStats, 30000);
})();
