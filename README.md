# Xiaozhi API Server

Node.js API + MCP server cho Xiaozhi, không cần API key bên ngoài.

## Tính năng
- YouTube search bằng yt-search, lưu lịch sử và yêu thích MySQL.
- Weather bằng Open-Meteo, geocoding tự động, cache MySQL.
- News bằng RSS/Google News RSS, cache MySQL.
- Suggestions cá nhân hóa từ lịch sử tìm kiếm.
- REST API + MCP JSON-RPC `/mcp`.
- Dashboard web `/`.

## Cài đặt trên Orihost
1. Tạo Supabase project, mở **Connect**, chọn **Session pooler**, rồi sao chép URI PostgreSQL.
2. Upload toàn bộ project.
3. Copy `.env.example` thành `.env`; điền `DATABASE_URL`, hoặc điền `SUPABASE_DB_HOST`, `SUPABASE_DB_USER` và `SUPABASE_DB_PASSWORD` từ Supabase **Connect → Session pooler**. Nếu kết nối báo lỗi chứng chỉ, tải CA certificate trong **Database Settings → SSL Configuration** và đặt đường dẫn ở `SUPABASE_DB_CA_CERT`.
4. Chạy `npm install`.
5. Startup command: `npm start`.
6. Mở domain của bạn và kiểm tra `/health`.

Lệnh `npm install` tự tải yt-dlp chính thức vào thư mục `yt-dlp/` để bật tính năng phát YouTube. Khi đổi hệ điều hành hoặc kiến trúc server, chạy lại `npm install` trong môi trường deploy.

If `yt-dlp` is deleted after installation, the server automatically tries to restore it in the background when it starts. You can also run `npm run install:ytdlp` manually. If the release download fails, the API stays online and logs the reason; YouTube playback remains unavailable until a binary is restored or a fallback is configured.

### Database
Trong Supabase SQL Editor, chạy toàn bộ `sql/schema.supabase.sql`. Server kết nối PostgreSQL bằng `DATABASE_URL`; `sql/schema.sql` chỉ giữ lại cho cài đặt MySQL cũ và không dùng để khởi tạo server hiện tại.

## API
GET `/api/youtube/search?q=Sơn+Tùng`
POST `/api/youtube/play` body `{ "deviceId":"xiaozhi-01", "video": {"videoId":"...","title":"..."} }`
GET `/api/weather?city=Tuyên%20Quang`
GET `/api/news/latest`
GET `/api/news/search?q=AI`
GET `/api/suggest?deviceId=xiaozhi-01`
GET `/api/companion/status`
GET `/api/companion/briefing?city=Hồ%20Chí%20Minh`
GET `/api/companion/news?limit=5` and `/api/companion/news/detail?id=...`
GET/POST/DELETE `/api/companion/reminders` (use `?scope=upcoming` to list future reminders)
GET `/api/companion/gold/sjc`
GET `/api/companion/lottery?region=mien-bac`
GET `/api/finance/overview`, `/api/finance/exchange-rates?base=USD`, `/api/finance/stock-market`, `/api/finance/news`, `/api/finance/crypto-market`
GET `/api/companion/story?topic=...` and `/api/companion/wordplay`
GET `/api/companion/music/soundcloud/search?q=...` to find playable tracks. Play a selected result with `/api/companion/music/soundcloud/play?url=...&title=...`; query-only playback is also supported. YouTube audio, VOV3, and radio streams are available at `/api/companion/music/youtube/play?q=...`, `/api/companion/music/channel3/play`, and `/api/companion/radio/play?q=...`.
Firmware-compatible aliases are also available at `/api/briefing`, `/api/reminders`, `/api/gold/sjc`, `/api/lottery`, `/api/story`, `/api/wordplay`, `/api/music/...`, and `/api/radio/play`.
POST `/mcp`
GET `/api/mcp/tools` returns the live MCP tool catalog used by the dashboard.
GET `/health`

## MCP tools
`youtube_search`, `youtube_play`, `weather_current`, `news_latest`, `news_detail`, `news_search`, `get_history`, `get_suggestions`, `daily_briefing`, `reminder_add`, `reminder_list_today`, `reminder_list_upcoming`, `reminder_delete`, `gold_sjc`, `lottery_results`, `get_financial_overview`, `get_exchange_rates`, `get_stock_market`, `get_financial_news`, `get_crypto_market`, `radio_play`, `soundcloud_search`, `soundcloud_play`, `youtube_audio_play`, `music_channel3_play`, `story_get`, `wordplay_get`.

## Companion configuration
PostgreSQL initialization creates the tables in `sql/schema.supabase.sql`; reminders are isolated by `deviceId` and stored as UTC timestamps. Set `DEFAULT_CITY` for MCP morning briefings. Music streaming requires FFmpeg with the `libopus` encoder. At startup, the server uses a working FFmpeg from the host or automatically downloads a validated Linux x64 build into `ffmpeg-bin/` when missing; the download is streamed and only the FFmpeg executable is kept. Other platforms need FFmpeg installed on the host and `FFMPEG_BIN` set to its path. Configure `YOUTUBE_PROXY_URL` to route YouTube playback through the Python proxy; the public API URL is inferred from the request domain. Lottery requires `XOSO_API_URL` and `XOSO_API_KEY`. Optional values are listed in `.env.example`.

Rows in `weather_cache` and `news_cache` are automatically removed when older than 30 minutes; the cleanup runs every 30 minutes.

Financial data uses Frankfurter reference exchange rates, Yahoo Finance chart data for indices, Binance public spot-market data for crypto, VnExpress Kinh doanh RSS, and the configured SJC gold source. Providers can change availability and update schedules; responses identify their source where possible. Set `FINANCIAL_NEWS_RSS_URL` to override the default business-news feed.

## Lưu ý YouTube
YouTube playback uses yt-dlp directly by default; the server installs or refreshes the official yt-dlp binary at startup. You do not need YouTube cookies or a separate proxy URL for this mode. `YOUTUBE_PROXY_URL` is optional and only switches playback to an independently hosted Python proxy when explicitly set. On a host, allow the service to finish its startup yt-dlp download; `/api/admin/config` reports YouTube as ready once the executable can run. Set `BASE_URL` only if the API cannot infer its public domain from the incoming MCP request.

### YouTube proxy

Run `python scripts/youtube_proxy.py` as a separate service with `yt-dlp` available in `PATH` (or set `YTDLP_BIN`). Publish that service over HTTPS, then set `YOUTUBE_PROXY_URL` on the Node API to the proxy's base origin, for example `https://youtube-proxy.example.com`. The API calls `/search?q=...` for searches and `/proxy?url=...` for YouTube URLs. The proxy returns a temporary `audio_url`, which the API transcodes with FFmpeg. The proxy lets yt-dlp select its maintained YouTube clients by default; leave `YT_DLP_PLAYER_CLIENTS` unset unless you have tested a specific override. YouTube cookies are not used.

The API derives its public MCP stream URL from the incoming domain automatically. Set `BASE_URL` only if the deployment cannot forward its public host to the API.

### Low-memory deployment (500 MB)

The `npm start` command runs `node --expose-gc --max-old-space-size=192 server.js`, limiting Node.js old-space to 192 MB and enabling explicit garbage collection. Audio transcoding is limited to one concurrent stream because yt-dlp/SoundCloud and FFmpeg use memory outside the Node.js heap. PostgreSQL pool size defaults to three (and is capped at three), request bodies are capped at 256 KB JSON / 64 KB form data, and finance/metrics in-memory caches have fixed entry limits. These limits leave headroom for native modules and audio child processes; total RSS still depends on the host, Node version, and media source.
