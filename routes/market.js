const express = require('express');
const { getGold, getLottery } = require('../services/market');
const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.get('/gold/sjc', wrap(async (_req, res) => res.json(await getGold())));
router.get('/lottery', wrap(async (req, res) => res.json(await getLottery(req.query.region))));
module.exports = router;
