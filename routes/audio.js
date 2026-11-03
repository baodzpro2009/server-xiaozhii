const express = require('express');
const audio = require('../services/audio');
const { searchYouTube } = require('../services/youtube');
const router = express.Router();
function query(req, res, fallback) {
  const value = String(req.query.q || fallback || '').trim();
  if (!value || value.length > 120) { res.status(400).json({ error: 'q phải có từ 1 đến 120 ký tự' }); return null; }
  return value;
}
router.get('/music/youtube/search', async (req, res, next) => {
  const q = query(req, res);
  if (!q) return;
  try {
    res.json({ query: q, items: await searchYouTube(q, req.query.limit) });
  } catch (error) {
    next(error);
  }
});
router.get('/music/youtube/play', (req, res) => {
  const videoUrl = String(req.query.url || '').trim();
  if (videoUrl) {
    let parsed;
    try { parsed = new URL(videoUrl); } catch { return res.status(400).json({ error: 'URL YouTube không hợp lệ' }); }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
      return res.status(400).json({ error: 'Chỉ chấp nhận URL YouTube' });
    }
    return audio.playYouTubeWeb(req, res, parsed.toString(), String(req.query.title || ''));
  }
  const q = query(req, res);
  if (q) audio.playSearch(req, res, q, 'ytsearch1:', 'scsearch1:');
});
router.get('/music/youtube/web-play', (req, res) => {
  const videoUrl = String(req.query.url || '').trim();
  let parsed;
  try { parsed = new URL(videoUrl); } catch { return res.status(400).json({ error: 'URL YouTube không hợp lệ' }); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
    return res.status(400).json({ error: 'Chỉ chấp nhận URL YouTube' });
  }
  return audio.playYouTubeWeb(req, res, parsed.toString(), String(req.query.title || 'YouTube audio'));
});
router.get('/music/soundcloud/search', async (req, res, next) => {
  const q = query(req, res); if (!q) return;
  try { res.json({ query: q, items: await audio.searchSoundCloud(q, req.query.limit) }); }
  catch (error) { next(error); }
});
router.get('/music/soundcloud/play', (req, res) => {
  const trackUrl = String(req.query.url || '').trim();
  if (trackUrl) {
    let parsed;
    try { parsed = new URL(trackUrl); } catch { return res.status(400).json({ error: 'URL SoundCloud không hợp lệ' }); }
    if (!['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(parsed.hostname.toLowerCase())) return res.status(400).json({ error: 'Chỉ chấp nhận URL SoundCloud' });
    return audio.playSoundCloudTrack(req, res, parsed.toString(), String(req.query.title || 'SoundCloud')).catch(error => {
      console.error('[SoundCloud] track playback failed:', error.stack || error);
      if (!res.headersSent) res.status(error.status || 502).json({ error: error.message || 'Không phát được SoundCloud' });
      else if (!res.destroyed) res.destroy(error);
    });
  }
  const q = query(req, res); if (q) audio.playSoundCloudSearch(req, res, q).catch(error => {
    console.error('[SoundCloud] search playback failed:', error.stack || error);
    if (!res.headersSent) res.status(error.status || 502).json({ error: error.message || 'Không phát được SoundCloud' });
    else if (!res.destroyed) res.destroy(error);
  });
});
router.get('/music/channel3/play', (req, res) => {
  const q = query(req, res, 'VOV3'); if (!q) return;
  // The old playlist can point to expired AAC segments. Use VOV's current live HLS manifest.
  const configured = process.env.MUSIC_CHANNEL_3_URL || '';
  const defaultStream = 'https://str.vov.gov.vn/vovlive/vov3.sdp_aac/playlist.m3u8';
  const template = configured && !configured.includes('audio-lss.vov.vn/han/live/vov3') && !configured.includes('str.vov.gov.vn/vovlive/vov3.sdp_aac')
    ? configured
    : defaultStream;
  const url = template.replaceAll('{query}', encodeURIComponent(q));
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Nguồn radio phải dùng HTTP hoặc HTTPS' });
  const backupUrl = url === defaultStream
    ? 'https://str.vov.gov.vn/vovlive/vov3.sdp_aac/chunklist_w492252150.m3u8'
    : defaultStream;
  audio.playRadio(req, res, url, 'VOV3 radio', backupUrl);
});
router.get('/radio/play', async (req, res, next) => {
  const q = query(req, res); if (!q) return;
  try {
    const url = new URL('https://de1.api.radio-browser.info/json/stations/search');
    url.search = new URLSearchParams({ name: q, limit: '5', hidebroken: 'true', order: 'votes', reverse: 'true' });
    const response = await fetch(url, { headers: { 'user-agent': 'XiaoZhi-API/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Radio Browser returned HTTP ${response.status}`);
    const stations = await response.json();
    const station = stations.find(item => item.url_resolved && /^https?:\/\//i.test(item.url_resolved));
    if (!station) return res.status(404).json({ error: 'Không tìm thấy đài có thể phát' });
    audio.playRadio(req, res, station.url_resolved, station.name || q);
  } catch (error) { next(error); }
});
module.exports = router;
