"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createWriteStream } = require("node:fs");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const directory = path.join(__dirname, "..", "yt-dlp");
const isWindows = process.platform === "win32";
const asset = isWindows ? "yt-dlp.exe" : "yt-dlp_linux";
const executable = path.join(directory, isWindows ? "yt-dlp.exe" : "yt-dlp");
const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
const latestReleaseUrl = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";

function readVersion(binary) {
  const result = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 5000,
  });
  return !result.error && result.status === 0 ? result.stdout.trim() : null;
}

function compareVersions(left, right) {
  const parse = value => String(value).replace(/^v/i, "").match(/\d+/g)?.map(Number) || null;
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

async function getLatestVersion() {
  const response = await fetch(latestReleaseUrl, {
    headers: { accept: "application/vnd.github+json", "user-agent": "xiaozhi-api-server" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GitHub release check failed: HTTP ${response.status}`);
  const release = await response.json();
  if (!release.tag_name) throw new Error("GitHub latest release has no tag_name");
  return String(release.tag_name).replace(/^v/i, "");
}

async function install({ force = false } = {}) {
  fs.mkdirSync(directory, { recursive: true });

  const currentVersion = fs.existsSync(executable) ? readVersion(executable) : null;
  if (!force && currentVersion) {
    try {
      const latestVersion = await getLatestVersion();
      const comparison = compareVersions(currentVersion, latestVersion);
      if (comparison !== null && comparison >= 0) {
        console.log(`yt-dlp ${currentVersion} is up to date: ${executable}`);
        return { version: currentVersion, updated: false };
      }
      if (comparison === null) {
        console.warn(`[yt-dlp] cannot compare versions (${currentVersion} vs ${latestVersion}); keeping the installed binary`);
        return { version: currentVersion, updated: false };
      }
      console.log(`[yt-dlp] update available: ${currentVersion} -> ${latestVersion}`);
    } catch (error) {
      console.warn(`[yt-dlp] could not check for updates; keeping ${currentVersion}: ${error.message}`);
      return { version: currentVersion, updated: false, check_failed: true };
    }
  }

  const temporary = path.join(directory, `yt-dlp-${process.pid}-${Date.now()}${isWindows ? '.exe' : ''}.download`);
  // Keep the executable suffix at the end on Windows so the staged binary can
  // be launched for validation before replacing the working copy.
  const staged = isWindows ? temporary.replace(/\.download$/, '.exe') : temporary;
  console.log(`Downloading the official yt-dlp release for ${process.platform}/${process.arch}`);
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) {
    throw new Error(`yt-dlp download failed: HTTP ${response.status}`);
  }

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(staged, { mode: 0o755 }));
    if (!isWindows) fs.chmodSync(staged, 0o755);

    const installed = spawnSync(staged, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: 10000,
    });
    if (installed.error || installed.status !== 0) {
      throw new Error(`Downloaded yt-dlp could not run: ${installed.error?.message || installed.stderr || installed.status}`);
    }

    // Preserve the currently working binary if swapping the new file fails.
    const backup = `${executable}.backup`;
    fs.rmSync(backup, { force: true });
    if (fs.existsSync(executable)) fs.renameSync(executable, backup);
    try {
      fs.renameSync(staged, executable);
      fs.rmSync(backup, { force: true });
    } catch (error) {
      if (fs.existsSync(backup) && !fs.existsSync(executable)) fs.renameSync(backup, executable);
      throw error;
    }
    console.log(`yt-dlp ${installed.stdout.trim()} installed at ${executable}`);
    return { version: installed.stdout.trim(), updated: true };
  } catch (error) {
    try { fs.rmSync(staged, { force: true }); } catch {}
    throw error;
  }
}

module.exports = { install, executable, readVersion, compareVersions };

if (require.main === module) {
  install({ force: process.argv.includes('--force') }).catch((error) => {
    console.error("Could not install yt-dlp:", error.message);
    process.exitCode = 1;
  });
}
