const startedAt = new Date();
const recent = [];
const counts = new Map();
const maxEndpointCounters = 100;
const hourBuckets = new Map();
const chartWindowHours = 24 * 7;
const bucketDurationMs = 60 * 60_000;
let totalRequests = 0;
let errorRequests = 0;
function recordRequest({ method, path, status, durationMs }) {
  totalRequests += 1;
  if (status >= 400) errorRequests += 1;
  const now = Date.now();
  const hour = Math.floor(now / bucketDurationMs) * bucketDurationMs;
  const bucket = hourBuckets.get(hour) || { total: 0, errors: 0 };
  bucket.total += 1;
  if (status >= 400) bucket.errors += 1;
  hourBuckets.set(hour, bucket);
  for (const timestamp of hourBuckets.keys()) {
    if (timestamp < hour - (chartWindowHours - 1) * bucketDurationMs) hourBuckets.delete(timestamp);
  }
  const key = `${method} ${path}`;
  const count = counts.get(key) || { endpoint: key, total: 0, errors: 0 };
  count.total += 1;
  if (status >= 400) count.errors += 1;
  if (!counts.has(key) && counts.size >= maxEndpointCounters) counts.delete(counts.keys().next().value);
  counts.set(key, count);
  recent.unshift({ method, path, status, duration_ms: durationMs, time: new Date().toISOString() });
  if (recent.length > 50) recent.length = 50;
}
function snapshot() {
  const endpoints = [...counts.values()].sort((a, b) => b.total - a.total);
  const currentHour = Math.floor(Date.now() / bucketDurationMs) * bucketDurationMs;
  const timeline = Array.from({ length: chartWindowHours }, (_, index) => {
    const hour = currentHour - (chartWindowHours - index - 1) * bucketDurationMs;
    const bucket = hourBuckets.get(hour) || { total: 0, errors: 0 };
    return { time: new Date(hour).toISOString(), total: bucket.total, errors: bucket.errors };
  });
  return {
    started_at: startedAt.toISOString(),
    total_requests: totalRequests,
    error_requests: errorRequests,
    endpoints,
    recent: [...recent],
    timeline,
    note: 'Thống kê trong bộ nhớ của tiến trình hiện tại; sẽ đặt lại khi server khởi động lại.',
  };
}
module.exports = { recordRequest, snapshot };
