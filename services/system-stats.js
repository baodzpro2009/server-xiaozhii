'use strict';

const os = require('node:os');
const fs = require('node:fs/promises');

function cpuSnapshot() {
  return os.cpus().map(cpu => {
    const times = cpu.times;
    return { idle: times.idle, total: times.user + times.nice + times.sys + times.idle + times.irq };
  });
}

async function cpuUsage() {
  const before = cpuSnapshot();
  await new Promise(resolve => setTimeout(resolve, 100));
  const after = cpuSnapshot();
  const total = after.reduce((sum, cpu, index) => sum + Math.max(0, cpu.total - before[index].total), 0);
  const idle = after.reduce((sum, cpu, index) => sum + Math.max(0, cpu.idle - before[index].idle), 0);
  return total ? Math.round(Math.max(0, Math.min(100, (1 - idle / total) * 100)) * 10) / 10 : null;
}

async function diskUsage(target = process.cwd()) {
  try {
    const stats = await fs.statfs(target);
    const blockSize = Number(stats.bsize);
    const total = blockSize * Number(stats.blocks);
    const free = blockSize * Number(stats.bavail);
    const used = Math.max(0, total - free);
    return {
      path: target,
      scope: 'filesystem',
      quota_known: false,
      total_bytes: total,
      used_bytes: used,
      free_bytes: free,
      used_percent: total ? Math.round(used / total * 1000) / 10 : null,
    };
  } catch (error) {
    return { path: target, available: false, error: error.message };
  }
}

async function memoryUsage() {
  const hostTotal = os.totalmem();
  const hostFree = os.freemem();
  const candidates = [
    { limit: '/sys/fs/cgroup/memory.max', usage: '/sys/fs/cgroup/memory.current', scope: 'container' },
    { limit: '/sys/fs/cgroup/memory/memory.limit_in_bytes', usage: '/sys/fs/cgroup/memory/memory.usage_in_bytes', scope: 'container' },
  ];
  let total = hostTotal;
  let used = hostTotal - hostFree;
  let scope = 'host';
  for (const candidate of candidates) {
    try {
      const [limitText, usageText] = await Promise.all([
        fs.readFile(candidate.limit, 'utf8'),
        fs.readFile(candidate.usage, 'utf8'),
      ]);
      const limit = Number(limitText.trim());
      const usage = Number(usageText.trim());
      if (Number.isFinite(limit) && limit > 0 && limit < Number.MAX_SAFE_INTEGER &&
          Number.isFinite(usage) && usage >= 0) {
        total = limit;
        used = Math.min(usage, limit);
        scope = candidate.scope;
        break;
      }
    } catch {
      // This host does not expose this cgroup layout; try the next one.
    }
  }
  const processMemory = process.memoryUsage();
  return {
    total_bytes: total,
    free_bytes: Math.max(0, total - used),
    used_bytes: used,
    used_percent: total ? Math.round(used / total * 1000) / 10 : null,
    scope,
    process_rss_bytes: processMemory.rss,
    process_heap_used_bytes: processMemory.heapUsed,
    process_heap_total_bytes: processMemory.heapTotal,
  };
}

async function getSystemStats() {
  const [cpu_percent, disk, memory] = await Promise.all([cpuUsage(), diskUsage(), memoryUsage()]);
  return {
    cpu: { usage_percent: cpu_percent, cores: os.cpus().length, load_average: os.loadavg() },
    memory,
    disk,
    uptime_seconds: Math.floor(process.uptime()),
    host_uptime_seconds: Math.floor(os.uptime()),
  };
}

module.exports = { getSystemStats };
