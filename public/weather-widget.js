(() => {
  const form = document.getElementById('weather-widget-form');
  const card = document.getElementById('weather-widget-data');
  if (!form || !card) return;

  const byId = (id) => document.getElementById(id);
  const iconFor = (code) => {
    if (code === 0) return '☀️';
    if ([1, 2].includes(code)) return '🌤️';
    if (code === 3) return '☁️';
    if ([45, 48].includes(code)) return '🌫️';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
    if ([71, 73, 75].includes(code)) return '❄️';
    if ([95, 96, 99].includes(code)) return '⛈️';
    return '🌦️';
  };
  const descriptionFor = (code, fallback) => ({
    0: 'Trời quang', 1: 'Trời khá quang', 2: 'Mây rải rác', 3: 'Nhiều mây',
    45: 'Sương mù', 48: 'Sương mù đóng băng', 51: 'Mưa phùn nhẹ', 53: 'Mưa phùn', 55: 'Mưa phùn dày',
    56: 'Mưa phùn lạnh nhẹ', 57: 'Mưa phùn lạnh', 61: 'Mưa nhẹ', 63: 'Mưa vừa', 65: 'Mưa to',
    66: 'Mưa lạnh nhẹ', 67: 'Mưa lạnh', 71: 'Tuyết nhẹ', 73: 'Tuyết vừa', 75: 'Tuyết dày',
    80: 'Mưa rào nhẹ', 81: 'Mưa rào', 82: 'Mưa rào mạnh', 95: 'Dông', 96: 'Dông kèm mưa đá nhẹ', 99: 'Dông kèm mưa đá'
  })[code] || fallback || 'Thời tiết thay đổi';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const city = byId('weather-city').value.trim();
    if (!city) return;
    const button = form.querySelector('button[type="submit"]');
    const message = byId('weather-widget-message');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Đang tải…';
    message.textContent = `Đang lấy dự báo cho ${city}…`;
    try {
      const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}&days=5`, { headers: { accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Máy chủ trả về lỗi ${response.status}`);
      const current = data.current;
      if (!current || !data.place) throw new Error('Dữ liệu thời tiết trả về không đầy đủ.');

      byId('weather-icon').textContent = iconFor(Number(current.weatherCode));
      byId('weather-temperature').textContent = `${Math.round(Number(current.temperature))}°C`;
      byId('weather-description').textContent = descriptionFor(Number(current.weatherCode), current.description);
      byId('weather-place').textContent = [data.place.name, data.place.admin1, data.place.country].filter(Boolean).join(', ');
      byId('weather-humidity').textContent = `${current.humidity}%`;
      byId('weather-wind').textContent = `${Math.round(Number(current.windSpeed))} km/h`;
      byId('weather-feels').textContent = `${Math.round(Number(current.apparentTemperature))}°C`;

      const daily = data.daily || {};
      const forecast = (daily.time || []).slice(1, 5).map((date, index) => {
        const dayIndex = index + 1;
        const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
        return `<div class="weather-forecast-day"><span>${weekday}</span><span>${iconFor(Number(daily.weather_code?.[dayIndex]))}</span><b>${Math.round(Number(daily.temperature_2m_max?.[dayIndex]))}° / ${Math.round(Number(daily.temperature_2m_min?.[dayIndex]))}°</b></div>`;
      }).join('');
      byId('weather-forecast').innerHTML = forecast;
      card.hidden = false;
      message.textContent = `Đã cập nhật thời tiết cho ${data.place.name}. Di chuột hoặc chạm vào thẻ để xem dự báo các ngày tới.`;
    } catch (error) {
      message.textContent = `Không tải được thời tiết: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
})();
