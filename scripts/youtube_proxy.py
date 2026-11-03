#!/usr/bin/env python3
"""Small JSON proxy for resolving YouTube audio URLs with yt-dlp."""

import json
import os
import subprocess
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "18080"))
YTDLP = os.environ.get("YTDLP_BIN", "yt-dlp")
YTDLP_PROXY = os.environ.get("YTDLP_PROXY", "").strip()
REQUEST_TIMEOUT_S = max(10, int(os.environ.get("YTDLP_TIMEOUT_S", "90")))
YOUTUBE_HOSTS = {"youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube.com"}


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _build_ytdlp_commands(self, target):
        base = [
            YTDLP,
            "--ignore-config",
            "--socket-timeout", str(max(REQUEST_TIMEOUT_S // 2, 20)),
            "-f", "bestaudio/best",
            "--no-playlist",
            "--no-warnings",
            "--get-url",
            target,
        ]
        if YTDLP_PROXY:
            base[1:1] = ["--proxy", YTDLP_PROXY]
        # Prefer yt-dlp's maintained defaults. Hard-coded legacy clients can
        # expose no downloadable audio formats and cause format-not-available.
        clients = [item.strip() for item in os.environ.get("YT_DLP_PLAYER_CLIENTS", "").split(",") if item.strip()]
        if clients:
            base += ["--extractor-args", f"youtube:player_client={','.join(clients)}"]
        return [base]

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/health":
            return self._json(200, {"status": "ok"})
        if parsed.path not in ("/proxy", "/search"):
            return self._json(404, {"error": "not_found"})

        params = urllib.parse.parse_qs(parsed.query)
        if parsed.path == "/search":
            query = params.get("q", [""])[0].strip()
            if not query or len(query) > 200:
                return self._json(400, {"error": "invalid_query"})
            target = f"ytsearch1:{query}"
        else:
            target = params.get("url", [""])[0].strip()
            try:
                video = urllib.parse.urlsplit(target)
            except ValueError:
                return self._json(400, {"error": "invalid_url"})
            if video.scheme not in ("http", "https") or (video.hostname or "").lower() not in YOUTUBE_HOSTS:
                return self._json(400, {"error": "youtube_url_required"})

        last_error = "yt_dlp_failed"
        for command in self._build_ytdlp_commands(target):
            try:
                proc = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=REQUEST_TIMEOUT_S + 10,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                last_error = "yt_dlp_timeout"
                continue
            except OSError as error:
                last_error = str(error)
                break

            urls = [line.strip() for line in proc.stdout.splitlines() if line.strip().startswith(("https://", "http://"))]
            if proc.returncode == 0 and urls:
                return self._json(200, {"audio_url": urls[-1], "status": "ok"})
            last_error = (proc.stderr or proc.stdout or "yt_dlp_failed").strip()[-1200:]

        print(f"[yt-dlp] {last_error}", flush=True)
        return self._json(502, {"error": "yt_dlp_failed", "detail": last_error})

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    print(f"YouTube proxy listening on http://{HOST}:{PORT}", flush=True)
    server = HTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
