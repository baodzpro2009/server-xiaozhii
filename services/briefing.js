const { getWeather, toSpeech } = require('./weather');
const { news } = require('./content');
const reminders = require('./reminders');
async function getBriefing(city, deviceId) {
  const [weatherResult, newsResult, remindersResult] = await Promise.allSettled([
    getWeather(city, 1), news(), reminders.listReminders(deviceId, 'today'),
  ]);
  const weatherData = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const items = newsResult.status === 'fulfilled' ? newsResult.value.slice(0, 3) : [];
  if (!weatherData && !items.length) throw new Error('Không lấy được thời tiết hoặc tin tức cho báo cáo');
  return {
    date: reminders.localDate(), location: weatherData?.place?.name || city,
    weather: weatherData, weather_speech: weatherData ? toSpeech(weatherData) : null,
    weather_error: weatherResult.status === 'rejected' ? weatherResult.reason.message : null,
    news: { items, count: items.length }, news_error: newsResult.status === 'rejected' ? newsResult.reason.message : null,
    reminders: { available: remindersResult.status === 'fulfilled', items: remindersResult.status === 'fulfilled' ? remindersResult.value.items : [] },
    instruction: 'Tóm tắt ngắn gọn bằng tiếng Việt, chỉ dùng dữ liệu có trong kết quả.',
  };
}
module.exports = { getBriefing };
