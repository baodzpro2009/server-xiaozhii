const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const CACHE_MS = 60_000;
const availabilityCache = new Map();

function ytDlpCandidates() {
  const candidates = [
    process.env.YT_DLP_BIN,
    path.join(__dirname, '..', 'yt-dlp', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
    'yt-dlp',
  ].filter(Boolean);

  return [...new Set(candidates)];
}

function executableAvailable(command, args = ['--version']) {
  if (!command) return false;
  const cacheKey = `${command}\n${args.join(' ')}`;
  const cached = availabilityCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < CACHE_MS) return cached.available;
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    timeout: 2500,
    windowsHide: true,
  });
  const available = !result.error && result.status === 0;
  availabilityCache.set(cacheKey, { available, checkedAt: Date.now() });
  return available;
}

function isYtDlpAvailable() {
  return ytDlpCandidates().some(command => {
    // yt-dlp is validated with --version by install-ytdlp.js at startup.
    // Avoid spawning it synchronously for every status request: on a busy
    // container that probe can time out even while the binary is usable.
    if (path.isAbsolute(command) || command.includes('/') || command.includes('\\')) {
      try {
        const stat = fs.statSync(command);
        return stat.isFile() && (process.platform === 'win32' || (stat.mode & 0o111) !== 0);
      } catch {
        return false;
      }
    }
    return executableAvailable(command, ['--version']);
  });
}

module.exports = { executableAvailable, isYtDlpAvailable, ytDlpCandidates };
