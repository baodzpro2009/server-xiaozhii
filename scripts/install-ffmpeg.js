"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const directory = path.join(__dirname, "..", "ffmpeg-bin");
const executable = path.join(directory, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const downloadUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz";
const minimumFreeBytes = 112 * 1024 * 1024;

function getVersion(binary) {
  const result = spawnSync(binary, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 5000,
  });
  return !result.error && result.status === 0 ? result.stdout.split(/\r?\n/, 1)[0] : null;
}

function hasOpusEncoder(binary) {
  const result = spawnSync(binary, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 7000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return !result.error && result.status === 0 && /\blibopus\b/i.test(`${result.stdout}\n${result.stderr}`);
}

function isUsable(binary) {
  return Boolean(binary && getVersion(binary) && hasOpusEncoder(binary));
}

function systemBinary() {
  const configured = process.env.FFMPEG_BIN;
  if (configured && isUsable(configured)) return configured;
  if (isUsable("ffmpeg")) return "ffmpeg";
  return null;
}

function availableBytes(target) {
  try {
    const stats = fs.statfsSync(target);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return Infinity;
  }
}

async function downloadLinuxX64() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`automatic download supports Linux x64 only (current: ${process.platform}/${process.arch}); install FFmpeg with libopus on the host or set FFMPEG_BIN`);
  }
  fs.mkdirSync(directory, { recursive: true });
  const freeBytes = availableBytes(directory);
  if (freeBytes < minimumFreeBytes) {
    throw new Error(`not enough disk space for FFmpeg (need at least ${Math.ceil(minimumFreeBytes / 1024 / 1024)} MiB free)`);
  }

  const stageDirectory = path.join(directory, `.install-${process.pid}-${Date.now()}`);
  fs.mkdirSync(stageDirectory, { recursive: true });
  let stderr = "";
  let tar;
  try {
    console.log(`[ffmpeg] downloading the latest Linux x64 build (${Math.floor(freeBytes / 1024 / 1024)} MiB free)`);
    const response = await fetch(downloadUrl, {
      headers: { "user-agent": "xiaozhi-api-server" },
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`);

    tar = spawn("tar", ["-xJf", "-", "--wildcards", "--strip-components=2", "-C", stageDirectory, "*/bin/ffmpeg"], {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });
    tar.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-4000); });
    const tarExit = new Promise((resolve, reject) => {
      tar.once("error", reject);
      tar.once("close", (code, signal) => resolve({ code, signal }));
    });
    const [, result] = await Promise.all([
      pipeline(Readable.fromWeb(response.body), tar.stdin),
      tarExit,
    ]);
    if (result.code !== 0) throw new Error(`could not extract FFmpeg${stderr ? `: ${stderr.trim()}` : ` (tar exit ${result.code ?? result.signal})`}`);

    const stagedBinary = path.join(stageDirectory, "ffmpeg");
    if (!fs.existsSync(stagedBinary)) throw new Error("FFmpeg binary was missing from the downloaded archive");
    fs.chmodSync(stagedBinary, 0o755);
    if (!isUsable(stagedBinary)) throw new Error("downloaded FFmpeg failed validation or has no libopus encoder");

    const backup = `${executable}.backup`;
    fs.rmSync(backup, { force: true });
    if (fs.existsSync(executable)) fs.renameSync(executable, backup);
    try {
      fs.renameSync(stagedBinary, executable);
      fs.rmSync(backup, { force: true });
    } catch (error) {
      if (fs.existsSync(backup) && !fs.existsSync(executable)) fs.renameSync(backup, executable);
      throw error;
    }
    console.log(`[ffmpeg] installed ${getVersion(executable)} at ${executable}`);
    return executable;
  } catch (error) {
    tar?.kill();
    throw error;
  } finally {
    fs.rmSync(stageDirectory, { recursive: true, force: true });
  }
}

async function install() {
  const existing = systemBinary();
  if (existing) {
    console.log(`[ffmpeg] ready: ${getVersion(existing)} (${existing})`);
    return existing;
  }
  return downloadLinuxX64();
}

module.exports = { install, executable, getVersion, hasOpusEncoder, isUsable };

if (require.main === module) {
  install().catch(error => {
    console.error("[ffmpeg] automatic installation failed:", error.message);
    process.exitCode = 1;
  });
}
