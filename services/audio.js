const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { configuredYtDlpRuntime, youtubeCookies } = require('./ytdlp-config');

function safeAudioLog(value) {
  return String(value).replace(/https?:\/\/[^\s\"'<>]+/gi, '[URL]');
}

const scdl = require('soundcloud-downloader').default;
scdl.axios.defaults.timeout = 20000;
function ytDlpExecutable() {
  const configured = String(process.env.YT_DLP_BIN || '').trim();
  try { if (configured && fs.statSync(configured).isFile()) return configured; } catch {}
  const bundled = path.join(__dirname, '..', 'yt-dlp', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(bundled)) return bundled;
  return configured || 'yt-dlp';
}
function ytDlpEnvironment(prefix) {
  if (prefix === 'scsearch1:' || !/^node(?::|$)/i.test(configuredYtDlpRuntime())) return process.env;

  // KataBump's small containers have limited memory. The YouTube EJS challenge
  // solver runs Node as a child of yt-dlp; without a heap cap the kernel can
  // SIGKILL that child (yt-dlp reports return code -9) while ffmpeg is active.
  const maxHeapMb = Math.max(32, Math.min(192,
    Number.parseInt(process.env.YT_DLP_JS_NODE_MAX_OLD_SPACE_MB, 10) || 96));
  const env = { ...process.env };
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --max-old-space-size=${maxHeapMb}`.trim();
  return env;
}
let active = 0;
// Constrain FFmpeg/yt-dlp child processes on small 512 MiB hosts by default.
// Additional requests wait in the existing queue instead of spawning more workers.
const limit = Math.max(1, Math.min(8, Number.parseInt(process.env.MAX_CONCURRENT_STREAMS, 10) || 1));
const maxQueued = Math.max(1, Math.min(100, Number.parseInt(process.env.AUDIO_MAX_QUEUE, 10) || 12));
const queueTimeoutMs = Math.max(10000, Math.min(600000, Number.parseInt(process.env.AUDIO_QUEUE_TIMEOUT_MS, 10) || 25000));
const waiters = [];
const activeRadioStreams = new Map();
const queuedRadioStreams = new Map();
function titleHeader(value) {
  const maxEncodedLength = 180;
  let encoded = '';
  for (const character of String(value || 'XiaoZhi audio')) {
    const encodedCharacter = encodeURIComponent(character);
    if (encoded.length + encodedCharacter.length > maxEncodedLength) break;
    encoded += encodedCharacter;
  }
  return encoded || encodeURIComponent('XiaoZhi audio');
}
const youtubeProxyTimeoutMs = Math.max(5000, Number(process.env.YOUTUBE_PROXY_TIMEOUT_MS) || 15000);
const firstAudioTimeoutMs = Math.max(5000, Number(process.env.AUDIO_FIRST_BYTE_TIMEOUT_MS) || 10000);
const youtubeFirstAudioTimeoutMs = Math.max(firstAudioTimeoutMs, Math.min(60000, Number.parseInt(process.env.YOUTUBE_FIRST_BYTE_TIMEOUT_MS, 10) || 30000));
const youtubeBlockCooldownMs = Math.max(60000, Number(process.env.YOUTUBE_BLOCK_COOLDOWN_MS) || 10 * 60 * 1000);
let youtubeBlockedUntil = 0;
function markYoutubeBlocked(error) {
  const message = String(error?.message || error || '');
  if (/confirm you.?re not a bot|sign in to confirm|not a bot|automated requests/i.test(message)) {
    if (youtubeBlockedUntil > Date.now()) return;
    youtubeBlockedUntil = Date.now() + youtubeBlockCooldownMs;
    console.warn(`[YouTube] verification block detected; pausing YouTube resolves for ${Math.ceil(youtubeBlockCooldownMs / 60000)} minutes`);
  }
}
function youtubeBlockRemainingMs() { return Math.max(0, youtubeBlockedUntil - Date.now()); }
async function resolveYoutubeProxyAudio(query, prefix = 'ytsearch1:') {
  const configured = String(process.env.YOUTUBE_PROXY_URL || '').trim();
  if (!configured) throw new Error('YOUTUBE_PROXY_URL is not configured');
  const base = new URL(configured);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('YOUTUBE_PROXY_URL must use HTTP or HTTPS');
  base.pathname = `${base.pathname.replace(/\/$/, '')}${prefix ? '/search' : '/proxy'}`;
  base.search = '';
  base.searchParams.set(prefix ? 'q' : 'url', prefix ? query : query);
  const response = await fetch(base, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(youtubeProxyTimeoutMs) });
  let data;
  try { data = await response.json(); } catch { throw new Error(`YouTube proxy returned invalid JSON (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(data?.detail || data?.error || `YouTube proxy returned HTTP ${response.status}`);
  const audioUrl = String(data?.audio_url || '').trim();
  let parsed;
  try { parsed = new URL(audioUrl); } catch { throw new Error('YouTube proxy response did not contain a valid audio_url'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('YouTube proxy returned an unsupported audio URL');
  return audioUrl;
}
function encodeRemoteAudio(audioUrl, outputFormat = 'opus') {
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
  const encoderArgs = outputFormat === 'mp3'
    ? ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', audioUrl, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1']
    : ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', audioUrl, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-compression_level', '2', '-b:a', '32k', '-application', 'audio', '-frame_duration', '60', '-f', 'ogg', 'pipe:1'];
  return spawn(ffmpeg, encoderArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}
function detachWaiter(waiter) {
  const index = waiters.indexOf(waiter);
  if (index >= 0) waiters.splice(index, 1);
  if (waiter.streamKey && queuedRadioStreams.get(waiter.streamKey) === waiter) queuedRadioStreams.delete(waiter.streamKey);
  clearTimeout(waiter.timer);
  waiter.req.removeListener('aborted', waiter.cancel);
  waiter.res.removeListener('close', waiter.cancel);
}
function reserveAudio(req, res, streamKey = null) {
  if (streamKey) {
    const previous = queuedRadioStreams.get(streamKey);
    if (previous) { previous.res.destroy(); previous.cancel(); }
  }
  if (req.aborted || res.destroyed) return Promise.resolve(false);
  if (active < limit) { active += 1; return Promise.resolve(true); }
  if (waiters.length >= maxQueued) { res.status(503).json({ error: 'Hàng đợi nhạc đã đầy, vui lòng thử lại sau' }); return Promise.resolve(false); }
  return new Promise(resolve => {
    const waiter = { req, res, resolve, timer: null, cancel: null, streamKey };
    waiter.cancel = () => { detachWaiter(waiter); resolve(false); };
    waiter.timer = setTimeout(() => {
      detachWaiter(waiter);
      if (!req.aborted && !res.destroyed && !res.headersSent) res.status(503).json({ error: 'Hết thời gian chờ lượt phát nhạc' });
      resolve(false);
    }, queueTimeoutMs);
    req.once('aborted', waiter.cancel);
    res.once('close', waiter.cancel);
    waiters.push(waiter);
    if (streamKey) queuedRadioStreams.set(streamKey, waiter);
  });
}
function releaseAudio() {
  while (waiters.length) {
    const waiter = waiters.shift();
    clearTimeout(waiter.timer);
    waiter.req.removeListener('aborted', waiter.cancel);
    waiter.res.removeListener('close', waiter.cancel);
    if (waiter.streamKey && queuedRadioStreams.get(waiter.streamKey) === waiter) queuedRadioStreams.delete(waiter.streamKey);
    if (waiter.req.aborted || waiter.res.destroyed || waiter.res.writableEnded) continue;
    waiter.resolve(true);
    return;
  }
  active = Math.max(0, active - 1);
}
async function streamProcess(req, res, createChild, title, reserved = false, contentType = 'audio/ogg', fallback, fallbackLabel = 'SoundCloud fallback', streamKey = null) {
  if (!reserved && !await reserveAudio(req, res, streamKey)) return;
  let child;
  try { child = createChild(); }
  catch (error) { console.error('[audio] process start failed:', error.stack || error); releaseAudio(); if (!res.headersSent && !res.destroyed) res.status(503).json({ error: `Không khởi động được audio: ${error.message}` }); return; }
  let released = false; let started = false;
  const release = () => { if (!released) { released = true; releaseAudio(); } };
  const stop = () => { if (!child.killed) child.kill('SIGTERM'); if (child.sourceProcess && !child.sourceProcess.killed) child.sourceProcess.kill('SIGTERM'); child.inputStream?.destroy(); release(); };
  let radioRecord;
  const clearRadioRecord = () => { if (streamKey && activeRadioStreams.get(streamKey) === radioRecord) activeRadioStreams.delete(streamKey); };
  if (streamKey) {
    radioRecord = { replace: () => { stop(); if (!res.destroyed) res.destroy(); } };
    activeRadioStreams.set(streamKey, radioRecord);
  }
  req.once('aborted', () => { clearRadioRecord(); stop(); });
  res.once('close', () => { clearRadioRecord(); if (!res.writableEnded) stop(); });
  child.stderr?.on('data', chunk => console.error('[ffmpeg]', safeAudioLog(chunk.toString().trim())));
  const firstByteTimeoutMs = Math.max(firstAudioTimeoutMs, Number(child.firstAudioTimeoutMs) || 0);
  const firstAudioTimer = setTimeout(() => {
    if (started || res.destroyed || res.writableEnded) return;
    console.error('[audio] no audio data after ' + firstByteTimeoutMs + 'ms; stopping stalled stream');
    child.kill('SIGTERM');
    if (child.sourceProcess && !child.sourceProcess.killed) child.sourceProcess.kill('SIGTERM');
    child.inputStream?.destroy();
  }, firstByteTimeoutMs);
  firstAudioTimer.unref?.();
  child.once('error', error => { clearTimeout(firstAudioTimer); clearRadioRecord(); console.error('[audio] process error:', error.stack || error); release(); if (!res.headersSent) res.status(503).json({ error: `Không khởi động được audio: ${error.message}` }); else if (!res.destroyed) res.destroy(error); });
  child.stdout.once('data', chunk => {
    clearTimeout(firstAudioTimer);
    if (res.destroyed || res.writableEnded) return;
    started = true;
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-xiaozhi-track-title': titleHeader(title) });
    res.write(chunk); child.stdout.pipe(res);
  });
  child.once('close', code => {
    clearTimeout(firstAudioTimer);
    clearRadioRecord();
    if (res.destroyed || res.writableEnded) { release(); return; }
    if (!started && code !== 0) console.error(`[audio] stream produced no audio (exit ${code})`);
    if (!started && fallback) {
      // Once headers are sent, the response cannot be recovered. For a failure
      // before audio starts, release the slot and let the alternate provider
      // acquire one through its normal playback path.
      console.error(`[audio] primary stream failed before producing audio (exit ${code}); trying ${fallbackLabel}`);
      release();
      fallback().catch(error => {
        console.error('[SoundCloud fallback] playback failed:', error.stack || error);
        if (!res.headersSent && !res.destroyed) res.status(error.status || 502).json({ error: error.message || 'SoundCloud playback failed' });
      });
      return;
    }
    release();
    if (!started) res.status(502).json({ error: `Không tạo được luồng Opus (exit ${code})` });
    else if (code === 0) res.end();
    else {
      console.error(`[audio] stream process exited with code ${code} after audio started; ending HTTP response so the client can detect the incomplete audio stream`);
      // Keep HTTP chunked framing valid when the encoder fails. The Ogg body
      // remains incomplete so the device can detect the failed track and retry.
      res.end();
    }
  });
}
function search(query, prefix, outputFormat = 'opus') {
  const ytdlp = ytDlpExecutable();
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
  const ytdlpArgs = ['--ignore-config', '--no-playlist', '--quiet', '--socket-timeout', '20'];
  if (prefix !== 'scsearch1:') {
    const jsRuntime = configuredYtDlpRuntime();
    if (jsRuntime) ytdlpArgs.push('--js-runtimes', jsRuntime);
    if (youtubeCookies) ytdlpArgs.push('--cookies', youtubeCookies);
    // Let yt-dlp choose its maintained defaults. Hard-coding older clients
    // (web/ios/web_embedded) can return no direct audio formats on current YouTube.
    const clients = String(process.env.YT_DLP_PLAYER_CLIENTS || '').split(',').map(client => client.trim()).filter(Boolean);
    if (clients.length) ytdlpArgs.push('--extractor-args', `youtube:player_client=${clients.join(',')}`);
  }
  // Accept muxed formats when this YouTube client has no audio-only stream.
  ytdlpArgs.push('--format', 'bestaudio/best', '--output', '-', `${prefix}${query}`);
  const source = spawn(ytdlp, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: ytDlpEnvironment(prefix) });
  const encoderArgs = outputFormat === 'mp3'
    ? ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1']
    : ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-compression_level', '2', '-b:a', '32k', '-application', 'audio', '-frame_duration', '60', '-f', 'ogg', 'pipe:1'];
  const encoder = spawn(ffmpeg, encoderArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  encoder.stdin.on('error', () => {});
  let ytDlpStderr = '';
  source.stderr.on('data', chunk => {
    const message = chunk.toString();
    ytDlpStderr = (ytDlpStderr + message).slice(-4000);
    console.error('[yt-dlp]', safeAudioLog(message.trim()));
    const verificationBlocked = /confirm you.?re not a bot|sign in to confirm|not a bot|automated requests/i.test(ytDlpStderr);
    const noUsableFormat = /requested format is not available|only images are available/i.test(ytDlpStderr);
    if (prefix !== 'scsearch1:' && (verificationBlocked || noUsableFormat)) {
      if (verificationBlocked) markYoutubeBlocked(ytDlpStderr);
      // Stop FFmpeg now so streamProcess can start SoundCloud without waiting
      // for the first-byte timeout after YouTube has already rejected access.
      if (!encoder.killed) encoder.kill('SIGTERM');
      if (!source.killed) source.kill('SIGTERM');
    }
  });
  source.once('error', error => {
    console.error('[yt-dlp] process error:', error.stack || error);
    if (!encoder.stdin.destroyed) encoder.stdin.destroy(error);
  });
  source.once('close', code => {
    if (code === 0 && !source.killed) {
      encoder.stdin.end();
      return;
    }
    const error = new Error(`yt-dlp exited with code ${code}${source.killed ? ' after being stopped' : ''}`);
    console.error(`[yt-dlp] ${error.message} after ${encoder.stdout.readableLength} encoded bytes`);
    // Closing FFmpeg stdin would look like normal EOF and can make FFmpeg write
    // a valid Ogg EOS page for a truncated song. Kill the encoder so the device
    // can detect the incomplete stream and resume instead of accepting a short
    // clip as the complete track.
    if (!encoder.killed) encoder.kill('SIGTERM');
    if (!encoder.stdin.destroyed) encoder.stdin.destroy(error);
  });
  // Wait for yt-dlp's exit status before sending EOF to FFmpeg. A default
  // pipe() would end stdin as soon as stdout closes, even if yt-dlp failed.
  source.stdout.pipe(encoder.stdin, { end: false });
  encoder.once('close', code => { if (code !== 0 && !source.killed) source.kill('SIGTERM'); });
  encoder.sourceProcess = source;
  if (prefix !== 'scsearch1:') encoder.firstAudioTimeoutMs = youtubeFirstAudioTimeoutMs;
  return encoder;
}
async function searchSoundCloud(query, limit = 8) {
  const count = Math.max(1, Math.min(10, Number.parseInt(limit, 10) || 8));
  const result = await scdl.search({ query, limit: count, resourceType: 'tracks' });
  return (result?.collection || []).filter(track => track?.streamable && track?.permalink_url).slice(0, count).map(track => ({
    id: track.id || '', title: track.title || 'Không rõ tên bài', artist: track.user?.username || track.publisher_metadata?.artist || '',
    url: track.permalink_url, thumbnail: track.artwork_url || null,
    duration_seconds: Number.isFinite(track.duration) ? Math.round(track.duration / 1000) : null,
    streamable: Boolean(track.streamable),
  }));
}
function radio(url) {
  const userAgent = 'Mozilla/5.0 (compatible; XiaoZhiRadio/1.0)';
  const headers = `User-Agent: ${userAgent}\r
Accept: */*\r
`;
  return spawn(process.env.FFMPEG_BIN || 'ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-user_agent', userAgent, '-headers', headers, '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-rw_timeout', '15000000', '-i', url, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-compression_level', '2', '-b:a', '32k', '-application', 'audio', '-frame_duration', '60', '-f', 'ogg', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}
async function playYtDlpSearch(req, res, query, prefix, fallbackPrefix) {
  const fallback = fallbackPrefix ? () => playSoundCloudSearch(req, res, query) : undefined;
  if (prefix !== 'scsearch1:' && youtubeBlockRemainingMs() > 0) {
    if (fallback) return fallback();
    if (!res.headersSent && !res.destroyed) return res.status(503).json({ error: 'YouTube is temporarily blocked by bot verification; retry later.' });
    return;
  }
  if (prefix !== 'scsearch1:' && process.env.YOUTUBE_PROXY_URL) {
    try {
      const audioUrl = await resolveYoutubeProxyAudio(query, prefix);
      return streamProcess(req, res, () => encodeRemoteAudio(audioUrl), query, false, 'audio/ogg', fallback);
    } catch (error) {
      markYoutubeBlocked(error);
      console.error('[YouTube proxy] search/resolve failed:', error.stack || error);
      if (fallback) {
        try { return await fallback(); }
        catch (fallbackError) {
          console.error('[SoundCloud fallback] search failed:', fallbackError.stack || fallbackError);
          if (!res.headersSent && !res.destroyed) return res.status(fallbackError.status || 502).json({ error: fallbackError.message || 'YouTube proxy and SoundCloud fallback failed' });
          return;
        }
      }
      if (!res.headersSent && !res.destroyed) return res.status(502).json({ error: 'YouTube proxy không lấy được luồng âm thanh', detail: error.message });
      return;
    }
  }
  return streamProcess(req, res, () => search(query, prefix), query, false, 'audio/ogg', fallback);
}
async function playSearch(req, res, query, prefix, fallbackPrefix) {
  // The local endpoint test confirmed this yt-dlp path produces valid Ogg/Opus.
  // The experimental InnerTube and ytdl-core paths stalled or returned 403 here.
  return playYtDlpSearch(req, res, query, prefix, fallbackPrefix);
}
async function playYouTubeWeb(req, res, url, title) {
  const fallback = title && !/^youtube audio$/i.test(title.trim())
    ? () => playSoundCloudSearch(req, res, title)
    : undefined;
  if (process.env.YOUTUBE_PROXY_URL) {
    try {
      const audioUrl = await resolveYoutubeProxyAudio(url, '');
      return streamProcess(req, res, () => encodeRemoteAudio(audioUrl, 'mp3'), title || 'YouTube audio', false, 'audio/mpeg', fallback);
    } catch (error) {
      markYoutubeBlocked(error);
      console.error('[YouTube proxy] URL resolve failed:', error.stack || error);
      if (fallback) {
        try { return await fallback(); }
        catch (fallbackError) {
          console.error('[SoundCloud fallback] URL playback failed:', fallbackError.stack || fallbackError);
          if (!res.headersSent && !res.destroyed) return res.status(fallbackError.status || 502).json({ error: fallbackError.message || 'YouTube and SoundCloud playback failed' });
          return;
        }
      }
      if (!res.headersSent && !res.destroyed) return res.status(502).json({ error: 'YouTube proxy không lấy được luồng âm thanh', detail: error.message });
      return;
    }
  }
  const ytDlpFallback = () => {
    if (youtubeBlockRemainingMs() > 0) {
      if (fallback) return fallback();
      if (!res.headersSent && !res.destroyed) return res.status(503).json({ error: 'YouTube is temporarily blocked by bot verification; retry later.' });
      return;
    }
    return streamProcess(req, res, () => search(url, '', 'mp3'), title || 'YouTube audio', false, 'audio/mpeg', fallback);
  };
  return ytDlpFallback();
}
async function playSoundCloudTrack(req, res, url, title) {
  if (!await reserveAudio(req, res)) return;
  let cancelled = req.aborted || res.destroyed;
  let ownsSlot = true;
  const releaseSlot = () => { if (ownsSlot) { ownsSlot = false; releaseAudio(); } };
  let input;
  let downloadTimer;
  let downloadTimedOut = false;
  const cancelPending = () => { cancelled = true; if (input) input.destroy(); else { downloadTimedOut = true; releaseSlot(); } };
  req.once('aborted', cancelPending);
  res.once('close', cancelPending);
  try {
    const downloadPromise = scdl.download(url);
    // The package timeout applies to HTTP requests, but guard the full stream
    // setup as well so a stalled SoundCloud response cannot hold the only slot.
    downloadPromise.then(stream => { if (cancelled || downloadTimedOut) stream?.destroy?.(); }, () => {});
    input = await Promise.race([downloadPromise, new Promise((_, reject) => {
      downloadTimer = setTimeout(() => {
        downloadTimedOut = true;
        reject(new Error(`SoundCloud stream setup timed out after ${firstAudioTimeoutMs}ms`));
      }, firstAudioTimeoutMs);
      downloadTimer.unref?.();
    })]);
    clearTimeout(downloadTimer);
    req.removeListener('aborted', cancelPending);
    res.removeListener('close', cancelPending);
    if (cancelled || req.aborted || res.destroyed) { input.destroy?.(); releaseSlot(); return; }
    ownsSlot = false; // streamProcess now releases the reserved audio slot.
    return await streamProcess(req, res, () => {
      const encoder = spawn(process.env.FFMPEG_BIN || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-compression_level', '2', '-b:a', '32k', '-application', 'audio', '-frame_duration', '60', '-f', 'ogg', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      encoder.stdin.on('error', () => {});
      encoder.inputStream = input;
      input.once('error', error => { console.error('SoundCloud stream failed:', error.message); encoder.stdin.destroy(error); });
      input.pipe(encoder.stdin);
      return encoder;
    }, title, true);
  } catch (error) {
    clearTimeout(downloadTimer);
    console.error('[SoundCloud] stream setup failed:', error.stack || error);
    req.removeListener('aborted', cancelPending);
    res.removeListener('close', cancelPending);
    if (!cancelled && !req.aborted && !res.destroyed && !res.headersSent) res.status(error.status || 502).json({ error: error.message || 'SoundCloud playback failed' });
    if (input) input.destroy?.();
    releaseSlot();
  }
}
async function playSoundCloudSearch(req, res, query) {
  const result = await scdl.search({ query, limit: 8, resourceType: 'tracks' });
  const track = (result?.collection || []).find(item => item?.streamable && item?.permalink_url);
  if (!track) { res.status(404).json({ error: 'SoundCloud không tìm thấy bài hát có thể phát' }); return; }
  await playSoundCloudTrack(req, res, track.permalink_url, track.title || query);
}
function playRadio(req, res, url, title, fallbackUrl) {
  const fallback = fallbackUrl ? () => playRadio(req, res, fallbackUrl, title) : undefined;
  const streamKey = 'radio:' + String(req.query.deviceId || req.ip || 'default');
  const previous = activeRadioStreams.get(streamKey);
  if (previous) previous.replace();
  return streamProcess(req, res, () => radio(url), title, false, 'audio/ogg', fallback, 'alternate radio stream', streamKey);
}
function activeStreams() { return active; }
function queueStatus() { return { active, queued: waiters.length, limit, max_queued: maxQueued }; }
module.exports = { playSearch, playYouTubeWeb, playSoundCloudTrack, playSoundCloudSearch, searchSoundCloud, playRadio, activeStreams, queueStatus };
