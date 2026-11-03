const { query } = require('../db');

async function suggestions(deviceId) {
  const rows = await query(
    `SELECT query_text, COUNT(*) AS total FROM search_history WHERE device_id=? GROUP BY query_text ORDER BY total DESC LIMIT 5`,
    [deviceId],
  );
  return {
    suggestions: [
      'Tìm một bài hát trên YouTube',
      'Phát bài tôi vừa tìm',
      'Xem thời tiết hôm nay',
      'Đọc tin tức mới nhất',
      'Tạo lời nhắc',
    ],
    personalized: rows.map(row => row.query_text),
  };
}

const featureCatalog = [
  { category: 'entertainment', title: 'Tìm và phát nhạc', description: 'Tìm nhạc trên YouTube hoặc SoundCloud rồi phát trực tuyến.', prompt: 'Tìm nhạc theo tên bài hát hoặc nghệ sĩ.' },
  { category: 'entertainment', title: 'Kể chuyện theo chủ đề', description: 'Chọn truyện ngắn tiếng Việt theo chủ đề.', prompt: 'Kể cho tôi một câu chuyện về tình bạn.' },
  { category: 'education', title: 'Luyện phát âm', description: 'Đọc câu luyện phát âm và luyện nói cùng Xiaozhi.', prompt: 'Cho tôi một câu luyện phát âm tiếng Việt.' },
  { category: 'education', title: 'Đọc tin tức', description: 'Đọc tin mới và mở nội dung chi tiết.', prompt: 'Tóm tắt các tin mới nhất hôm nay.' },
  { category: 'utility', title: 'Báo cáo buổi sáng', description: 'Gộp thời tiết, tin mới và lời nhắc trong ngày.', prompt: 'Cho tôi báo cáo buổi sáng.' },
  { category: 'utility', title: 'Nhắc việc', description: 'Tạo, xem và xóa lời nhắc theo lịch.', prompt: 'Nhắc tôi học bài lúc 19 giờ tối nay.' },
];

function features() {
  return {
    categories: [
      { id: 'entertainment', name: 'Giải trí' },
      { id: 'education', name: 'Học tập' },
      { id: 'utility', name: 'Tiện ích' },
    ],
    items: featureCatalog,
  };
}

function dailySuggestions(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hourCycle: 'h23',
  }).format(date));
  const period = hour >= 5 && hour < 11 ? 'morning'
    : hour >= 11 && hour < 17 ? 'afternoon'
      : hour >= 17 && hour < 22 ? 'evening' : 'night';
  const byPeriod = {
    morning: ['Xem thời tiết hôm nay', 'Nghe báo cáo buổi sáng', 'Xem lời nhắc hôm nay'],
    afternoon: ['Nghe tin tức mới', 'Tìm nhanh một thông tin', 'Đặt lời nhắc cho buổi tối'],
    evening: ['Nghe nhạc thư giãn', 'Nghe một câu chuyện ngắn', 'Xem dự báo thời tiết ngày mai'],
    night: ['Nghe nhạc nhẹ', 'Nghe truyện trước khi ngủ', 'Tạo lời nhắc cho ngày mai'],
  };
  return { period, hour, timezone: 'Asia/Ho_Chi_Minh', suggestions: byPeriod[period] };
}

module.exports = { suggestions, features, dailySuggestions };
