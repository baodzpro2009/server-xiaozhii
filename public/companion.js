(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const apiGet = async url => {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const section = document.createElement('section');
  section.className = 'grid companion-grid';
  section.innerHTML = `
    <article class="card"><h2>📅 Nhắc việc</h2><form id="reminder-form"><input id="reminder-title" maxlength="120" placeholder="Ví dụ: Ôn bài kiểm tra" required><input id="reminder-time" type="datetime-local" required><button type="submit">Lưu lời nhắc</button></form><div class="actions"><button id="today-reminders">Hôm nay</button><button id="upcoming-reminders" class="secondary">Sắp tới</button></div><div id="reminder-output" class="output"></div></article>
    <article class="card youtube-audio-card"><h2>&#9654; YouTube</h2><p class="muted">T&#236;m v&#224; ph&#225;t nh&#7841;c t&#7915; YouTube</p><input id="youtube-query" maxlength="120" placeholder="Nh&#7853;p t&#234;n b&#224;i h&#225;t ho&#7863;c ngh&#7879; s&#297;"><button id="youtube-audio-play" type="button">T&#236;m v&#224; ph&#225;t nh&#7841;c YouTube</button><div class="music-now-playing" aria-live="polite"><span class="music-now-label">YOUTUBE</span><strong id="youtube-track-title">Ch&#432;a ph&#225;t nh&#7841;c</strong><span id="youtube-playback-status" class="muted">Nh&#7853;p t&#234;n b&#224;i h&#225;t, sau &#273;&#243; b&#7845;m n&#250;t ph&#225;t.</span></div><audio id="companion-player" controls preload="none" aria-label="Tr&#236;nh ph&#225;t YouTube"></audio><div id="youtube-output" class="output"></div></article>
    <article class="card"><h2>&#127911; SoundCloud</h2><input id="music-query" maxlength="120" placeholder="T&#234;n b&#224;i h&#225;t ho&#7863;c ngh&#7879; s&#297;"><button id="soundcloud-search">T&#236;m b&#224;i SoundCloud</button><div class="music-now-playing" aria-live="polite"><span class="music-now-label">SOUNDCLOUD</span><strong id="soundcloud-track-title">Ch&#432;a ch&#7885;n b&#224;i h&#225;t</strong><span id="soundcloud-playback-status" class="muted">T&#236;m b&#224;i r&#7891;i b&#7845;m Ph&#225;t.</span></div><audio id="soundcloud-player" controls preload="none" aria-label="Tr&#236;nh ph&#225;t SoundCloud"></audio><div id="music-output" class="output"></div></article>
    <article class="card radio-card"><h2>&#128251; Radio</h2><p class="muted">T&#236;m v&#224; ph&#225;t &#273;&#224;i radio tr&#7921;c tuy&#7871;n.</p><input id="radio-query" maxlength="120" placeholder="T&#234;n &#273;&#224;i radio"><button id="radio-play">T&#236;m v&#224; ph&#225;t radio</button><div class="music-now-playing" aria-live="polite"><span class="music-now-label">RADIO</span><strong id="radio-track-title">Ch&#432;a ph&#225;t radio</strong><span id="radio-playback-status" class="muted">Nh&#7853;p t&#234;n &#273;&#224;i radio.</span></div><audio id="radio-player" controls preload="none" aria-label="Tr&#236;nh ph&#225;t radio"></audio><div id="radio-output" class="output"></div></article>
    <article class="card vov3-card"><h2>&#128227; VOV3</h2><p class="muted">Ph&#225;t k&#234;nh VOV3 tr&#7921;c ti&#7871;p.</p><button id="vov3" type="button">Ph&#225;t VOV3</button><div class="music-now-playing" aria-live="polite"><span class="music-now-label">VOV3</span><strong id="vov3-track-title">Ch&#432;a ph&#225;t VOV3</strong><span id="vov3-playback-status" class="muted">Nh&#7845;n Ph&#225;t VOV3 &#273;&#7875; b&#7855;t &#273;&#7847;u.</span></div><audio id="vov3-player" controls preload="none" aria-label="Tr&#236;nh ph&#225;t VOV3"></audio><div id="vov3-output" class="output"></div></article>
    <article class="card"><h2>🌅 Báo cáo buổi sáng</h2><input id="briefing-city" placeholder="Thành phố"><button id="briefing-button">Lấy báo cáo</button><pre id="briefing-output" class="output"></pre></article>
    <article class="card"><h2>💰 Giá vàng và xổ số</h2><div class="actions"><button id="gold-button">Giá vàng SJC</button><select id="lottery-region"><option value="mien-bac">Miền Bắc</option><option value="mien-trung">Miền Trung</option><option value="mien-nam">Miền Nam</option></select><button id="lottery-button" class="secondary">Kết quả xổ số</button></div><pre id="finance-output" class="output"></pre></article>
    <article class="card"><h2>📚 Truyện và luyện nói</h2><input id="story-topic" placeholder="Chủ đề truyện (không bắt buộc)"><div class="actions"><button id="story-button">Kể chuyện</button><button id="wordplay-button" class="secondary">Câu luyện nói</button></div><div id="story-output" class="output"></div></article>
    <article class="card"><h2>🖥️ Tình trạng dịch vụ</h2><button id="companion-status-button">Cập nhật</button><pre id="companion-status-output" class="output"></pre></article>`;
  (document.querySelector('.dashboard-content') || document.querySelector('main')).appendChild(section);

  const outputError = (id, error) => { document.getElementById(id).textContent = error.message || String(error); };
  async function loadReminders(scope = 'today') {
    const out = document.getElementById('reminder-output');
    out.textContent = 'Đang tải...';
    try {
      const data = await apiGet('/api/reminders' + (scope === 'upcoming' ? '?scope=upcoming' : ''));
      out.innerHTML = data.items?.length ? data.items.map(item => `<div class="item"><b>${escapeHtml(item.title)}</b><div class="muted">${escapeHtml(new Date(item.dueAt).toLocaleString('vi-VN'))}</div><button class="delete-reminder" data-id="${escapeHtml(item.id)}">Xóa</button></div>`).join('') : 'Không có lời nhắc';
    } catch (error) { outputError('reminder-output', error); }
  }

  document.getElementById('reminder-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const response = await fetch('/api/reminders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: document.getElementById('reminder-title').value, due_at: new Date(document.getElementById('reminder-time').value).toISOString() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      document.getElementById('reminder-title').value = '';
      await loadReminders();
    } catch (error) { outputError('reminder-output', error); }
  });
  document.getElementById('reminder-output').addEventListener('click', async event => {
    const button = event.target.closest('.delete-reminder');
    if (!button) return;
    try {
      const response = await fetch('/api/reminders/' + encodeURIComponent(button.dataset.id), { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      await loadReminders();
    } catch (error) { outputError('reminder-output', error); }
  });
  document.getElementById('today-reminders').addEventListener('click', () => loadReminders());
  document.getElementById('upcoming-reminders').addEventListener('click', () => loadReminders('upcoming'));

  const players = {
    youtube: { audio: document.getElementById('companion-player'), title: document.getElementById('youtube-track-title'), status: document.getElementById('youtube-playback-status') },
    soundcloud: { audio: document.getElementById('soundcloud-player'), title: document.getElementById('soundcloud-track-title'), status: document.getElementById('soundcloud-playback-status') },
    radio: { audio: document.getElementById('radio-player'), title: document.getElementById('radio-track-title'), status: document.getElementById('radio-playback-status') },
    vov3: { audio: document.getElementById('vov3-player'), title: document.getElementById('vov3-track-title'), status: document.getElementById('vov3-playback-status') },
  };
  function setTrack(key, title, status) { players[key].title.textContent = title; if (status) players[key].status.textContent = status; }
  function stopOtherPlayers(active) {
    document.querySelectorAll('audio').forEach(audio => {
      if (audio === active || !audio.currentSrc) return;
      audio.pause(); audio.removeAttribute('src'); audio.load();
    });
  }
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) stopOtherPlayers(event.target);
  }, true);
  Object.entries(players).forEach(([key, item]) => {
    item.audio.addEventListener('playing', () => { item.status.textContent = '\u0110ang ph\u00e1t'; });
    item.audio.addEventListener('pause', () => { if (item.audio.currentSrc && !item.audio.ended) item.status.textContent = '\u0110\u00e3 t\u1ea1m d\u1eebng'; });
    item.audio.addEventListener('ended', () => { item.status.textContent = '\u0110\u00e3 ph\u00e1t xong'; });
    item.audio.addEventListener('error', () => { if (item.audio.currentSrc) item.status.textContent = 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c lu\u1ed3ng. Th\u1eed t\u00ecm/ph\u00e1t l\u1ea1i.'; });
  });

  async function play(path, queryInput = null, outputId = 'music-output') {
    const query = typeof queryInput === 'string' ? queryInput.trim() : document.getElementById('music-query').value.trim();
    if (path !== 'music/channel3/play' && !query) { document.getElementById(outputId).textContent = 'Nh\u1eadp t\u00ean b\u00e0i h\u00e1t ho\u1eb7c \u0111\u00e0i tr\u01b0\u1edbc.'; return; }
    const url = path === 'music/channel3/play' ? '/api/music/channel3/play?q=VOV3' : `/api/${path}?q=${encodeURIComponent(query)}`;
    const source = path === 'radio/play' ? 'Radio' : path === 'music/channel3/play' ? 'VOV3' : path.includes('youtube') ? 'YouTube' : 'Nh\u1ea1c';
    const playerKey = outputId === 'youtube-output' ? 'youtube' : outputId === 'music-output' ? 'soundcloud' : outputId === 'vov3-output' ? 'vov3' : 'radio';
    const player = players[playerKey].audio;
    stopOtherPlayers(player);
    setTrack(playerKey, path === 'music/channel3/play' ? 'VOV3' : query || source, `\u0110ang k\u1ebft n\u1ed1i t\u1edbi ${source}...`);
    document.getElementById(outputId).textContent = '';
    player.src = url; player.load();
    try { await player.play(); players[playerKey].status.textContent = `\u0110ang ph\u00e1t t\u1eeb ${source}`; }
    catch { players[playerKey].status.textContent = `\u0110\u00e3 m\u1edf lu\u1ed3ng t\u1eeb ${source}. Nh\u1ea5n Play \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.`; }
  }
  document.getElementById('youtube-audio-play').addEventListener('click', () => {
    const query = document.getElementById('youtube-query').value.trim();
    play('music/youtube/play', query, 'youtube-output');
  });
  document.getElementById('radio-play').addEventListener('click', () => {
    const query = document.getElementById('radio-query').value.trim();
    play('radio/play', query, 'radio-output');
  });
  document.getElementById('vov3').addEventListener('click', () => play('music/channel3/play', '', 'vov3-output'));
  document.getElementById('soundcloud-search').addEventListener('click', async () => {
    const q = document.getElementById('music-query').value.trim();
    const out = document.getElementById('music-output');
    if (!q) { out.textContent = 'Nhập tên bài hát hoặc nghệ sĩ trước.'; return; }
    out.textContent = 'Đang tìm trên SoundCloud...';
    try {
      const data = await apiGet('/api/music/soundcloud/search?q=' + encodeURIComponent(q));
      out.innerHTML = data.items?.length ? data.items.map((item, index) => `<div class="item soundcloud-result"><b>${escapeHtml(item.title)}</b><div class="muted">${escapeHtml(item.artist || 'SoundCloud')}${item.duration_seconds ? ` · ${Math.floor(item.duration_seconds / 60)}:${String(item.duration_seconds % 60).padStart(2, '0')}` : ''}</div><button class="play-soundcloud-track" data-url="${escapeHtml(item.url)}" data-title="${escapeHtml(item.title)}">Phát</button></div>`).join('') : 'Không tìm thấy bài hát.';
    } catch (error) { outputError('music-output', error); }
  });
  document.getElementById('music-output').addEventListener('click', async event => {
    const button = event.target.closest('.play-soundcloud-track');
    if (!button) return;
    const params = new URLSearchParams({ url: button.dataset.url, title: button.dataset.title });
    const player = players.soundcloud.audio;
    stopOtherPlayers(player);
    player.src = '/api/music/soundcloud/play?' + params;
    player.load();
    setTrack('soundcloud', button.dataset.title, '\u0110ang k\u1ebft n\u1ed1i t\u1edbi SoundCloud...');
    try { await player.play(); players.soundcloud.status.textContent = '\u0110ang ph\u00e1t t\u1eeb SoundCloud'; }
    catch { players.soundcloud.status.textContent = '\u0110\u00e3 m\u1edf lu\u1ed3ng SoundCloud. Nh\u1ea5n Play \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.'; }
  });

  document.getElementById('briefing-city').value = document.getElementById('city')?.value || 'Ho Chi Minh City';
  document.getElementById('briefing-button').addEventListener('click', async () => {
    try { document.getElementById('briefing-output').textContent = JSON.stringify(await apiGet('/api/briefing?location=' + encodeURIComponent(document.getElementById('briefing-city').value.trim())), null, 2); }
    catch (error) { outputError('briefing-output', error); }
  });
  document.getElementById('gold-button').addEventListener('click', async () => {
    try { document.getElementById('finance-output').textContent = JSON.stringify(await apiGet('/api/gold/sjc'), null, 2); }
    catch (error) { outputError('finance-output', error); }
  });
  document.getElementById('lottery-button').addEventListener('click', async () => {
    try { document.getElementById('finance-output').textContent = JSON.stringify(await apiGet('/api/lottery?region=' + encodeURIComponent(document.getElementById('lottery-region').value)), null, 2); }
    catch (error) { outputError('finance-output', error); }
  });
  document.getElementById('story-button').addEventListener('click', async () => {
    try { const data = await apiGet('/api/story?topic=' + encodeURIComponent(document.getElementById('story-topic').value)); document.getElementById('story-output').innerHTML = `<b>${escapeHtml(data.title)}</b><p>${escapeHtml(data.text)}</p>`; }
    catch (error) { outputError('story-output', error); }
  });
  document.getElementById('wordplay-button').addEventListener('click', async () => {
    try { document.getElementById('story-output').textContent = (await apiGet('/api/wordplay')).text; }
    catch (error) { outputError('story-output', error); }
  });
  document.getElementById('companion-status-button').addEventListener('click', async () => {
    try { document.getElementById('companion-status-output').textContent = JSON.stringify(await apiGet('/api/status'), null, 2); }
    catch (error) { outputError('companion-status-output', error); }
  });
  loadReminders();
})();
