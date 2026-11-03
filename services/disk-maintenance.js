'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const appRoot = path.resolve(__dirname, '..');
const responseCachePath = path.join(appRoot, 'dasu.response');
const ytdlpDirectory = path.join(appRoot, 'yt-dlp');
const responseCacheMaxAgeMs = 30 * 60 * 1000;
const staleDownloadMaxAgeMs = 24 * 60 * 60 * 1000;
const staleYtDlpCacheMaxAgeMs = 60 * 60 * 1000;

function ytDlpCacheDirectories() {
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [process.env.APPDATA && path.join(process.env.APPDATA, 'yt-dlp', 'cache'), path.join(home, '.cache', 'yt-dlp')]
    : [process.env.XDG_CACHE_HOME && path.join(process.env.XDG_CACHE_HOME, 'yt-dlp'), path.join(home, '.cache', 'yt-dlp')];
  return [...new Set(candidates.filter(Boolean).map(value => path.resolve(value)))];
}

async function cleanupCacheTree(directory, now) {
  let removedFiles = 0;
  let freedBytes = 0;
  const errors = [];
  try {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory()) return { removedFiles, freedBytes, errors };
  } catch (error) {
    if (error.code === 'ENOENT') return { removedFiles, freedBytes, errors };
    return { removedFiles, freedBytes, errors: [{ file: directory, message: error.message }] };
  }
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return { removedFiles, freedBytes, errors };
    return { removedFiles, freedBytes, errors: [{ file: directory, message: error.message }] };
  }
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    try {
      if (entry.isDirectory()) {
        const nested = await cleanupCacheTree(filePath, now);
        removedFiles += nested.removedFiles;
        freedBytes += nested.freedBytes;
        errors.push(...nested.errors);
        const remaining = await fs.readdir(filePath);
        if (!remaining.length) await fs.rmdir(filePath);
      } else if (entry.isFile()) {
        const bytes = await removeIfExpired(filePath, now, staleYtDlpCacheMaxAgeMs);
        if (bytes) { removedFiles += 1; freedBytes += bytes; }
      }
      // Never follow symlinks or remove non-file entries from the cache.
    } catch (error) {
      if (error.code !== 'ENOENT') errors.push({ file: filePath, message: error.message });
    }
  }
  return { removedFiles, freedBytes, errors };
}

async function removeIfExpired(filePath, now, maxAgeMs) {
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || now - stat.mtimeMs < maxAgeMs) return 0;
    await fs.unlink(filePath);
    return stat.size;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return 0;
  }
}

async function cleanupDisk() {
  const now = Date.now();
  let removedFiles = 0;
  let freedBytes = 0;
  const errors = [];
  let ytDlpCacheFilesRemoved = 0;
  let ytDlpCacheBytesFreed = 0;

  try {
    const bytes = await removeIfExpired(responseCachePath, now, responseCacheMaxAgeMs);
    if (bytes) { removedFiles += 1; freedBytes += bytes; }
  } catch (error) {
    errors.push({ file: path.basename(responseCachePath), message: error.message });
  }

  try {
    const entries = await fs.readdir(ytdlpDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const isStagedDownload = /^yt-dlp-\d+-\d+(?:\.exe)?(?:\.download)?$/.test(entry.name);
      const isOldBackup = /^yt-dlp(?:\.exe)?\.backup$/.test(entry.name);
      if (!isStagedDownload && !isOldBackup) continue;
      if (isOldBackup) {
        const executableName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
        try { await fs.access(path.join(ytdlpDirectory, executableName)); }
        catch { continue; } // Keep a backup if it is the only working binary.
      }
      const filePath = path.join(ytdlpDirectory, entry.name);
      try {
        const bytes = await removeIfExpired(filePath, now, staleDownloadMaxAgeMs);
        if (bytes) { removedFiles += 1; freedBytes += bytes; }
      } catch (error) {
        errors.push({ file: `yt-dlp/${entry.name}`, message: error.message });
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') errors.push({ file: 'yt-dlp', message: error.message });
  }

  for (const cacheDirectory of ytDlpCacheDirectories()) {
    const result = await cleanupCacheTree(cacheDirectory, now);
    removedFiles += result.removedFiles;
    freedBytes += result.freedBytes;
    ytDlpCacheFilesRemoved += result.removedFiles;
    ytDlpCacheBytesFreed += result.freedBytes;
    errors.push(...result.errors);
  }

  return {
    removed_files: removedFiles,
    freed_bytes: freedBytes,
    yt_dlp_cache_files_removed: ytDlpCacheFilesRemoved,
    yt_dlp_cache_bytes_freed: ytDlpCacheBytesFreed,
    errors,
  };
}

async function diskUsage(target = appRoot) {
  try {
    const stat = await fs.statfs(target);
    const total = Number(stat.blocks) * Number(stat.bsize);
    const free = Number(stat.bavail) * Number(stat.bsize);
    const used = Math.max(0, total - free);
    return { scope: 'filesystem', quota_known: false, total_bytes: total, used_bytes: used, free_bytes: free, used_percent: total ? Math.round(used / total * 1000) / 10 : null };
  } catch {
    return null;
  }
}

module.exports = { cleanupDisk, diskUsage };
