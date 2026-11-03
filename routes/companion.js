const express = require('express');
const crypto = require('node:crypto');
const os = require('node:os');
const audioService = require('../services/audio');
const { query } = require('../db');
const { getWeather, toSpeech } = require('../services/weather');
const { latest } = require('../services/news');
const { getServerStatus } = require('../services/server-status');

const router = express.Router();
const stories = [
  { title: 'Chiếc đèn nhỏ', text: 'Một chiếc đèn nhỏ nghĩ rằng ánh sáng của mình chẳng đáng kể. Đêm nọ, cả khu phố mất điện. Ánh đèn ấy soi lối cho một em bé về nhà. Từ đó, chiếc đèn hiểu rằng một việc tốt dù nhỏ cũng có thể giúp được ai đó.' },
  { title: 'Hạt mầm kiên nhẫn', text: 'Một hạt mầm nằm dưới đất nhiều ngày mà chưa thấy nắng. Nó vẫn bám rễ và vươn lên từng chút. Khi mưa đầu mùa đến, hạt mầm trở thành một chồi non. Những điều tốt đẹp đôi khi cần thời gian để lớn lên.' },
  { title: 'Chú chim sẻ và cơn mưa', text: 'Chú chim sẻ trú dưới mái hiên cùng một chú bướm ướt cánh. Chim sẻ nhường chỗ khô nhất cho bạn. Khi trời quang, bướm dẫn sẻ đến vườn hoa nhiều hạt. Hai người bạn cùng chia sẻ niềm vui của mình.' },
];
let cachedNews = null;
let cachedNewsAt = 0;
const tongueTwisters = [
  'Nồi đồng nấu ốc, nồi đất nấu ếch.',
  'Lúa nếp là lúa nếp làng, lúa lên lớp lớp lòng nàng lâng lâng.',
  'Con cá rô rúc trong rổ, con cá quả quẫy qua quẫy lại.',
  'Trời mưa lâm râm, đường trơn trượt, trâu trở về chuồng.',
  'Bà Ba bán bánh bèo bên bờ biển Bình Định.',
];
const deviceId = req => String(req.query.deviceId || req.body?.deviceId || process.env.DEFAULT_DEVICE_ID || 'xiaozhi').slice(0, 128);
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
async function getNews() {
  if (cachedNews && Date.now() - cachedNewsAt < 120000) return cachedNews;
  cachedNews = await latest();
  cachedNewsAt = Date.now();
  return cachedNews;
}

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function reminderRow(row) {
  return { id: row.id, title: row.title, dueAt: new Date(row.due_at).toISOString(), createdAt: new Date(row.created_at).toISOString() };
}
function validateQuery(value, res) {
  const q = String(value || '').trim();
  if (!q || q.length > 120) { res.status(400).json({ error: 'q phải có từ 1 đến 120 ký tự' }); return null; }
  return q;
}
router.get('/status', asyncRoute(async (_req, res) => res.json({ ...await getServerStatus(), active_streams: audioService.activeStreams() })));

router.get('/briefing', asyncRoute(async (req, res) => {
  const city = String(req.query.city || req.query.location || process.env.DEFAULT_CITY || '').trim();
  if (!city || city.length > 120) return res.status(400).json({ error: 'city phải có từ 1 đến 120 ký tự' });
  const [weatherResult, newsResult, reminderResult] = await Promise.allSettled([
    getWeather(city, 1), getNews(), query("SELECT id,title,due_at,created_at FROM reminders WHERE device_id=? AND (due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date ORDER BY due_at LIMIT 20", [deviceId(req)]),
  ]);
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const news = newsResult.status === 'fulfilled' ? newsResult.value.slice(0, 3) : [];
  if (!weather && !news.length) throw new Error('Không lấy được thời tiết hoặc tin tức cho báo cáo');
  res.json({ date: localDate(), location: weather?.place?.name || city, weather, weather_speech: weather ? toSpeech(weather) : null, weather_error: weatherResult.status === 'rejected' ? weatherResult.reason.message : null, news: { items: news, count: news.length }, news_error: newsResult.status === 'rejected' ? newsResult.reason.message : null, reminders: { available: reminderResult.status === 'fulfilled', items: reminderResult.status === 'fulfilled' ? reminderResult.value.map(reminderRow) : [] }, instruction: 'Tóm tắt ngắn gọn bằng tiếng Việt, chỉ dùng dữ liệu có trong kết quả.' });
}));

router.get('/news', asyncRoute(async (req, res) => {
  const items = (await getNews()).slice(0, Math.max(1, Math.min(10, Number.parseInt(req.query.limit, 10) || 5)));
  res.json({ items: items.map(item => ({ ...item, id: crypto.createHash('sha1').update(String(item.link || item.title)).digest('hex').slice(0, 12) })), source: 'RSS' });
}));
router.get('/news/detail', asyncRoute(async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'missing_id' });
  const item = (await getNews()).find(entry => crypto.createHash('sha1').update(String(entry.link || entry.title)).digest('hex').slice(0, 12) === id);
  if (!item) return res.status(404).json({ error: 'news_not_found' });
  res.json({ ...item, id: crypto.createHash('sha1').update(String(item.link || item.title)).digest('hex').slice(0, 12) });
}));

router.get('/reminders', asyncRoute(async (req, res) => {
  const upcoming = req.query.scope === 'upcoming';
  const sql = upcoming
    ? 'SELECT id,title,due_at,created_at FROM reminders WHERE device_id=? AND due_at >= NOW() ORDER BY due_at LIMIT 100'
    : "SELECT id,title,due_at,created_at FROM reminders WHERE device_id=? AND (due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date ORDER BY due_at LIMIT 100";
  const rows = await query(sql, [deviceId(req)]);
  res.json({ available: true, date: localDate(), scope: upcoming ? 'upcoming' : 'today', count: rows.length, items: rows.map(reminderRow) });
}));
router.post('/reminders', asyncRoute(async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const timestamp = Date.parse(String(req.body?.due_at || ''));
  if (!title || title.length > 120 || !Number.isFinite(timestamp)) return res.status(400).json({ error: 'Cần title tối đa 120 ký tự và due_at là thời gian ISO hợp lệ' });
  if (timestamp < Date.now() - 60000) return res.status(400).json({ error: 'Thời gian nhắc việc phải ở hiện tại hoặc tương lai' });
  const owner = deviceId(req);
  const count = await query('SELECT COUNT(*) AS total FROM reminders WHERE device_id=?', [owner]);
  if (Number(count[0]?.total || 0) >= 100) return res.status(507).json({ error: 'Đã đạt giới hạn 100 lời nhắc cho thiết bị' });
  const id = require('node:crypto').randomUUID();
  const dueAt = new Date(timestamp);
  await query('INSERT INTO reminders(id,device_id,title,due_at) VALUES(?,?,?,?)', [id, owner, title, dueAt.toISOString()]);
  res.status(201).json({ ok: true, reminder: { id, title, dueAt: dueAt.toISOString(), createdAt: new Date().toISOString() } });
}));
router.delete('/reminders/:id', asyncRoute(async (req, res) => {
  const rows = await query('SELECT id,title,due_at,created_at FROM reminders WHERE id=? AND device_id=? LIMIT 1', [req.params.id, deviceId(req)]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy lời nhắc' });
  await query('DELETE FROM reminders WHERE id=? AND device_id=?', [req.params.id, deviceId(req)]);
  res.json({ ok: true, removed: reminderRow(rows[0]) });
}));

router.get('/gold/sjc', asyncRoute(async (_req, res) => {
  const response = await fetch(process.env.GOLD_API_URL || 'https://taichinh.com/api/v1/gold', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Gold source returned HTTP ${response.status}`);
  res.json({ ...await response.json(), requested_product: 'SJC', attribution: 'taichinh.com; nguồn giá được ghi trong từng mục dữ liệu' });
}));
router.get('/lottery', asyncRoute(async (req, res) => {
  const endpoint = process.env.XOSO_API_URL;
  if (!endpoint || !process.env.XOSO_API_KEY) return res.status(503).json({ error: 'XOSO_API_URL và XOSO_API_KEY chưa được cấu hình' });
  const url = new URL(endpoint);
  const region = String(req.query.region || 'mien-bac').toLowerCase();
  const regions = { 'mien-bac': 'MB', 'mien-trung': 'MT', 'mien-nam': 'MN', mb: 'MB', mt: 'MT', mn: 'MN' };
  url.searchParams.set('region', regions[region] || region);
  const response = await fetch(url, { headers: { [process.env.XOSO_API_KEY_HEADER || 'x-api-key']: process.env.XOSO_API_KEY }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Lottery source returned HTTP ${response.status}`);
  res.json(await response.json());
}));
router.get('/story', (req, res) => {
  const topic = String(req.query.topic || '').trim().toLowerCase();
  const story = stories.find(s => topic && s.title.toLowerCase().includes(topic)) || stories[Math.floor(Math.random() * stories.length)];
  res.json({ ...story, language: 'vi', instruction: 'Đọc truyện chậm, ấm áp cho người nghe.' });
});
router.get('/wordplay', (_req, res) => res.json({ text: tongueTwisters[Math.floor(Math.random() * tongueTwisters.length)], language: 'vi' }));


module.exports = router;
