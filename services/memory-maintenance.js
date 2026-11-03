'use strict';

const { cleanupMemory: cleanupNewsMemory } = require('./news');
const { cleanupMemory: cleanupFinanceMemory } = require('./finance');
const { cleanupDisk, diskUsage } = require('./disk-maintenance');

const HOUR_MS = 60 * 60 * 1000;

async function cleanServerMemory() {
  const diskBefore = await diskUsage();
  const before = process.memoryUsage();
  const newsCleanup = cleanupNewsMemory();
  const financeCleanup = cleanupFinanceMemory();
  const diskCleanup = await cleanupDisk();
  const gcAvailable = typeof global.gc === 'function';
  if (gcAvailable) global.gc();
  const after = process.memoryUsage();
  const diskAfter = await diskUsage();
  return {
    cleaned_at: new Date().toISOString(),
    expired_cache_entries_removed: newsCleanup.removed + financeCleanup.removed,
    cached_search_entries_remaining: newsCleanup.remaining_search_entries,
    cached_finance_entries_remaining: financeCleanup.remaining_entries,
    pending_finance_requests: financeCleanup.pending_requests,
    garbage_collection_requested: gcAvailable,
    heap_used_before_bytes: before.heapUsed,
    heap_used_after_bytes: after.heapUsed,
    heap_bytes_released: Math.max(0, before.heapUsed - after.heapUsed),
    rss_before_bytes: before.rss,
    rss_after_bytes: after.rss,
    disk_files_removed: diskCleanup.removed_files,
    disk_bytes_freed: diskCleanup.freed_bytes,
    disk_cleanup_message: diskCleanup.removed_files
      ? `Đã xóa ${diskCleanup.removed_files} file cache/tạm cũ, giải phóng ${diskCleanup.freed_bytes} byte.`
      : 'Không có cache/file tạm cũ của ứng dụng đủ điều kiện xóa; không xóa dữ liệu người dùng hoặc file hệ thống.',
    disk_before: diskBefore,
    disk_after: diskAfter,
    disk_cleanup_errors: diskCleanup.errors,
  };
}

function startHourlyMemoryMaintenance() {
  cleanServerMemory().catch(error => console.error('[resource cleanup] startup cleanup failed:', error.message));
  const timer = setInterval(() => {
    cleanServerMemory()
      .then(result => console.info('[resource cleanup] hourly cleanup complete:', JSON.stringify(result)))
      .catch(error => console.error('[resource cleanup] hourly cleanup failed:', error.message));
  }, HOUR_MS);
  timer.unref();
  return timer;
}

module.exports = { cleanServerMemory, startHourlyMemoryMaintenance };
