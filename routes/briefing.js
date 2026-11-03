const express = require('express');
const { getBriefing } = require('../services/briefing');
const reminders = require('../services/reminders');
const router = express.Router();
router.get('/', async (req, res, next) => {
  const city = String(req.query.city || req.query.location || process.env.DEFAULT_CITY || '').trim();
  if (!city || city.length > 120) return res.status(400).json({ error: 'city phải có từ 1 đến 120 ký tự' });
  try { res.json(await getBriefing(city, req.query.deviceId || req.body?.deviceId)); }
  catch (error) { next(error); }
});
module.exports = router;
