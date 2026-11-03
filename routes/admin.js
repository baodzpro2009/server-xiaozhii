const express = require('express');
const { snapshot } = require('../services/metrics');
const { executableAvailable, isYtDlpAvailable } = require('../services/binary-status');
const router = express.Router();

router.get('/metrics', (_req, res) => res.json(snapshot()));
router.get('/config', (req, res) => res.json({
  items: [
    { name: 'PostgreSQL', configured: Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_HOST) },
    { name: 'Public API URL', configured: Boolean(process.env.BASE_URL || req.get('host')) },
    { name: 'YouTube (yt-dlp)', configured: isYtDlpAvailable() },
    { name: 'Lottery provider', configured: Boolean(process.env.XOSO_API_URL && process.env.XOSO_API_KEY) },
    { name: 'FFmpeg', configured: executableAvailable(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']) },
  ],
  note: 'Direct yt-dlp mode needs no YouTube cookies or proxy URL. The server installs yt-dlp at startup; a Python proxy is optional.',
}));

module.exports = router;
