const axios = require('axios');
const { query } = require('../db');

const WMO = {
  0:'trời quang',1:'trời khá quang',2:'mây rải rác',3:'nhiều mây',
  45:'sương mù',48:'sương mù đóng băng',51:'mưa phùn nhẹ',53:'mưa phùn',55:'mưa phùn dày',
  56:'mưa phùn lạnh nhẹ',57:'mưa phùn lạnh',61:'mưa nhẹ',63:'mưa vừa',65:'mưa to',
  66:'mưa lạnh nhẹ',67:'mưa lạnh',71:'tuyết nhẹ',73:'tuyết vừa',75:'tuyết dày',
  80:'mưa rào nhẹ',81:'mưa rào',82:'mưa rào mạnh',95:'dông',96:'dông có mưa đá nhẹ',99:'dông có mưa đá'
};

async function geocode(city) {
  const url='https://geocoding-api.open-meteo.com/v1/search';
  const {data}=await axios.get(url,{params:{name:city,count:1,language:'vi',format:'json'},timeout:10000});
  if(!data.results?.length) throw new Error(`Không tìm thấy địa điểm: ${city}`);
  const r=data.results[0];
  return {name:r.name,country:r.country,admin1:r.admin1,latitude:r.latitude,longitude:r.longitude};
}

async function getWeather(city, days=7) {
  const place=await geocode(city);
  const {data}=await axios.get('https://api.open-meteo.com/v1/forecast',{params:{
    latitude:place.latitude,longitude:place.longitude,timezone:'auto',forecast_days:Math.min(Math.max(days,1),16),
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset'
  },timeout:10000});
  const current=data.current;
  const result={place,current:{temperature:current.temperature_2m,apparentTemperature:current.apparent_temperature,humidity:current.relative_humidity_2m,precipitation:current.precipitation,windSpeed:current.wind_speed_10m,description:WMO[current.weather_code]||'thời tiết thay đổi',weatherCode:current.weather_code},daily:data.daily};
  await query(`INSERT INTO weather_cache(city,latitude,longitude,data_json) VALUES(?,?,?,?) ON CONFLICT (city) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,data_json=EXCLUDED.data_json,updated_at=NOW()`,[city,place.latitude,place.longitude,JSON.stringify(result)]);
  return result;
}

function toSpeech(w) {
  const c=w.current;
  return `Thời tiết tại ${w.place.name}: hiện tại ${c.temperature} độ C, cảm giác như ${c.apparentTemperature} độ, ${c.description}, độ ẩm ${c.humidity} phần trăm, gió ${c.windSpeed} km một giờ.`;
}
module.exports={getWeather,toSpeech};
