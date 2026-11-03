const express = require('express');
const { searchYouTube, saveSearch, savePlay, history, favorites, addFavorite, removeFavorite } = require('../services/youtube');

const router = express.Router();
const defaultDevice = () => process.env.DEFAULT_DEVICE_ID || 'xiaozhi';

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Thiếu từ khóa q' });
    const deviceId = String(req.query.deviceId || defaultDevice());
    const results = await searchYouTube(q, req.query.limit);
    try { await saveSearch(deviceId, q, results); }
    catch (error) { console.warn('[YouTube search] could not save search history:', error.message); }
    res.json({ ok: true, query: q, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/play', async (req, res) => {
  try {
    const deviceId = String(req.body.deviceId || defaultDevice());
    const video = req.body.video;
    if (!video?.videoId || !video?.title) return res.status(400).json({ error: 'Thiếu thông tin video' });
    await savePlay(deviceId, video);
    res.json({
      ok: true,
      videoId: video.videoId,
      title: video.title,
      url: video.url || `https://www.youtube.com/watch?v=${video.videoId}`,
      message: 'Đã lưu vào lịch sử phát',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/history/:deviceId', async (req, res) => {
  try {
    res.json({ ok: true, items: await history(req.params.deviceId, req.query.limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/favorites/:deviceId', async (req, res) => {
  try {
    res.json({ ok: true, items: await favorites(req.params.deviceId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/favorites', async (req, res) => {
  try {
    const deviceId = String(req.body.deviceId || defaultDevice());
    const video = req.body.video;
    if (!video?.videoId || !video?.title) return res.status(400).json({ error: 'Thiếu thông tin video' });
    await addFavorite(deviceId, video);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/favorites/:deviceId/:videoId', async (req, res) => {
  try {
    await removeFavorite(req.params.deviceId, req.params.videoId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
