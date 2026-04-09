#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "assets", "photos");
const CONFIG_PATH = path.join(ROOT, "data", "config.js");
const OUTPUT_PATH = path.join(ROOT, "data", "photos.js");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".heic", ".heif"]);
const ARGS = new Set(process.argv.slice(2));
const WATCH_MODE = ARGS.has("--watch") || ARGS.has("-w");

main();

function main() {
  ensureDir(path.dirname(OUTPUT_PATH));

  runImport({ startup: true });

  if (WATCH_MODE) {
    startWatchMode();
  }
}

function runImport(options = {}) {
  const startup = Boolean(options.startup);
  const reason = options.reason ? String(options.reason) : "";

  if (!fs.existsSync(SOURCE_DIR)) {
    ensureDir(SOURCE_DIR);
    writeEmptyOutput();

    if (startup) {
      console.log(`[import-photos] 已自动创建目录: ${SOURCE_DIR}`);
      if (WATCH_MODE) {
        console.log("[import-photos] watch 模式已开启，放入照片后会自动导入。");
      } else {
        console.log("[import-photos] 请把照片放进去后再运行: node scripts/import-photos.js");
      }
    }
    return { count: 0, status: "empty" };
  }

  const config = loadConfig(CONFIG_PATH);
  const places = normalizePlaces(config.places || []);
  const folderVisitSummary = collectFolderVisitSummary(SOURCE_DIR, places);
  const imageFiles = listImageFiles(SOURCE_DIR).sort((a, b) => a.localeCompare(b));
  const photos = imageFiles.map((filePath, index) => buildPhotoRecord(filePath, index, places));

  const banner = [
    "// 自动生成文件，请勿手改。",
    "// 重新导入请运行: node scripts/import-photos.js",
    `// 生成时间: ${new Date().toISOString()}`
  ].join("\n");

  const payload = `${banner}\nwindow.PHOTOS_DATA = ${JSON.stringify(photos, null, 2)};\nwindow.PHOTOS_META = ${JSON.stringify(
    { folderVisits: folderVisitSummary },
    null,
    2
  )};\n`;
  fs.writeFileSync(OUTPUT_PATH, payload, "utf8");

  if (imageFiles.length === 0) {
    if (startup) {
      console.log("[import-photos] 未检测到图片，已写入空的 data/photos.js");
      if (WATCH_MODE) {
        console.log("[import-photos] 等待新增图片中...");
      }
    } else if (reason) {
      console.log(`[import-photos] 触发更新（${reason}），当前无图片。`);
    }
  }

  if (reason) {
    console.log(`[import-photos] 触发更新（${reason}）`);
  }
  console.log(`[import-photos] 已导入 ${photos.length} 张照片 -> ${OUTPUT_PATH}`);
  summarizePlaces(photos, folderVisitSummary);

  return { count: photos.length, status: imageFiles.length === 0 ? "empty" : "ok" };
}

function startWatchMode() {
  console.log("[import-photos] watch 模式启动: 监听 assets/photos 与 data/config.js");
  console.log("[import-photos] 停止监听请按 Ctrl + C");

  const watchers = [];
  const scheduleImport = debounce((reason) => {
    try {
      runImport({ reason });
    } catch (error) {
      console.error(`[import-photos] 自动导入失败: ${error && error.message ? error.message : error}`);
    }
  }, 380);

  const sourceWatcher = watchPath(
    SOURCE_DIR,
    true,
    (eventType, filename) => {
      if (!isPhotoRelatedChange(filename)) return;
      scheduleImport(`photos:${eventType}${filename ? `:${filename}` : ""}`);
    },
    "照片目录"
  );
  if (sourceWatcher) watchers.push(sourceWatcher);

  const configWatcher = watchPath(
    path.dirname(CONFIG_PATH),
    false,
    (eventType, filename) => {
      const file = normalizeFilename(filename);
      if (!file || file === path.basename(CONFIG_PATH)) {
        scheduleImport(`config:${eventType}${file ? `:${file}` : ""}`);
      }
    },
    "配置目录"
  );
  if (configWatcher) watchers.push(configWatcher);

  process.on("SIGINT", () => {
    watchers.forEach((w) => {
      try {
        w.close();
      } catch {
        // ignore
      }
    });
    console.log("\n[import-photos] watch 已停止");
    process.exit(0);
  });
}

function watchPath(targetPath, recursive, onEvent, label) {
  ensureDir(targetPath);

  try {
    const watcher = fs.watch(targetPath, { recursive }, (eventType, filename) => {
      onEvent(eventType, filename);
    });
    console.log(`[import-photos] 已监听${label}: ${targetPath}`);
    return watcher;
  } catch (error) {
    console.error(`[import-photos] 无法监听${label}: ${targetPath}`);
    console.error(`[import-photos] ${error && error.message ? error.message : error}`);
    return null;
  }
}

function isPhotoRelatedChange(filename) {
  const file = normalizeFilename(filename);
  if (!file) return true;

  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return true;

  // folder create/delete or temporary rename events may come without image ext
  if (!ext) return true;

  return false;
}

function normalizeFilename(filename) {
  if (filename === null || filename === undefined) return "";
  return String(filename).replace(/\\/g, "/");
}

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}

function writeEmptyOutput() {
  fs.writeFileSync(
    OUTPUT_PATH,
    "// 自动生成：未检测到照片，输出空数组。\nwindow.PHOTOS_DATA = [];\nwindow.PHOTOS_META = { folderVisits: [] };\n",
    "utf8"
  );
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return { places: [] };
  }

  const source = fs.readFileSync(configPath, "utf8");
  const sandbox = { window: {}, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 500 });

  const cfg = (sandbox.window && sandbox.window.LOVE_CONFIG) || sandbox.LOVE_CONFIG || {};
  if (!cfg || typeof cfg !== "object") return { places: [] };
  return cfg;
}

function normalizePlaces(places) {
  const rows = Array.isArray(places) ? places : [];
  const map = new Map();

  rows.forEach((item, index) => {
    const row = normalizePlace(item, index);
    if (!row.id) return;
    if (!map.has(row.id)) map.set(row.id, row);
  });

  return Array.from(map.values());
}

function normalizePlace(value, index) {
  if (typeof value === "string") {
    const id = slugify(value);
    return { id, name: value, aliases: [value, id] };
  }

  if (value && typeof value === "object") {
    const rawId = value.id || value.key || value.code || value.name || `place-${index + 1}`;
    const id = slugify(rawId);
    const name = value.name || value.label || rawId;
    const aliases = [name, value.id, value.key, value.code]
      .filter(Boolean)
      .map((x) => String(x));
    return { id, name, aliases: Array.from(new Set([name, id, ...aliases])) };
  }

  const fallback = `place-${index + 1}`;
  return { id: fallback, name: fallback, aliases: [fallback] };
}

function listImageFiles(dir) {
  const result = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    entries.forEach((entry) => {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        return;
      }
      if (!entry.isFile()) return;
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        result.push(absolute);
      }
    });
  }

  return result;
}

function buildPhotoRecord(filePath, index, places) {
  const relative = toPosix(path.relative(ROOT, filePath));
  const basename = path.basename(filePath, path.extname(filePath));
  const date = inferDate(filePath, basename);
  const folderVisit = parseFolderVisitMeta(relative);
  const placeInfo = folderVisit
    ? resolvePlaceByToken(folderVisit.cityToken, places)
    : detectPlace(relative, basename, places, index);
  const title = inferTitle(basename, placeInfo.name, index, placeInfo.aliases);
  const visit = folderVisit ? folderVisit.visit : 1;
  const visitKey = `${placeInfo.id}#${visit}`;

  return {
    id: `${placeInfo.id}-${String(index + 1).padStart(4, "0")}`,
    src: relative,
    title,
    date,
    place: placeInfo.id,
    placeName: placeInfo.name,
    visit,
    visitKey
  };
}

function detectPlace(relativePath, basename, places, index) {
  const searchable = `${relativePath} ${basename}`.toLowerCase();

  for (const place of places) {
    const aliases = (place.aliases || []).filter(Boolean);
    const hit = aliases.some((alias) => {
      const normalized = String(alias).toLowerCase();
      return normalized && searchable.includes(normalized);
    });
    if (hit) return place;
  }

  const chineseHit = basename.match(/[\u4e00-\u9fff]{2,}/);
  if (chineseHit) {
    const name = chineseHit[0];
    return { id: slugify(name), name, aliases: [name] };
  }

  const guessed = inferUnknownPlace(relativePath, basename);
  if (guessed) {
    return guessed;
  }

  if (places.length > 0) {
    return places[index % places.length];
  }

  return { id: "other", name: "其他", aliases: ["other", "其他"] };
}

function parseFolderVisitMeta(relativePath) {
  const normalized = toPosix(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  const photoRootIdx = parts.findIndex((x) => x.toLowerCase() === "photos");
  if (photoRootIdx < 0 || photoRootIdx + 1 >= parts.length - 1) return null;

  const folderRaw = String(parts[photoRootIdx + 1] || "").trim();
  const folderSlug = slugify(folderRaw);
  if (!folderSlug) return null;

  const matched = folderSlug.match(/^(.+?)(?:-)?(\d+)$/);
  if (!matched) {
    return { cityToken: folderSlug, visit: 1, folderRaw };
  }

  return {
    cityToken: matched[1],
    visit: normalizeVisitValue(matched[2], 1),
    folderRaw
  };
}

function resolvePlaceByToken(token, places) {
  const normalized = slugify(token);
  if (!normalized) return { id: "other", name: "其他", aliases: ["other", "其他"] };

  const matched = places.find((place) => {
    if (place.id === normalized) return true;
    const aliases = Array.isArray(place.aliases) ? place.aliases : [];
    return aliases.some((alias) => slugify(alias) === normalized);
  });

  if (matched) return matched;

  return {
    id: normalized,
    name: humanizeSlug(token),
    aliases: [token, normalized]
  };
}

function collectFolderVisitSummary(sourceDir, places) {
  if (!fs.existsSync(sourceDir)) return [];

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const cityMap = new Map();

  entries.forEach((entry) => {
    if (!entry.isDirectory()) return;

    const folderRaw = String(entry.name || "").trim();
    if (!folderRaw) return;

    const meta = parseFolderVisitMeta(`assets/photos/${folderRaw}/_`);
    if (!meta || !meta.cityToken) return;

    const placeInfo = resolvePlaceByToken(meta.cityToken, places);
    const placeId = placeInfo.id || slugify(meta.cityToken);
    if (!placeId) return;

    const visit = normalizeVisitValue(meta.visit, 1);
    const visitKey = `${placeId}#${visit}`;

    const existing = cityMap.get(placeId) || {
      place: placeId,
      placeName: placeInfo.name || humanizeSlug(meta.cityToken),
      visitKeys: new Set()
    };
    existing.visitKeys.add(visitKey);
    cityMap.set(placeId, existing);
  });

  return Array.from(cityMap.values())
    .map((item) => ({
      place: item.place,
      placeName: item.placeName,
      visitCount: item.visitKeys.size,
      visitKeys: Array.from(item.visitKeys).sort()
    }))
    .sort((a, b) => b.visitCount - a.visitCount || a.place.localeCompare(b.place));
}

function inferUnknownPlace(relativePath, basename) {
  const normalized = toPosix(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  const photoRootIdx = parts.findIndex((x) => x.toLowerCase() === "photos");
  if (photoRootIdx >= 0 && photoRootIdx + 1 < parts.length - 1) {
    const folder = parts[photoRootIdx + 1];
    const folderSlug = slugify(folder);
    if (isLikelyPlaceToken(folderSlug)) {
      return { id: folderSlug, name: humanizeSlug(folderSlug), aliases: [folderSlug] };
    }
  }

  const tokens = `${basename}`.toLowerCase().split(/[\s_.-]+/).filter(Boolean);
  for (const token of tokens) {
    const slug = slugify(token);
    if (isLikelyPlaceToken(slug)) {
      return { id: slug, name: humanizeSlug(slug), aliases: [slug] };
    }
  }

  return null;
}

function isLikelyPlaceToken(value) {
  if (!value) return false;
  if (/^\d+$/.test(value)) return false;
  if (value.length < 3) return false;
  if (/^20\d{6}$/.test(value)) return false;

  const stopWords = new Set([
    "img",
    "image",
    "photo",
    "dsc",
    "p",
    "pic",
    "wechat",
    "mmexport",
    "edited",
    "copy",
    "final"
  ]);

  return !stopWords.has(value);
}

function humanizeSlug(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  if (/[\u4e00-\u9fff]/.test(text)) return text;
  if (!text.includes("-")) return text.charAt(0).toUpperCase() + text.slice(1);
  return text
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferDate(filePath, basename) {
  const hit = String(basename).match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2]\d|3[01])/);
  if (hit) {
    return `${hit[1]}-${hit[2]}-${hit[3]}`;
  }

  const stat = fs.statSync(filePath);
  const d = stat.mtime;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inferTitle(basename, placeName, index, aliases) {
  const aliasSet = new Set((aliases || []).map((x) => String(x).toLowerCase()));

  let cleaned = basename
    .replace(/[_-]+/g, " ")
    .replace(/\b20\d{2}[ ._-]?(0[1-9]|1[0-2])[ ._-]?([0-2]\d|3[01])\b/g, " ")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !aliasSet.has(w.toLowerCase()));
  cleaned = kept.join(" ").trim();

  if (cleaned.length >= 2 && /[A-Za-z\u4e00-\u9fff]/.test(cleaned)) {
    return cleaned;
  }

  return `${placeName}记忆 ${String(index + 1).padStart(3, "0")}`;
}

function summarizePlaces(photos, folderVisitSummary = []) {
  const counts = new Map();

  photos.forEach((p) => {
    const placeId = p.place || "other";
    const placeName = p.placeName || p.place || "其他";
    const row = counts.get(placeId) || { name: placeName, photos: 0, visits: new Set() };
    row.photos += 1;
    row.visits.add(p.visitKey || `${placeId}#${normalizeVisitValue(p.visit, 1)}`);
    counts.set(placeId, row);
  });

  folderVisitSummary.forEach((item) => {
    const placeId = item.place || "other";
    const row = counts.get(placeId) || { name: item.placeName || placeId, photos: 0, visits: new Set() };
    const keys = Array.isArray(item.visitKeys) ? item.visitKeys : [];
    if (keys.length > 0) {
      keys.forEach((key) => row.visits.add(String(key)));
    } else {
      const n = normalizeVisitValue(item.visitCount, 0);
      for (let i = 1; i <= n; i += 1) {
        row.visits.add(`${placeId}#${i}`);
      }
    }
    row.name = item.placeName || row.name;
    counts.set(placeId, row);
  });

  const lines = Array.from(counts.values())
    .sort((a, b) => b.photos - a.photos || b.visits.size - a.visits.size)
    .map((row) => `${row.name}:${row.photos}张/${row.visits.size}次`)
    .join(" | ");

  console.log(`[import-photos] 城市分布: ${lines || "无"}`);
}

function normalizeVisitValue(value, fallback = 1) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toPosix(filePath) {
  return filePath.replace(/\\/g, "/");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
