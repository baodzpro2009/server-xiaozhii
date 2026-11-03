const express = require('express');
const { news, story, wordplay } = require('../services/content');
const { findById } = require('../services/news');
const audio = require('../services/audio');
const { getServerStatus } = require('../services/server-status');
const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.get('/news', wrap(async (req, res) => {
  const items = await news();
  const limit = Math.max(1, Math.min(10, Number.parseInt(req.query.limit, 10) || 5));
  res.json({ items: items.slice(0, limit), source: 'RSS' });
}));
router.get('/news/detail', wrap(async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'missing_id' });
  const item = findById(await news(), id);
  return item ? res.json(item) : res.status(404).json({ error: 'news_not_found' });
}));
router.get('/story', (req, res) => res.json({ ...story(req.query.topic), language: 'vi', instruction: 'Đọc truyện chậm, ấm áp cho người nghe.' }));
router.get('/wordplay', (_req, res) => res.json({ text: wordplay(), language: 'vi' }));
router.get(['/status', '/saver'], wrap(async (_req, res) => res.json({ ...await getServerStatus(), audio_queue: audio.queueStatus() }))); 
module.exports = router;
