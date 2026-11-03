const fs = require('node:fs');
const path = require('node:path');

function isReadableFile(file) {
  try {
    fs.accessSync(file, fs.constants.R_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function resolveYtDlpCookies() {
  const configured = String(process.env.YT_DLP_COOKIES || '').trim();
  if (configured && isReadableFile(configured)) {
    console.log('[yt-dlp] YouTube cookies: configured file readable');
    return configured;
  }

  const projectFile = path.join(__dirname, '..', 'yt-dlp', 'cookies.txt');
  if (isReadableFile(projectFile)) {
    console.warn(configured
      ? '[yt-dlp] configured cookie path unavailable; using project yt-dlp/cookies.txt'
      : '[yt-dlp] using project yt-dlp/cookies.txt');
    return projectFile;
  }

  console.warn(configured
    ? '[yt-dlp] configured cookie file is missing or unreadable; YouTube may require verification'
    : '[yt-dlp] no cookie file found; YouTube may require verification');
  return '';
}

const youtubeCookies = resolveYtDlpCookies();

function configuredYtDlpRuntime() {
  const runtime = String(process.env.YT_DLP_JS_RUNTIME || 'node').trim();
  return /^node$/i.test(runtime) ? `node:${process.execPath}` : runtime;
}

module.exports = { youtubeCookies, configuredYtDlpRuntime };
