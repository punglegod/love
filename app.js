const DEFAULT_CONFIG = {
  startDate: "2022-05-20",
  targetCount: 500,
  navAllLabel: "全部足迹",
  places: [
    { id: "hongkong", name: "香港" },
    { id: "guangzhou", name: "广州" },
    { id: "nanjing", name: "南京" },
    { id: "shanghai", name: "上海" },
    { id: "hangzhou", name: "杭州" }
  ]
};

const CONFIG = buildConfig(DEFAULT_CONFIG, window.LOVE_CONFIG);
const START_DATE = new Date(CONFIG.startDate);
const TARGET_COUNT = Number(CONFIG.targetCount) > 0 ? Number(CONFIG.targetCount) : 500;

const cardLayer = document.getElementById("cardLayer");
const river = document.getElementById("river");
const track = document.getElementById("track");
const daysTogetherEl = document.getElementById("daysTogether");
const photoCountEl = document.getElementById("photoCount");
const placeCountEl = document.getElementById("placeCount");
const latestStampEl = document.getElementById("latestStamp");
const latestPlaceEl = document.getElementById("latestPlace");
const memorySpanEl = document.getElementById("memorySpan");
const heroTopPlacesEl = document.getElementById("heroTopPlaces");
const progressTextEl = document.getElementById("progressText");
const filterNav = document.getElementById("filterNav");
const comparePanel = document.getElementById("comparePanel");
const compareBtn = document.getElementById("compareBtn");
const compareSection = document.querySelector(".compare");
const storyToggle = document.getElementById("storyToggle");
const modal = document.getElementById("photoModal");
const modalImage = document.getElementById("modalImage");
const modalDate = document.getElementById("modalDate");
const modalTitle = document.getElementById("modalTitle");
const closeModal = document.getElementById("closeModal");
const photosMeta = window.PHOTOS_META && typeof window.PHOTOS_META === "object" ? window.PHOTOS_META : null;

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      if (!img.src) img.src = img.dataset.src;
      observer.unobserve(img);
    });
  },
  { root: river, rootMargin: "220px" }
);

let allPhotos = [];
let visiblePhotos = [];
let storyTimer = null;
let currentFilter = "all";
let spotlightTimer = null;
let spotlightIndex = 0;
let spotlightPool = [];
let lunboPhotos = [];
let lunboIndex = 0;
let lunboTimer = null;

const heroSpotlight = document.getElementById("heroSpotlight");
const spotlightImg = document.getElementById("spotlightImg");
const spotlightTitle = document.getElementById("spotlightTitle");
const spotlightDate = document.getElementById("spotlightDate");
const clockH = document.getElementById("clockH");
const clockM = document.getElementById("clockM");
const clockS = document.getElementById("clockS");

init();

async function init() {
  daysTogetherEl.textContent = dayDiff(START_DATE, new Date());

  allPhotos = await loadPhotos();
  photoCountEl.textContent = allPhotos.length;

  renderFilterNav();
  updatePlaceCount();
  updateHeroSide();

  applyFilter(currentFilter);
  drawCompare();

  bindEvents();
  setupCompareEntrance();
  updateProgress();
  initSpotlight();
  startLiveClock();
  initLunbo();
}

async function loadPhotos() {
  if (Array.isArray(window.PHOTOS_DATA) && window.PHOTOS_DATA.length > 0) {
    return window.PHOTOS_DATA.map(normalizePhoto).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  try {
    const response = await fetch("data/photos.json", { cache: "no-store" });
    if (!response.ok) throw new Error("No photo JSON yet");
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Invalid data format");
    return data.map(normalizePhoto).sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch {
    return generateMockPhotos(TARGET_COUNT);
  }
}

function normalizePhoto(photo, index) {
  const date = photo.date || shiftDate(START_DATE, index * 3);
  const src =
    photo.src ||
    `https://picsum.photos/seed/${encodeURIComponent((photo.id || index) + "-love")}/840/1120`;
  const folderPlace = extractPlaceFolder(src);
  const fallbackPlace = CONFIG.places[index % Math.max(1, CONFIG.places.length)] || { id: "other", name: "其他" };
  const placeId = folderPlace
    ? folderPlace.id
    : resolvePlaceId(photo.place || photo.city || photo.location, fallbackPlace.id);
  const placeName = folderPlace
    ? folderPlace.name
    : resolvePlaceName(placeId, photo.placeName || photo.city || photo.location || photo.place || fallbackPlace.name);
  const visit = normalizeVisitValue(photo.visit, folderPlace ? folderPlace.visit : 1);
  const visitKey = folderPlace ? folderPlace.visitKey : `${placeId}#${visit}`;

  return {
    id: photo.id ?? `memory-${index + 1}`,
    src,
    title: photo.title || `记忆片段 #${index + 1}`,
    date,
    place: placeId,
    placeName,
    visit,
    visitKey
  };
}

function generateMockPhotos(count) {
  const captions = ["第一次旅行", "夜里散步", "雨天晚餐", "海边日落", "生日惊喜", "清晨出发"];

  const places = CONFIG.places.length > 0 ? CONFIG.places : [{ id: "other", name: "其他" }];

  return Array.from({ length: count }, (_, i) => {
    const date = shiftDate(START_DATE, i * 3 + (i % 7));
    const place = places[i % places.length];
    return {
      id: `mock-${i + 1}`,
      src: `https://picsum.photos/seed/love-${i + 11}/840/1120`,
      title: `${captions[i % captions.length]} · ${i + 1}`,
      date,
      place: place.id,
      placeName: place.name,
      visit: 1,
      visitKey: `${place.id}#1`
    };
  });
}

function renderFilterNav() {
  if (!filterNav) return;

  const placeFilters = collectPlaceFilters();
  filterNav.innerHTML = "";

  const filters = [{ id: "all", name: CONFIG.navAllLabel || "全部足迹" }, ...placeFilters];

  if (!filters.some((item) => item.id === currentFilter)) {
    currentFilter = "all";
  }

  filters.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip${item.id === currentFilter ? " active" : ""}`;
    btn.dataset.filter = item.id;
    btn.textContent = item.name;
    filterNav.appendChild(btn);
  });
}

function collectPlaceFilters() {
  const map = new Map();

  getFolderVisitRows().forEach((row) => {
    const placeId = normalizePlaceId(row.place);
    if (!placeId) return;
    if (!map.has(placeId)) {
      map.set(placeId, {
        id: placeId,
        name: row.placeName || resolvePlaceName(placeId, placeId)
      });
    }
  });

  allPhotos.forEach((photo) => {
    const folderPlace = extractPlaceFolder(photo.src);
    if (!folderPlace) return;
    if (!map.has(folderPlace.id)) {
      map.set(folderPlace.id, {
        id: folderPlace.id,
        name: folderPlace.name
      });
    }
  });

  return Array.from(map.values());
}

function extractPlaceFolder(src) {
  if (typeof src !== "string" || src.length === 0) return null;

  const parts = src
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  const photosIndex = parts.findIndex((part) => part.toLowerCase() === "photos");

  if (photosIndex < 0 || photosIndex + 1 >= parts.length - 1) return null;

  const folderName = parts[photosIndex + 1];
  const folderInfo = parseFolderVisitInfo(folderName);
  if (!folderInfo.cityId) return null;

  const cityId = resolvePlaceId(folderInfo.cityId, folderInfo.cityId);
  const cityName = resolvePlaceName(cityId, folderInfo.cityId);

  return {
    id: cityId,
    name: cityName,
    visit: folderInfo.visit,
    visitKey: `${cityId}#${folderInfo.visit}`,
    rawFolder: folderName
  };
}

function parseFolderVisitInfo(folderName) {
  const normalized = normalizePlaceId(folderName);
  if (!normalized) return { cityId: "", visit: 1 };

  const matched = normalized.match(/^(.+?)(?:-)?(\d+)$/);
  if (!matched) {
    return { cityId: normalized, visit: 1 };
  }

  return {
    cityId: matched[1],
    visit: normalizeVisitValue(matched[2], 1)
  };
}

function updatePlaceCount() {
  if (!placeCountEl) return;
  placeCountEl.textContent = collectPlaceFilters().length;
}

function updateHeroSide() {
  if (!latestStampEl || !latestPlaceEl || !memorySpanEl || !heroTopPlacesEl) return;

  if (allPhotos.length === 0) {
    latestStampEl.textContent = "--";
    latestPlaceEl.textContent = "等待导入照片";
    memorySpanEl.textContent = "--";
    heroTopPlacesEl.innerHTML = "";
    return;
  }

  const sorted = [...allPhotos].sort((a, b) => new Date(a.date) - new Date(b.date));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];

  latestStampEl.textContent = prettyDate(latest.date);
  latestPlaceEl.textContent = latest.placeName || "未命名地点";
  memorySpanEl.textContent = `${diffDaysByDate(first.date, latest.date)} 天`;

  const placeStats = collectPlaceStats(allPhotos).slice(0, 4);
  heroTopPlacesEl.innerHTML = "";

  placeStats.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "hero-place-chip";
    chip.textContent = `${item.name} ${item.count}张 · ${item.visitCount}次`;
    heroTopPlacesEl.append(chip);
  });
}

function collectPlaceStats(photos) {
  const map = new Map();
  photos.forEach((photo) => {
    const id = photo.place || "other";
    const name = photo.placeName || photo.place || "其他";
    const visit = normalizeVisitValue(photo.visit, 1);
    const visitKey = photo.visitKey || `${id}#${visit}`;
    const existing = map.get(id) || { id, name, count: 0, visits: new Set() };
    existing.count += 1;
    existing.visits.add(visitKey);
    map.set(id, existing);
  });

  getFolderVisitRows().forEach((row) => {
    const id = normalizePlaceId(row.place);
    if (!id) return;
    const name = row.placeName || resolvePlaceName(id, id);
    const existing = map.get(id) || { id, name, count: 0, visits: new Set() };
    existing.name = name;

    const keys = Array.isArray(row.visitKeys) ? row.visitKeys : [];
    if (keys.length > 0) {
      keys.forEach((key) => existing.visits.add(String(key)));
    } else {
      const n = normalizeVisitValue(row.visitCount, 0);
      for (let i = 1; i <= n; i += 1) {
        existing.visits.add(`${id}#${i}`);
      }
    }

    map.set(id, existing);
  });

  return Array.from(map.values())
    .map((item) => ({
      id: item.id,
      name: item.name,
      count: item.count,
      visitCount: item.visits.size
    }))
    .sort((a, b) => b.count - a.count || b.visitCount - a.visitCount);
}

function getFolderVisitRows() {
  if (!photosMeta || !Array.isArray(photosMeta.folderVisits)) return [];
  return photosMeta.folderVisits;
}

function applyFilter(filter) {
  currentFilter = filter;
  visiblePhotos = filter === "all" ? [...allPhotos] : allPhotos.filter((p) => p.place === filter);
  renderTimeline(visiblePhotos);
}

function renderTimeline(photos) {
  cardLayer.innerHTML = "";

  const totalWidth = Math.max(4200, photos.length * 76);
  const height = river.clientHeight;
  const cardHeight = estimateCardHeight();

  track.setAttribute("viewBox", `0 0 ${totalWidth} ${height}`);
  track.innerHTML = `<path d="${buildTrackPath(totalWidth, height)}"></path>`;

  track.style.width = `${totalWidth}px`;
  cardLayer.style.width = `${totalWidth}px`;

  photos.forEach((photo, i) => {
    const card = document.createElement("button");
    card.className = "memory-card";
    card.type = "button";
    card.style.left = `${computeX(i, photos.length, totalWidth)}px`;
    card.style.top = `${computeY(i, height, cardHeight)}px`;

    const img = document.createElement("img");
    img.alt = photo.title;
    img.loading = "lazy";
    img.decoding = "async";
    img.dataset.src = photo.src;
    observer.observe(img);

    const time = document.createElement("time");
    time.dateTime = photo.date;
    time.textContent = `${prettyDate(photo.date)} · ${photo.placeName}`;

    card.append(img, time);
    card.addEventListener("click", () => openModal(photo));

    cardLayer.appendChild(card);
  });

  river.scrollLeft = 0;
  updateProgress();
}

function buildTrackPath(width, height) {
  const points = [];
  const steps = 24;
  const base = height * 0.52;

  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * width;
    // Start with a downward trend (top -> bottom), then keep a stronger, shorter wavelength wave.
    const wave =
      -Math.sin(i * 1.08 + 1.1) * (height * 0.17) -
      Math.cos(i * 0.74 + 0.25) * (height * 0.08);
    const y = base + wave;
    points.push(`${x},${y}`);
  }

  return `M ${points.join(" L ")}`;
}

function computeX(index, total, width) {
  const padding = 80;
  if (total <= 1) return padding;
  const span = width - padding * 2;
  return Math.round(padding + (index / (total - 1)) * span);
}

function computeY(index, height, cardHeight = estimateCardHeight()) {
  const safeTop = 14;
  const safeBottom = 16;
  const maxTop = Math.max(safeTop, Math.round(height - cardHeight - safeBottom));
  const available = Math.max(48, maxTop - safeTop);

  // Keep cards within a safe band while increasing amplitude and shortening wavelength.
  // Phase is chosen so the first screen starts high and then moves downward.
  const center = safeTop + available * 0.56;
  const waveA = -Math.sin(index * 0.62 + 2.2) * (available * 0.32);
  const waveB = -Math.cos(index * 1.04 + 0.4) * (available * 0.14);
  const jitter = ((index % 4) - 1.5) * (available * 0.035);
  const raw = Math.round(center + waveA + waveB + jitter);

  return Math.min(maxTop, Math.max(safeTop, raw));
}

function estimateCardHeight() {
  const cardWidth = Math.min(168, Math.max(120, window.innerWidth * 0.09));
  return Math.round((cardWidth * 4) / 3);
}

function drawCompare() {
  const picks = pickTwoFarPhotos(allPhotos);
  comparePanel.innerHTML = "";

  picks.forEach((photo) => {
    const card = document.createElement("article");
    card.className = "compare-card";
    card.innerHTML = `
      <img src="${photo.src}" alt="${photo.title}" loading="lazy" />
      <div class="compare-copy">
        <h4>${photo.title}</h4>
        <p>${prettyDate(photo.date)} · ${photo.placeName}</p>
      </div>
    `;
    card.querySelector("img").addEventListener("click", () => openModal(photo));
    comparePanel.append(card);
  });
}

function pickTwoFarPhotos(photos) {
  if (photos.length < 2) return photos;

  const sorted = [...photos].sort((a, b) => new Date(a.date) - new Date(b.date));
  const left = sorted[Math.floor(Math.random() * Math.max(1, sorted.length * 0.18))];
  const rightRangeStart = Math.floor(sorted.length * 0.72);
  const right = sorted[rightRangeStart + Math.floor(Math.random() * (sorted.length - rightRangeStart))];

  return [left, right];
}

function openModal(photo) {
  modalImage.src = photo.src;
  modalDate.textContent = `${prettyDate(photo.date)} · ${photo.placeName}`;
  modalTitle.textContent = photo.title;
  modal.showModal();
}

function bindEvents() {
  if (filterNav) {
    filterNav.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (!target.dataset.filter) return;

      currentFilter = target.dataset.filter;
      filterNav.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("active"));
      target.classList.add("active");
      applyFilter(currentFilter);
    });
  }

  river.addEventListener("scroll", updateProgress);
  compareBtn.addEventListener("click", drawCompare);
  storyToggle.addEventListener("click", toggleStoryMode);
  closeModal.addEventListener("click", () => modal.close());

  modal.addEventListener("click", (event) => {
    const rect = modal.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (clickedOutside) modal.close();
  });
}

function setupCompareEntrance() {
  if (!compareSection || !("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          compareSection.classList.add("in-view");
          compareSection.classList.remove("refract-run");
          void compareSection.offsetWidth;
          compareSection.classList.add("refract-run");
        } else {
          compareSection.classList.remove("in-view");
        }
      });
    },
    { threshold: 0.38 }
  );

  io.observe(compareSection);
}

function toggleStoryMode() {
  if (storyTimer) {
    clearInterval(storyTimer);
    storyTimer = null;
    storyToggle.textContent = "自动叙事";
    return;
  }

  storyToggle.textContent = "停止叙事";
  const steps = 18;
  let current = 0;

  storyTimer = setInterval(() => {
    const max = river.scrollWidth - river.clientWidth;
    if (max <= 0) return;
    const target = Math.round((current / steps) * max);
    river.scrollTo({ left: target, behavior: "smooth" });
    current += 1;
    if (current > steps) {
      clearInterval(storyTimer);
      storyTimer = null;
      storyToggle.textContent = "自动叙事";
    }
  }, 1800);
}

function updateProgress() {
  const max = river.scrollWidth - river.clientWidth;
  const ratio = max > 0 ? river.scrollLeft / max : 0;
  progressTextEl.textContent = `${Math.round(ratio * 100)}%`;
}

function initSpotlight() {
  if (!spotlightImg || allPhotos.length === 0) return;
  spotlightPool = [...allPhotos].sort(() => Math.random() - 0.5).slice(0, Math.min(20, allPhotos.length));
  spotlightIndex = 0;
  showSpotlightPhoto(spotlightPool[0]);
  spotlightTimer = setInterval(() => {
    spotlightIndex = (spotlightIndex + 1) % spotlightPool.length;
    crossfadeSpotlight(spotlightPool[spotlightIndex]);
  }, 4000);
  if (heroSpotlight) {
    heroSpotlight.addEventListener("click", () => {
      const photo = spotlightPool[spotlightIndex];
      if (photo) openModal(photo);
    });
    heroSpotlight.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const photo = spotlightPool[spotlightIndex];
        if (photo) openModal(photo);
      }
    });
  }
}

function showSpotlightPhoto(photo) {
  if (!photo || !spotlightImg) return;
  spotlightImg.src = photo.src;
  if (spotlightTitle) spotlightTitle.textContent = photo.title;
  if (spotlightDate) spotlightDate.textContent = `${prettyDate(photo.date)} · ${photo.placeName}`;
}

function crossfadeSpotlight(photo) {
  if (!photo || !spotlightImg) return;
  spotlightImg.classList.add("fading");
  setTimeout(() => {
    spotlightImg.src = photo.src;
    if (spotlightTitle) spotlightTitle.textContent = photo.title;
    if (spotlightDate) spotlightDate.textContent = `${prettyDate(photo.date)} · ${photo.placeName}`;
    spotlightImg.classList.remove("fading");
  }, 450);
}

function startLiveClock() {
  if (!clockH || !clockM || !clockS) return;
  function tick() {
    const diff = Date.now() - START_DATE.getTime();
    const totalSecs = Math.floor(diff / 1000);
    const h = Math.floor((totalSecs % 86400) / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    clockH.textContent = String(h).padStart(2, "0");
    clockM.textContent = String(m).padStart(2, "0");
    clockS.textContent = String(s).padStart(2, "0");
  }
  tick();
  setInterval(tick, 1000);
}

function resolvePlaceId(rawValue, fallbackId) {
  const normalized = normalizePlaceId(rawValue);
  if (!normalized) return normalizePlaceId(fallbackId);

  const matched = CONFIG.places.find(
    (place) => place.id === normalized || normalizePlaceId(place.name) === normalized
  );
  return matched ? matched.id : normalized;
}

function resolvePlaceName(placeId, fallbackName) {
  const found = CONFIG.places.find((place) => place.id === placeId);
  return found ? found.name : fallbackName || placeId || "未命名地点";
}

function buildConfig(defaultConfig, customConfig) {
  const custom = customConfig && typeof customConfig === "object" ? customConfig : {};
  const merged = { ...defaultConfig, ...custom };
  const rawPlaces = Array.isArray(custom.places) && custom.places.length > 0 ? custom.places : defaultConfig.places;

  const placeMap = new Map();
  rawPlaces.forEach((place, idx) => {
    const normalized = normalizePlaceConfig(place, idx);
    if (!normalized.id) return;
    if (!placeMap.has(normalized.id)) {
      placeMap.set(normalized.id, normalized);
    }
  });

  merged.places = Array.from(placeMap.values());
  return merged;
}

function normalizePlaceConfig(place, index) {
  if (typeof place === "string") {
    const id = normalizePlaceId(place);
    return { id, name: place };
  }

  if (place && typeof place === "object") {
    const rawId = place.id || place.key || place.code || place.name || `place-${index + 1}`;
    const id = normalizePlaceId(rawId);
    const name = place.name || place.label || rawId;
    return { id, name };
  }

  const fallback = `place-${index + 1}`;
  return { id: fallback, name: fallback };
}

function normalizePlaceId(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function normalizeVisitValue(value, fallback = 1) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function dayDiff(start, end) {
  return Math.max(1, Math.floor((end - start) / 86400000));
}

function diffDaysByDate(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.floor((end - start) / 86400000));
}

function shiftDate(base, deltaDays) {
  const d = new Date(base);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function prettyDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// ── 首页轮播（lunbo）───────────────────────────────────────

function initLunbo() {
  if (!Array.isArray(window.LUNBO_PHOTOS) || window.LUNBO_PHOTOS.length === 0) return;

  lunboPhotos = window.LUNBO_PHOTOS;

  const heroMain = document.querySelector(".hero-main");
  const lunboEl  = document.getElementById("heroLunbo");
  const dotsEl   = document.getElementById("lunboDots");
  const prevBtn  = document.getElementById("lunboPrev");
  const nextBtn  = document.getElementById("lunboNext");
  if (!heroMain || !lunboEl || !dotsEl || !prevBtn || !nextBtn) return;

  // 展开三列网格
  heroMain.classList.add("has-lunbo");

  // 渲染幻灯片
  lunboPhotos.forEach((photo, i) => {
    const slide = document.createElement("div");
    slide.className = `lunbo-slide${i === 0 ? " active" : ""}`;
    const img = document.createElement("img");
    img.src = photo.src;
    img.alt = photo.title || "";
    img.loading = i === 0 ? "eager" : "lazy";
    img.decoding = "async";
    slide.appendChild(img);
    lunboEl.insertBefore(slide, prevBtn); // 插入按鈕前面
  });

  // 多张时才展示箭头和圆点
  if (lunboPhotos.length > 1) {
    // 渲染圆点
    lunboPhotos.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `lunbo-dot${i === 0 ? " active" : ""}`;
      dot.setAttribute("aria-label", `第 ${i + 1} 张`);
      dot.addEventListener("click", () => {
        clearInterval(lunboTimer);
        goLunbo(i);
        startLunboAuto();
      });
      dotsEl.appendChild(dot);
    });

    // 绑定箭头
    prevBtn.addEventListener("click", () => {
      clearInterval(lunboTimer);
      goLunbo((lunboIndex - 1 + lunboPhotos.length) % lunboPhotos.length);
      startLunboAuto();
    });
    nextBtn.addEventListener("click", () => {
      clearInterval(lunboTimer);
      goLunbo((lunboIndex + 1) % lunboPhotos.length);
      startLunboAuto();
    });

    startLunboAuto();
  } else {
    // 只有一张时隐藏交互元素
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
    dotsEl.style.display  = "none";
  }
}

function startLunboAuto() {
  if (lunboPhotos.length <= 1) return;
  lunboTimer = setInterval(() => {
    goLunbo((lunboIndex + 1) % lunboPhotos.length);
  }, 5000);
}

function goLunbo(newIndex) {
  const slides = document.querySelectorAll(".lunbo-slide");
  const dots   = document.querySelectorAll(".lunbo-dot");
  if (slides.length === 0 || newIndex === lunboIndex) return;

  slides[lunboIndex].classList.remove("active");
  if (dots[lunboIndex]) dots[lunboIndex].classList.remove("active");

  lunboIndex = newIndex;

  slides[lunboIndex].classList.add("active");
  if (dots[lunboIndex]) dots[lunboIndex].classList.add("active");
}
