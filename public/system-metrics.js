(() => {
  const formatBytes = value => {
    if (!Number.isFinite(Number(value))) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let amount = Number(value), unit = 0;
    while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
    return `${amount.toFixed(unit ? 1 : 0)} ${units[unit]}`;
  };
  const formatUptime = seconds => {
    const value = Math.max(0, Number(seconds) || 0);
    const days = Math.floor(value / 86400), hours = Math.floor(value % 86400 / 3600), minutes = Math.floor(value % 3600 / 60);
    return days ? `${days} ngày ${hours} giờ` : `${hours} giờ ${minutes} phút`;
  };
  async function refresh() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const cpu = data.cpu?.usage_percent;
      const memory = data.memory || {};
      const disk = data.disk || {};
      const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
      set('metric-uptime', formatUptime(data.uptime_seconds));
      set('metric-cpu', Number.isFinite(cpu) ? `${cpu}% · ${data.cpu.cores} cores` : 'N/A');
      set('metric-memory', `${formatBytes(memory.used_bytes)} / ${formatBytes(memory.total_bytes)} (${memory.used_percent ?? 'N/A'}%)`);
      set('metric-disk', disk.available === false ? 'N/A' : `${formatBytes(disk.used_bytes)} / ${formatBytes(disk.total_bytes)} (${disk.used_percent ?? 'N/A'}%)` + (disk.quota_known === false ? ' · quota container chưa rõ' : ''));
    } catch (error) {
      for (const id of ['metric-cpu', 'metric-memory', 'metric-disk']) {
        const node = document.getElementById(id);
        if (node) node.textContent = 'Không lấy được';
      }
      console.error('[system metrics] status request failed:', error.message);
    }
  }
  refresh();
  window.setInterval(refresh, 30000);
})();
