const Parser = require('rss-parser');
const { getGold } = require('./market');

const parser = new Parser({ timeout: 12000 });
const cache = new Map();
const pending = new Map();
const ttlMs = 60_000;
const maxCacheEntries = 32;
const maxPendingRequests = 8;
const defaultQuotes = ['VND', 'EUR', 'GBP', 'JPY', 'CNY', 'THB'];
const defaultIndices = [
  { symbol: '^VNINDEX', name: 'VN-Index' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'Nasdaq Composite' },
  { symbol: '^DJI', name: 'Dow Jones' },
  { symbol: '^N225', name: 'Nikkei 225' },
];
const defaultCrypto = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

function cached(key, load) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < ttlMs) { cache.delete(key); cache.set(key, entry); return Promise.resolve(entry.value); }
  if (entry) cache.delete(key);
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= maxPendingRequests) { const error = new Error('Ngu?n d? li?u ?ang b?n, vui l?ng th? l?i sau'); error.status = 503; throw error; }
  const request = Promise.resolve().then(load).then(value => {
    cache.set(key, { at: Date.now(), value });
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

function cleanupMemory(now = Date.now()) {
  let removed = 0;
  for (const [key, entry] of cache) {
    if (!entry || now - entry.at >= ttlMs) {
      cache.delete(key);
      removed += 1;
    }
  }
  return { removed, remaining_entries: cache.size, pending_requests: pending.size };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Nguồn dữ liệu trả HTTP ${response.status}`);
  return response.json();
}

async function getExchangeRates(base = 'USD', quotes = defaultQuotes) {
  const cleanBase = String(base || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cleanBase)) { const error = new Error('Mã tiền tệ base phải gồm 3 chữ cái, ví dụ USD'); error.status = 400; throw error; }
  let cleanQuotes = [...new Set((Array.isArray(quotes) ? quotes : defaultQuotes).map(x => String(x).trim().toUpperCase()).filter(x => /^[A-Z]{3}$/.test(x) && x !== cleanBase))].slice(0, 20);
  if (!cleanQuotes.length) cleanQuotes = defaultQuotes.filter(code => code !== cleanBase);
  const key = `rates:${cleanBase}:${cleanQuotes.join(',')}`;
  return cached(key, async () => {
    const url = new URL('https://api.frankfurter.dev/v2/rates');
    url.search = new URLSearchParams({ base: cleanBase, quotes: cleanQuotes.join(',') }).toString();
    try {
      const rows = await fetchJson(url);
      return { base: cleanBase, date: rows[0]?.date || null, rates: Object.fromEntries(rows.map(row => [row.quote, row.rate])), source: 'Frankfurter (tỷ giá tham chiếu)' };
    } catch (batchError) {
      // Some provider combinations cannot return every requested currency in
      // one blended query. Retry each valid pair independently so one quote
      // cannot break the whole MCP tool.
      const settled = await Promise.allSettled(cleanQuotes.map(async quote => {
        const pair = await fetchJson(`https://api.frankfurter.dev/v2/rate/${cleanBase.toLowerCase()}/${quote.toLowerCase()}`);
        return [quote, pair.rate, pair.date];
      }));
      const rates = Object.fromEntries(settled.filter(item => item.status === 'fulfilled').map(item => [item.value[0], item.value[1]]));
      const errors = Object.fromEntries(settled.map((item, index) => item.status === 'rejected' ? [cleanQuotes[index], item.reason.message] : null).filter(Boolean));
      if (!Object.keys(rates).length) throw new Error(`Không lấy được tỷ giá: ${batchError.message}; ${Object.values(errors).join('; ')}`);
      const date = settled.find(item => item.status === 'fulfilled')?.value[2] || null;
      return { base: cleanBase, date, rates, errors, source: 'Frankfurter (tỷ giá tham chiếu)' };
    }
  });
}

async function getStockMarket(symbols) {
  const requested = Array.isArray(symbols) && symbols.length
    ? symbols.slice(0, 10).map(symbol => ({ symbol: String(symbol).trim().toUpperCase(), name: String(symbol).trim().toUpperCase() }))
    : defaultIndices;
  if (requested.some(item => !/^[A-Z0-9^=.-]{1,24}$/.test(item.symbol))) { const error = new Error('Có mã chỉ số chứng khoán không hợp lệ'); error.status = 400; throw error; }
  return cached(`stocks:${requested.map(x => x.symbol).join(',')}`, async () => {
    const settled = await Promise.allSettled(requested.map(async item => {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}`);
      url.search = new URLSearchParams({ range: '5d', interval: '1d' });
      const data = await fetchJson(url, { headers: { 'user-agent': 'Mozilla/5.0 XiaoZhi-API/1.0' } });
      const result = data.chart?.result?.[0];
      if (!result) throw new Error(data.chart?.error?.description || `Không có dữ liệu ${item.symbol}`);
      const quote = result.indicators?.quote?.[0] || {};
      const closes = (quote.close || []).filter(Number.isFinite);
      const price = Number(result.meta?.regularMarketPrice ?? closes.at(-1));
      const previous = Number(result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? closes.at(-2));
      return { symbol: item.symbol, name: item.name, value: Number.isFinite(price) ? price : null, change: Number.isFinite(price) && Number.isFinite(previous) ? price - previous : null, change_percent: Number.isFinite(price) && Number.isFinite(previous) && previous !== 0 ? (price - previous) / previous * 100 : null, currency: result.meta?.currency || null, market_time: result.meta?.regularMarketTime ? new Date(result.meta.regularMarketTime * 1000).toISOString() : null };
    }));
    const items = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
    const errors = settled.map((result, index) => result.status === 'rejected' ? { symbol: requested[index].symbol, error: result.reason.message } : null).filter(Boolean);
    if (!items.length) throw new Error(errors.map(item => `${item.symbol}: ${item.error}`).join('; ') || 'Không lấy được dữ liệu chỉ số');
    return { items, errors, source: 'Yahoo Finance chart data' };
  });
}

async function getCryptoMarket(symbols = defaultCrypto) {
  const requested = (Array.isArray(symbols) && symbols.length ? symbols : defaultCrypto).slice(0, 10).map(value => String(value).trim().toUpperCase());
  if (requested.some(symbol => !/^[A-Z0-9]{5,20}$/.test(symbol))) { const error = new Error('Mã crypto phải là cặp giao dịch như BTCUSDT'); error.status = 400; throw error; }
  return cached(`crypto:${requested.join(',')}`, async () => {
    const url = new URL('https://data-api.binance.vision/api/v3/ticker/24hr');
    url.searchParams.set('symbols', JSON.stringify(requested));
    const rows = await fetchJson(url);
    return { items: rows.map(row => ({ symbol: row.symbol, price: Number(row.lastPrice), change_24h_percent: Number(row.priceChangePercent), high_24h: Number(row.highPrice), low_24h: Number(row.lowPrice), quote_volume_24h: Number(row.quoteVolume), trades_24h: Number(row.count), quote_currency: row.symbol.replace(/^[A-Z0-9]+?(USDT|USDC|BTC|ETH|BNB)$/, '$1') })), updated_at: new Date().toISOString(), source: 'Binance public spot market data' };
  });
}

async function getFinancialNews(limit = 8) {
  const count = Math.max(1, Math.min(20, Number.parseInt(limit, 10) || 8));
  return cached('financial-news', async () => {
    const feed = await parser.parseURL(process.env.FINANCIAL_NEWS_RSS_URL || 'https://vnexpress.net/rss/kinh-doanh.rss');
    return (feed.items || []).slice(0, 20).map(item => ({ title: item.title || '', url: item.link || '', published_at: item.isoDate || item.pubDate || null, summary: String(item.contentSnippet || item.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500), source: 'VnExpress Kinh doanh' })).filter(item => item.title && item.url);
  }).then(items => ({ items: items.slice(0, count), source: 'VnExpress Kinh doanh RSS' }));
}

async function getFinancialOverview() {
  const [gold, rates, stocks, crypto, news] = await Promise.allSettled([
    getGold(), getExchangeRates(), getStockMarket(), getCryptoMarket(), getFinancialNews(5),
  ]);
  const part = result => result.status === 'fulfilled' ? result.value : null;
  return {
    updated_at: new Date().toISOString(),
    gold_sjc: part(gold), exchange_rates: part(rates), stock_market: part(stocks), crypto_market: part(crypto), financial_news: part(news),
    errors: Object.fromEntries([['gold_sjc', gold], ['exchange_rates', rates], ['stock_market', stocks], ['crypto_market', crypto], ['financial_news', news]].filter(([, result]) => result.status === 'rejected').map(([name, result]) => [name, result.reason.message])),
    note: 'Dữ liệu tham khảo từ các nhà cung cấp; thời điểm cập nhật và độ trễ khác nhau theo nguồn.',
  };
}

module.exports = { getFinancialOverview, getExchangeRates, getStockMarket, getFinancialNews, getCryptoMarket, cleanupMemory };
