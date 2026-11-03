const express = require('express');
const router = express.Router();

// Only list callable routes. Device specific history/favorites require an
// actual device ID, so they are intentionally left out of the generic tester.
const endpoints = [
  { category: 'Hệ thống', method: 'GET', path: '/api/health', description: 'Kiểm tra API và kết nối cơ sở dữ liệu.' },
  { category: 'Hệ thống', method: 'GET', path: '/api/status', description: 'Xem uptime, bộ nhớ, FFmpeg và yt-dlp.' },
  { category: 'Hệ thống', method: 'GET', path: '/saver', description: 'Kiểm tra CPU, bộ nhớ, ổ đĩa, uptime và trạng thái dịch vụ.' },
  { category: 'YouTube', method: 'GET', path: '/api/youtube/search', description: 'Tìm video YouTube theo từ khóa.', params: { q: 'nhạc Việt', limit: 5 } },
  { category: 'Thời tiết', method: 'GET', path: '/api/weather', description: 'Lấy thời tiết hiện tại và dự báo.', params: { city: 'Hà Nội', days: 3 } },
  { category: 'Tin tức', method: 'GET', path: '/api/news/latest', description: 'Lấy tin mới nhất.', params: { limit: 5 } },
  { category: 'Tin tức', method: 'GET', path: '/api/news/search', description: 'Tìm tin theo từ khóa.', params: { q: 'trí tuệ nhân tạo' } },
  { category: 'Tin tức', method: 'GET', path: '/api/news/detail', description: 'Lấy nội dung tin bằng ID từ kết quả tìm kiếm.', params: { id: '' } },
  { category: 'Gợi ý', method: 'GET', path: '/api/suggest', description: 'Lấy gợi ý chung và lịch sử tìm kiếm của thiết bị.', params: { deviceId: 'xiaozhi' } },
  { category: 'Gợi ý', method: 'GET', path: '/api/suggestions/daily', description: 'Lấy gợi ý theo thời điểm hiện tại tại Việt Nam.' },
  { category: 'Gợi ý', method: 'GET', path: '/api/suggestions/features', description: 'Liệt kê các tính năng có trong hệ thống.' },
  { category: 'Tiện ích', method: 'GET', path: '/api/briefing', description: 'Tổng hợp thời tiết, tin mới và lời nhắc.', params: { city: 'Hà Nội' } },
  { category: 'Lời nhắc', method: 'GET', path: '/api/reminders', description: 'Xem lời nhắc hôm nay hoặc sắp tới.', params: { deviceId: 'xiaozhi', scope: 'today' } },
  { category: 'Lời nhắc', method: 'POST', path: '/api/reminders', description: 'Tạo lời nhắc cho thiết bị. Điền tiêu đề và thời gian trước khi gửi.', body: { deviceId: 'xiaozhi', title: '', due_at: '' } },
  { category: 'Thị trường', method: 'GET', path: '/api/gold/sjc', description: 'Lấy giá vàng SJC mới nhất.' },
  { category: 'Thị trường', method: 'GET', path: '/api/lottery', description: 'Lấy kết quả xổ số theo miền.', params: { region: 'mien-bac' } },
  { category: 'Tài chính', method: 'GET', path: '/api/finance/overview', description: 'Tổng hợp dữ liệu thị trường tài chính.' },
  { category: 'Tài chính', method: 'GET', path: '/api/finance/exchange-rates', description: 'Lấy tỷ giá ngoại tệ tham chiếu.', params: { base: 'USD', quotes: 'VND,EUR' } },
  { category: 'Tài chính', method: 'GET', path: '/api/finance/stock-market', description: 'Lấy snapshot chỉ số chứng khoán.', params: { symbols: '^VNINDEX,^GSPC' } },
  { category: 'Tài chính', method: 'GET', path: '/api/finance/news', description: 'Lấy tin tài chính mới.', params: { limit: 8 } },
  { category: 'Tài chính', method: 'GET', path: '/api/finance/crypto-market', description: 'Lấy giá thị trường tiền mã hóa.', params: { symbols: 'BTCUSDT,ETHUSDT' } },
  { category: 'Âm thanh', method: 'GET', path: '/api/music/soundcloud/search', description: 'Tìm bài hát trên SoundCloud.', params: { q: 'nhạc Việt', limit: 5 } },
  { category: 'YouTube', method: 'GET', path: '/api/music/youtube/search', description: 'Search YouTube music with yt-dlp.', params: { q: 'song name', limit: 5 } },
  { category: 'YouTube', method: 'GET', path: '/api/music/youtube/play', description: 'Phát nhạc YouTube, có dự phòng SoundCloud.', params: { q: 'tên bài hát' }, responseType: 'audio' },
  { category: 'Âm thanh', method: 'GET', path: '/api/music/soundcloud/play', description: 'Phát bài hát trên SoundCloud.', params: { q: 'tên bài hát' }, responseType: 'audio' },
  { category: 'Âm thanh', method: 'GET', path: '/api/music/channel3/play', description: 'Phát radio VOV3.', params: { q: 'VOV3' }, responseType: 'audio' },
  { category: 'Âm thanh', method: 'GET', path: '/api/radio/play', description: 'Tìm và phát luồng radio.', params: { q: 'VOV giao thông' }, responseType: 'audio' },
  { category: 'Nội dung', method: 'GET', path: '/api/story', description: 'Lấy truyện ngắn tiếng Việt theo chủ đề.', params: { topic: 'tình bạn' } },
  { category: 'Nội dung', method: 'GET', path: '/api/wordplay', description: 'Lấy câu luyện phát âm tiếng Việt.' },
  { category: 'MCP', method: 'GET', path: '/api/mcp/tools', description: 'Liệt kê MCP tools đang được máy chủ cung cấp.' },
  { category: 'MCP', method: 'POST', path: '/mcp', description: 'Gửi JSON-RPC request đến MCP server.', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } },
  { category: 'Quản trị', method: 'GET', path: '/api/admin/metrics', description: 'Xem số request và biểu đồ lưu lượng thật.' },
  { category: 'Quản trị', method: 'GET', path: '/api/admin/config', description: 'Xem trạng thái cấu hình tích hợp.' },
];

router.get('/', (_req, res) => res.json({ title: 'Xiaozhi API', endpoints }));
router.endpoints = endpoints;
module.exports = router;
