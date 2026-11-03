const ytSearch = require('yt-search');
const { spawn } = require('node:child_process');
const { configuredYtDlpRuntime, youtubeCookies } = require('./ytdlp-config');

const fs = require('node:fs');
const path = require('node:path');
const { query } = require('../db');

function ytDlpExecutable() {
  if (process.env.YT_DLP_BIN) return process.env.YT_DLP_BIN;
  const bundled = path.join(__dirname, '..', 'yt-dlp', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return fs.existsSync(bundled) ? bundled : 'yt-dlp';
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function parseYtDlpVideos(stdout, count) {
  const videos = [];
  for (const line of String(stdout || '').split(/\r?\n/).filter(Boolean)) {
    try {
      const result = JSON.parse(line);
      const entries = Array.isArray(result.entries) ? result.entries : [result];
      for (const video of entries) {
        const id = String(video?.id || video?.url || '').trim();
        if (!id || videos.some(item => item.videoId === id)) continue;
        videos.push({ videoId: id, title: video.title || video.fulltitle || id,
          channel: video.channel || video.uploader || video.channel_id || '',
          duration: video.duration_string || (Number.isFinite(video.duration) ? formatDuration(video.duration) : ''),
          views: Number(video.view_count) || 0, thumbnail: video.thumbnail || video.thumbnails?.at?.(-1)?.url || '',
          url: /^https?:\/\//i.test(id) ? id : `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` });
        if (videos.length >= count) return videos;
      }
    } catch {}
  }
  return videos;
}

function searchWithYtDlp(term, count) {
  return new Promise((resolve, reject) => {
    const args = ['--ignore-config', '--no-warnings', '--no-progress', '--flat-playlist', '--dump-json', '--skip-download', '--playlist-end', String(count)];
    const jsRuntime = configuredYtDlpRuntime();
    if (jsRuntime) args.push('--js-runtimes', jsRuntime);
    if (youtubeCookies) args.push('--cookies', youtubeCookies);
    args.push(`ytsearch${count}:${term}`);
    let child;
    try { child = spawn(ytDlpExecutable(), args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
    catch (error) { reject(new Error(`yt-dlp search failed: ${error.message}`)); return; }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, videos) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(videos);
    };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('yt-dlp YouTube search timed out')); }, 20000);
    timer.unref?.();
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 8 * 1024 * 1024) { child.kill('SIGKILL'); finish(new Error('yt-dlp search output exceeded 8 MiB')); }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.once('error', error => finish(new Error(`yt-dlp search failed: ${error.message}`)));
    child.once('close', code => {
      if (settled) return;
      const videos = parseYtDlpVideos(stdout, count);
      if (videos.length) return finish(null, videos);
      finish(new Error(stderr.trim() || `yt-dlp returned no YouTube results (exit ${code})`));
    });
  });
}

async function searchYouTube(q, limit=10) {
  const term = String(q || '').trim();
  if (!term || term.length > 120) throw new Error('q must contain 1 to 120 characters');
  const count = Math.min(Math.max(Number(limit) || 10, 1), 20);
  let ytDlpError;
  try {
    const videos = await searchWithYtDlp(term, count);
    if (videos.length) return videos;
    ytDlpError = new Error('yt-dlp returned no YouTube results');
  } catch (error) {
    ytDlpError = error;
  }

  console.warn('[YouTube search] yt-dlp returned no usable results; trying yt-search:', ytDlpError.message);
  try {
    let timer;
    const result = await Promise.race([
      ytSearch(term),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('yt-search timed out')), 10000); }),
    ]).finally(() => clearTimeout(timer));
    const videos = (result.videos || []).filter(video => video?.videoId).slice(0, count).map(video => ({
      videoId: video.videoId,
      title: video.title || video.videoId,
      channel: video.author?.name || '',
      duration: video.timestamp || '',
      views: video.views || 0,
      thumbnail: video.thumbnail || '',
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`,
    }));
    if (videos.length) return videos;
    throw new Error('yt-search returned no YouTube results');
  } catch (fallbackError) {
    throw new Error(`yt-dlp: ${ytDlpError.message}; yt-search: ${fallbackError.message}`);
  }
}

async function saveSearch(deviceId,q,results){
  await query('INSERT INTO search_history(device_id,type,query_text,result_json) VALUES(?,?,?,?)',[deviceId,'youtube',q,JSON.stringify(results)]);
}

async function savePlay(deviceId,v){
  await query('INSERT INTO youtube_history(device_id,video_id,title,channel,url) VALUES(?,?,?,?,?)',[deviceId,v.videoId,v.title,v.channel||'',v.url||`https://www.youtube.com/watch?v=${v.videoId}`]);
}

async function history(deviceId,limit=20){return query('SELECT * FROM youtube_history WHERE device_id=? ORDER BY played_at DESC LIMIT ?',[deviceId,Math.min(Number(limit)||20,100)]);}
async function favorites(deviceId){return query('SELECT * FROM favorites WHERE device_id=? ORDER BY created_at DESC',[deviceId]);}
async function addFavorite(deviceId,v){await query(`INSERT INTO favorites(device_id,video_id,title,channel,url) VALUES(?,?,?,?,?) ON CONFLICT (device_id,video_id) DO UPDATE SET title=EXCLUDED.title,channel=EXCLUDED.channel,url=EXCLUDED.url`,[deviceId,v.videoId,v.title,v.channel||'',v.url||'']);}
async function removeFavorite(deviceId,videoId){await query('DELETE FROM favorites WHERE device_id=? AND video_id=?',[deviceId,videoId]);}
module.exports={searchYouTube,saveSearch,savePlay,history,favorites,addFavorite,removeFavorite};
