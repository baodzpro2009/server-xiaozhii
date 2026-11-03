const express = require('express');
const finance = require('../services/finance');
const router = express.Router();
const route = fn => async (req, res, next) => {
  try { res.json(await fn(req)); }
  catch (error) { next(error); }
};
router.get('/finance/overview', route(() => finance.getFinancialOverview()));
router.get('/finance/exchange-rates', route(req => finance.getExchangeRates(req.query.base, req.query.quotes ? String(req.query.quotes).split(',') : undefined)));
router.get('/finance/stock-market', route(req => finance.getStockMarket(req.query.symbols ? String(req.query.symbols).split(',') : undefined)));
router.get('/finance/news', route(req => finance.getFinancialNews(req.query.limit)));
router.get('/finance/crypto-market', route(req => finance.getCryptoMarket(req.query.symbols ? String(req.query.symbols).split(',') : undefined)));
module.exports = router;
