const express = require('express');
const service = require('../services/reminders');
const router = express.Router();
const device = req => req.query.deviceId || req.body?.deviceId;
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/', wrap(async (req, res) => res.json(await service.listReminders(device(req), req.query.scope === 'upcoming' ? 'upcoming' : 'today'))));
router.post('/', wrap(async (req, res) => res.status(201).json({ ok: true, reminder: await service.addReminder(device(req), req.body?.title, req.body?.due_at) })));
router.delete('/:id', wrap(async (req, res) => res.json({ ok: true, removed: await service.deleteReminder(device(req), req.params.id) })));
module.exports = router;
