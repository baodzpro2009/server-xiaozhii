'use strict';

const os = require('node:os');
const { getSystemStats } = require('./system-stats');
const { executableAvailable, isYtDlpAvailable } = require('./binary-status');

function formatMiB(bytes) {
  return Number.isFinite(bytes) ? `${Math.round(bytes / 1048576)} MiB` : 'không rõ';
}

async function getServerStatus() {
  const stats = await getSystemStats();
  const ffmpegAvailable = executableAvailable(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']);
  const youtubeDlAvailable = isYtDlpAvailable();
  const pressure = [];
  if (stats.cpu.usage_percent >= 90) pressure.push('CPU cao');
  if (stats.memory.used_percent >= 90) pressure.push('bộ nhớ gần đầy');
  if (stats.disk.used_percent >= 90) pressure.push('ổ đĩa gần đầy');
  const status = pressure.length ? 'warning' : 'online';
  const cpu = stats.cpu.usage_percent == null ? 'không rõ' : `${stats.cpu.usage_percent}%`;
  const memory = `${formatMiB(stats.memory.used_bytes)} / ${formatMiB(stats.memory.total_bytes)}`;
  const disk = stats.disk.available === false
    ? 'không đọc được'
    : `${formatMiB(stats.disk.used_bytes)} / ${formatMiB(stats.disk.total_bytes)} (filesystem; quota container không được cung cấp)`;
  const uptimeMinutes = Math.floor(stats.uptime_seconds / 60);
  const uptime = `${Math.floor(uptimeMinutes / 60)} giờ ${uptimeMinutes % 60} phút`;
  const message = `Máy chủ ${status === 'online' ? 'đang hoạt động' : `đang có tải cao: ${pressure.join(', ')}`}. CPU ${cpu}; bộ nhớ ${memory}; ổ đĩa ${disk}; uptime ${uptime}. FFmpeg ${ffmpegAvailable ? 'sẵn sàng' : 'không có'}; yt-dlp ${youtubeDlAvailable ? 'sẵn sàng' : 'không có'}.`;
  return {
    ok: true, status, service: 'xiaozhi-api', platform: os.platform(), ...stats,
    ffmpeg_available: ffmpegAvailable, youtube_dl_available: youtubeDlAvailable, message,
  };
}

module.exports = { getServerStatus };
