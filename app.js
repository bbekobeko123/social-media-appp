const BUNDLED_CSV_PATH = "./flashcards.csv";
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const APP_VERSION = "22";

const STORAGE_KEYS = {
  theme: "pf_theme",
  csvText: "pf_csv_text",
  csvName: "pf_csv_name",
  csvFiles: "pf_csv_files",
  userPosts: "pf_user_posts",
  likedIds: "pf_liked_ids",
  bookmarkedIds: "pf_bookmarked_ids",
  savedFeeds: "pf_saved_feeds",
};

const el = {
  feed: document.getElementById("feed"),
  status: document.getElementById("status"),
  search: document.getElementById("search"),

  clearBookmarks: document.getElementById("clearBookmarks"),
  clearFeed: document.getElementById("clearFeed"),
  shuffleFeed: document.getElementById("shuffleFeed"),
  manageFeed: document.getElementById("manageFeed"),
  undoUpload: document.getElementById("undoUpload"),
  downloadFeed: document.getElementById("downloadFeed"),
  pageTitle: document.getElementById("pageTitle"),
  composer: document.getElementById("composer"),
  composerText: document.getElementById("composerText"),
  charLeft: document.getElementById("charLeft"),
  postBtn: document.getElementById("postBtn"),
  newFeed: document.getElementById("newFeed"),
  themeToggle: document.getElementById("themeToggle"),
  navItems: Array.from(document.querySelectorAll(".nav-item[data-view]")),
  csvInput: document.getElementById("csvInput"),
  uploadCsvBtn: document.getElementById("uploadCsvBtn"),
  mobileUploadBtn: document.getElementById("mobileUploadBtn"),

  moreDropdown: document.getElementById("moreDropdown"),
  moreBtn: document.getElementById("moreBtn"),
  moreMenu: document.getElementById("moreMenu"),
  dropOverlay: document.getElementById("dropOverlay"),
  profileModal: document.getElementById("profileModal"),
  profileModalThemeToggle: document.getElementById("profileModalThemeToggle"),
  closeProfileModal: document.getElementById("closeProfileModal"),
  csvChoiceModal: document.getElementById("csvChoiceModal"),
  csvChoiceMessage: document.getElementById("csvChoiceMessage"),
  csvChoiceMeta: document.getElementById("csvChoiceMeta"),
  csvChoiceReplace: document.getElementById("csvChoiceReplace"),
  csvChoiceAppend: document.getElementById("csvChoiceAppend"),
  csvChoiceCancel: document.getElementById("csvChoiceCancel"),
  closeCsvChoiceModal: document.getElementById("closeCsvChoiceModal"),
  feedManagerModal: document.getElementById("feedManagerModal"),
  feedFileList: document.getElementById("feedFileList"),
  closeFeedManager: document.getElementById("closeFeedManager"),
  clearFeedModal: document.getElementById("clearFeedModal"),
  clearFeedCancel: document.getElementById("clearFeedCancel"),
  clearFeedConfirm: document.getElementById("clearFeedConfirm"),
  closeClearFeedModal: document.getElementById("closeClearFeedModal"),
  resetDataModal: document.getElementById("resetDataModal"),
  resetDataCancel: document.getElementById("resetDataCancel"),
  resetDataConfirm: document.getElementById("resetDataConfirm"),
  closeResetDataModal: document.getElementById("closeResetDataModal"),
};

const USER_AUTHOR = { name: "You", handle: "you", avatar: "YO", accent: "#22c55e" };

const AUTHORS = [
  { name: "Pulse Feed", handle: "pulse", avatar: "PF", accent: "#1d9bf0" },
  { name: "Skyline", handle: "skyline", avatar: "SK", accent: "#8b5cf6" },
  { name: "DataMuse", handle: "datamuse", avatar: "DM", accent: "#10b981" },
  { name: "Coffee Log", handle: "coffeelog", avatar: "CL", accent: "#f59e0b" },
  { name: "Weekend Dev", handle: "wknddev", avatar: "WD", accent: "#ef4444" },
];

const state = {
  view: "home",
  source: { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] },
  csvPosts: [],
  userPosts: [],
  query: "",
  explore: { selectedTag: null, selectedAuthor: null, sort: "trending" },
  likedIds: new Set(),
  bookmarkedIds: new Set(),
  expandedReplies: new Set(),
  justAddedPostId: null,
  shuffleOrder: null,
  lastUploadSnapshot: null,
  savedFeeds: [],
  selectedFeedIds: new Set(),

  activeFeedId: null,
  previewReturn: null,
  previewedFeedMeta: null,
  stashedWorkspace: null,
  storage: { persisted: null, usage: null, quota: null },
};

const VIEW_CONFIG = {
  home: { title: "Home", showComposer: true, showClearBookmarks: false, showSearch: true },
  explore: { title: "Explore", showComposer: false, showClearBookmarks: false, showSearch: true },
  bookmarks: { title: "Bookmarks", showComposer: false, showClearBookmarks: true, showSearch: true },
  profile: { title: "Profile", showComposer: false, showClearBookmarks: false, showSearch: false },
};

function setStatus(message) {
  el.status.textContent = message ?? "";
}

const animationTimeouts = new WeakMap();

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function isMobileWidth() {
  return window.matchMedia?.("(max-width: 680px)")?.matches;
}

function cssTimeToMs(value) {
  const token = String(value ?? "").split(",")[0]?.trim();
  if (!token) return 0;
  if (token.endsWith("ms")) return Number(token.slice(0, -2)) || 0;
  if (token.endsWith("s")) return (Number(token.slice(0, -1)) || 0) * 1000;
  const numeric = Number(token);
  return Number.isFinite(numeric) ? numeric : 0;
}

function spawnRipple(element, { clientX, clientY } = {}) {
  if (!(element instanceof HTMLElement)) return;
  if (prefersReducedMotion()) return;

  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;

  const x = typeof clientX === "number" ? clientX - rect.left : rect.width / 2;
  const y = typeof clientY === "number" ? clientY - rect.top : rect.height / 2;

  for (const existing of element.querySelectorAll(".ripple")) existing.remove();

  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  element.append(ripple);

  const cleanup = () => ripple.remove();
  ripple.addEventListener("animationend", cleanup, { once: true });

  const styles = window.getComputedStyle(ripple);
  const durationMs = cssTimeToMs(styles.animationDuration) + cssTimeToMs(styles.animationDelay);
  window.setTimeout(cleanup, Math.max(250, durationMs + 50));
}

function retriggerAnimation(element, className) {
  if (!(element instanceof HTMLElement)) return;

  const existing = animationTimeouts.get(element);
  if (existing) {
    window.clearTimeout(existing.timeoutId);
    element.classList.remove(existing.className);
    animationTimeouts.delete(element);
  }

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);

  const styles = window.getComputedStyle(element);
  const animationName = String(styles.animationName ?? "").split(",")[0]?.trim();
  const durationMs = cssTimeToMs(styles.animationDuration);
  const delayMs = cssTimeToMs(styles.animationDelay);

  if (!animationName || animationName === "none" || durationMs <= 0) {
    element.classList.remove(className);
    return;
  }

  const cleanup = () => {
    element.classList.remove(className);
    const current = animationTimeouts.get(element);
    if (current?.className === className) animationTimeouts.delete(element);
  };

  element.addEventListener("animationend", cleanup, { once: true });
  const timeoutId = window.setTimeout(cleanup, durationMs + delayMs + 50);
  animationTimeouts.set(element, { className, timeoutId });
}

const replyTransitionState = new WeakMap();

function setReplyExpanded(replyEl, expanded) {
  if (!(replyEl instanceof HTMLElement)) return;

  const previous = replyTransitionState.get(replyEl);
  if (previous) {
    if (previous.timeoutId) window.clearTimeout(previous.timeoutId);
    if (previous.onTransitionEnd) replyEl.removeEventListener("transitionend", previous.onTransitionEnd);
  }

  const token = (previous?.token ?? 0) + 1;

  if (expanded) {
    replyEl.hidden = false;
    replyEl.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      const current = replyTransitionState.get(replyEl);
      if (!current || current.token !== token) return;
      replyEl.classList.add("is-open");
    });

    replyTransitionState.set(replyEl, { token, timeoutId: 0, onTransitionEnd: null });
    return;
  }

  replyEl.setAttribute("aria-hidden", "true");
  replyEl.classList.remove("is-open");
  if (replyEl.hidden) return;

  const finish = () => {
    const current = replyTransitionState.get(replyEl);
    if (!current || current.token !== token) return;
    if (!replyEl.classList.contains("is-open")) replyEl.hidden = true;
    replyTransitionState.delete(replyEl);
  };

  const onTransitionEnd = (event) => {
    if (event.target !== replyEl) return;
    if (event.propertyName !== "max-height") return;
    replyEl.removeEventListener("transitionend", onTransitionEnd);
    finish();
  };

  replyEl.addEventListener("transitionend", onTransitionEnd);

  const styles = window.getComputedStyle(replyEl);
  const totalMs = cssTimeToMs(styles.transitionDuration) + cssTimeToMs(styles.transitionDelay);
  const timeoutId = window.setTimeout(() => {
    replyEl.removeEventListener("transitionend", onTransitionEnd);
    finish();
  }, Math.max(250, totalMs + 50));

  replyTransitionState.set(replyEl, { token, timeoutId, onTransitionEnd });
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function readJson(key, fallback) {
  try {
    const raw = safeGetItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    safeSetItem(key, JSON.stringify(value));
  } catch {
  }
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
  }
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let scaled = value;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex++;
  }
  const decimals = unitIndex === 0 ? 0 : scaled < 10 ? 1 : 0;
  return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
}

function getCsvByteSize(file, text) {
  if (file && typeof file.size === "number" && file.size >= 0) return file.size;
  try {
    return new Blob([text ?? ""]).size;
  } catch {
    return typeof text === "string" ? text.length : null;
  }
}

function formatCsvSummary(analysis, byteSize) {
  const parts = [];
  if (analysis) {
    parts.push(
      `Detected ${analysis.postCount} post${analysis.postCount === 1 ? "" : "s"} from ${analysis.rowCount} row${analysis.rowCount === 1 ? "" : "s"} (${analysis.delimiter} delimiter)`,
    );
    if (analysis.malformedRows > 0) {
      parts.push(`ignored ${analysis.malformedRows} malformed row${analysis.malformedRows === 1 ? "" : "s"}`);
    }
  }
  const sizeLabel = formatBytes(byteSize);
  if (sizeLabel) parts.push(`size ${sizeLabel}`);
  return parts.join("; ");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildLocalBackup() {
  return {
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    userPosts: state.userPosts.map((p) => ({ idSeed: `user|${p.createdAt}|${p.text}`, createdAt: p.createdAt, text: p.text })),
    likes: Array.from(state.likedIds),
    bookmarks: Array.from(state.bookmarkedIds),
    csv: { source: state.source, files: readStoredCsvFiles() },
  };
}

function exportLocalData() {
  const json = JSON.stringify(buildLocalBackup(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, `pulse-feed-backup-v${APP_VERSION}.json`);
  setStatus("Downloaded local backup.");
}

function normalizeBackupPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.version !== "string") return null;

  const likesRaw = Array.isArray(raw.likes) ? raw.likes : Array.isArray(raw.likedIds) ? raw.likedIds : [];
  const bookmarksRaw = Array.isArray(raw.bookmarks) ? raw.bookmarks : Array.isArray(raw.bookmarkedIds) ? raw.bookmarkedIds : [];

  const csvRaw = raw.csv && typeof raw.csv === "object" ? raw.csv : null;
  const csvFilesRaw = Array.isArray(csvRaw?.files) ? csvRaw.files : Array.isArray(raw.csvFiles) ? raw.csvFiles : [];

  const userPostsRaw = Array.isArray(raw.userPosts) ? raw.userPosts : [];

  return {
    version: raw.version,
    likes: likesRaw.filter((id) => typeof id === "string"),
    bookmarks: bookmarksRaw.filter((id) => typeof id === "string"),
    csvFiles: csvFilesRaw
      .map((file) => {
        if (!file || typeof file !== "object") return null;
        const name = typeof file.name === "string" ? file.name : null;
        const text = typeof file.text === "string" ? file.text : null;
        if (!name || !text) return null;
        return { name, text };
      })
      .filter(Boolean),
    userPosts: userPostsRaw
      .map((post) => {
        if (typeof post === "string") {
          const text = post.trim();
          if (!text) return null;
          const createdAt = Date.now();
          return { idSeed: `user|${createdAt}|${text}`, createdAt, text };
        }
        if (!post || typeof post !== "object") return null;
        const text = typeof post.text === "string" ? post.text.trim() : "";
        if (!text) return null;
        const createdAt = Number(post.createdAt);
        const safeCreatedAt = Number.isFinite(createdAt) ? createdAt : Date.now();
        const idSeed =
          typeof post.idSeed === "string" ? post.idSeed : `user|${safeCreatedAt}|${typeof post.text === "string" ? post.text : text}`;
        return { idSeed, createdAt: safeCreatedAt, text };
      })
      .filter(Boolean),
  };
}

function buildUserPostsFromBackup(posts) {
  console.log(`[buildUserPostsFromBackup] Restoring ${posts.length} posts`);
  return posts
    .map((p) => {
      console.log(`[buildUserPostsFromBackup] Restoring post: ${p.text}`);
      return createPost({
        idSeed: p.idSeed || `user|${p.createdAt}|${p.text}`,
        author: USER_AUTHOR,
        createdAt: p.createdAt,
        text: p.text,
        replyText: "",
      });
    })
    .filter(Boolean);
}

async function importLocalDataFile(file) {
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    setStatus("Couldn't read that backup file.");
    return;
  }

  const normalized = normalizeBackupPayload(parsed);
  if (!normalized) {
    setStatus("Backup file format not recognized.");
    return;
  }

  safeRemoveItem(STORAGE_KEYS.userPosts);
  safeRemoveItem(STORAGE_KEYS.likedIds);
  safeRemoveItem(STORAGE_KEYS.bookmarkedIds);
  safeRemoveItem(STORAGE_KEYS.csvFiles);
  safeRemoveItem(STORAGE_KEYS.csvText);
  safeRemoveItem(STORAGE_KEYS.csvName);

  state.userPosts = buildUserPostsFromBackup(normalized.userPosts);
  state.likedIds = new Set(normalized.likes);
  state.bookmarkedIds = new Set(normalized.bookmarks);
  state.expandedReplies.clear();

  persistUserPosts();
  persistLikedIds();
  persistBookmarkedIds();

  if (normalized.csvFiles.length > 0) {
    persistCsvFiles(normalized.csvFiles);
    state.source = {
      kind: "uploaded",
      name: normalized.csvFiles[0].name,
      files: normalized.csvFiles.map((f) => f.name),
    };
    state.csvPosts = buildPostsFromFiles(normalized.csvFiles);
  } else {
    state.source = { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] };
    const csvText = await loadBundledCsvText();
    state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");
  }

  state.shuffleOrder = null;
  state.lastUploadSnapshot = null;
  pendingCsvFile = null;
  state.query = "";
  el.search.value = "";
  updateViewUi();
  render();

  const versionNote = normalized.version && normalized.version !== APP_VERSION ? ` (from v${normalized.version})` : "";
  setStatus(`Imported local backup${versionNote}.`);
}

function promptImportLocalData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.className = "sr-only";
  document.body.append(input);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    await importLocalDataFile(file);
  });
  input.click();
}

async function initStorageInfo() {
  const storage = navigator.storage;
  if (!storage) return;

  if (typeof storage.persist === "function") {
    try {
      state.storage.persisted = await storage.persist();
    } catch {
      state.storage.persisted = null;
    }
  }

  if (typeof storage.estimate === "function") {
    try {
      const { usage, quota } = await storage.estimate();
      state.storage.usage = typeof usage === "number" ? usage : null;
      state.storage.quota = typeof quota === "number" ? quota : null;
    } catch {
      state.storage.usage = null;
      state.storage.quota = null;
    }
  }

  if (state.view === "profile") {
    const currentStatus = el.status?.textContent ?? "";
    renderProfile();
    setStatus(currentStatus);
  }
}

function readStoredCsvFiles() {
  const raw = safeGetItem(STORAGE_KEYS.csvFiles);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const name = typeof item.name === "string" ? item.name : null;
        const text = typeof item.text === "string" ? item.text : null;
        if (!name || !text) return null;
        return { name, text };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function persistCsvFiles(files) {
  writeJson(STORAGE_KEYS.csvFiles, files);
  const first = files[0];
  if (first) {
    safeSetItem(STORAGE_KEYS.csvText, first.text);
    safeSetItem(STORAGE_KEYS.csvName, first.name);
  }
}

function buildPostsFromFiles(files) {
  const posts = [];
  const baseTime = Date.now();
  let globalIndex = 0;
  for (const file of files) {
    const delimiter = detectDelimiter(file.text);
    const rows = parseCsv(file.text, delimiter);
    for (let i = 0; i < rows.length; i++) {
      const post = createPostFromRow(rows[i], i, file.name);
      if (!post) continue;
      post.createdAt = baseTime - globalIndex * 1000 * 60 * 37;
      posts.push(post);
      globalIndex++;
    }
  }
  return posts;
}

function analyzeCsv(text, fileName) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  const posts = rows.map((row, i) => createPostFromRow(row, i, fileName)).filter(Boolean);
  const malformedRows = rows.length - posts.length;
  return {
    delimiter,
    rowCount: rows.length,
    postCount: posts.length,
    malformedRows,
  };
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function detectDelimiter(text) {
  const sample = String(text ?? "").slice(0, 4096);
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    for (let i = 0; i < sample.length; i++) if (sample[i] === candidate) count++;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function parseCsv(text, delimiter = ",") {
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        const next = input[i + 1];
        if (next === '"') {
          field += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      const hasData = row.some((cell) => String(cell ?? "").trim().length > 0);
      if (hasData) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  const hasData = row.some((cell) => String(cell ?? "").trim().length > 0);
  if (hasData) rows.push(row);

  return rows;
}

function fnv1a(input) {
  let hash = 0x811c9dc5;
  const str = String(input ?? "");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function formatRelativeTime(createdAtMs, nowMs = Date.now()) {
  const diffSeconds = Math.max(0, Math.round((nowMs - createdAtMs) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(createdAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pickAuthor(index) {
  return AUTHORS[index % AUTHORS.length];
}

function createPost({ idSeed, author, createdAt, text, replyText }) {
  const id = `p_${fnv1a(idSeed)}`;
  return {
    id,
    author,
    createdAt,
    text: String(text ?? "").trim(),
    replyText: String(replyText ?? "").trim(),
  };
}

function createPostFromRow(row, index, sourceName) {
  const postText = String(row?.[0] ?? "").trim();
  const replyText = String(row?.[1] ?? "").trim();
  if (!postText) return null;

  const createdAt = Date.now() - index * 1000 * 60 * 37;
  const author = pickAuthor(index);
  return createPost({
    idSeed: `${sourceName}|${index}|${postText}|${replyText}`,
    author,
    createdAt,
    text: postText,
    replyText: replyText || "",
  });
}

function createUserPost(text) {
  const createdAt = Date.now();
  return createPost({
    idSeed: `user|${createdAt}|${text}`,
    author: USER_AUTHOR,
    createdAt,
    text,
    replyText: "",
  });
}

function loadUserPosts() {
  const raw = readJson(STORAGE_KEYS.userPosts, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      if (typeof p.text !== "string" || !p.text.trim()) return null;
      const createdAt = Number(p.createdAt);
      return createPost({
        idSeed: String(p.idSeed ?? `user|${createdAt}|${p.text}`),
        author: USER_AUTHOR,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        text: p.text,
        replyText: "",
      });
    })
    .filter(Boolean);
}

function persistUserPosts() {
  writeJson(
    STORAGE_KEYS.userPosts,
    state.userPosts.map((p) => ({ idSeed: `user|${p.createdAt}|${p.text}`, createdAt: p.createdAt, text: p.text })),
  );
}

function loadLikedIds() {
  const raw = readJson(STORAGE_KEYS.likedIds, []);
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id) => typeof id === "string"));
}

function persistLikedIds() {
  writeJson(STORAGE_KEYS.likedIds, Array.from(state.likedIds));
}

function loadBookmarkedIds() {
  const raw = readJson(STORAGE_KEYS.bookmarkedIds, []);
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id) => typeof id === "string"));
}

function persistBookmarkedIds() {
  writeJson(STORAGE_KEYS.bookmarkedIds, Array.from(state.bookmarkedIds));
}

function normalizeSavedFeed(raw) {
  if (!raw || typeof raw !== "object") return null;

  let changed = false;
  let id = typeof raw.id === "string" ? raw.id : "";
  if (!id) {
    id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    changed = true;
  }

  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name : "Untitled Feed";
  if (name !== raw.name) changed = true;

  let createdAt = Number(raw.createdAt);
  if (!Number.isFinite(createdAt)) {
    createdAt = Date.now();
    changed = true;
  }

  let csvFilesRaw = Array.isArray(raw.csvFiles) ? raw.csvFiles : Array.isArray(raw.csv?.files) ? raw.csv.files : [];
  if (csvFilesRaw.length === 0 && typeof raw.csvText === "string") {
    const fallbackName = typeof raw.csvName === "string" && raw.csvName.trim() ? raw.csvName : "uploaded.csv";
    csvFilesRaw = [{ name: fallbackName, text: raw.csvText }];
    changed = true;
  }
  const csvFiles = csvFilesRaw
    .map((file) => {
      if (!file || typeof file !== "object") return null;
      const fileName = typeof file.name === "string" ? file.name : "";
      const text = typeof file.text === "string" ? file.text : null;
      if (!fileName || text === null) return null;
      return { name: fileName, text };
    })
    .filter(Boolean);

  if (csvFiles.length !== csvFilesRaw.length) changed = true;

  const userPosts = Array.isArray(raw.userPosts) ? raw.userPosts.filter((post) => post && typeof post === "object") : [];
  const likedIds = Array.isArray(raw.likedIds) ? raw.likedIds.filter((id) => typeof id === "string") : [];
  const bookmarkedIds = Array.isArray(raw.bookmarkedIds)
    ? raw.bookmarkedIds.filter((id) => typeof id === "string")
    : [];
  const csvPosts = Array.isArray(raw.csvPosts) ? raw.csvPosts.filter(Boolean) : [];
  let csvPostCount = Number.isFinite(raw.csvPostCount) ? raw.csvPostCount : null;
  if (csvPostCount === null && csvPosts.length > 0) csvPostCount = csvPosts.length;

  const source = raw.source && typeof raw.source === "object"
    ? raw.source
    : raw.csv && typeof raw.csv === "object" && raw.csv.source && typeof raw.csv.source === "object"
      ? raw.csv.source
      : null;

  if (!source && raw.source) changed = true;

  return {
    feed: {
      id,
      name,
      createdAt,
      source,
      csvFiles,
      csvPosts,
      csvPostCount,
      userPosts,
      likedIds,
      bookmarkedIds,
    },
    changed,
  };
}

function loadSavedFeeds() {
  const raw = readJson(STORAGE_KEYS.savedFeeds, []);
  if (!Array.isArray(raw)) return [];
  let changed = false;
  const feeds = raw
    .map((item) => {
      const normalized = normalizeSavedFeed(item);
      if (!normalized) return null;
      if (normalized.changed) changed = true;
      return normalized.feed;
    })
    .filter(Boolean);
  if (changed) scheduleSavedFeedsPersist();
  return feeds;
}

function persistSavedFeeds() {
  writeJson(STORAGE_KEYS.savedFeeds, state.savedFeeds);
}

let savedFeedsPersistQueued = false;

function scheduleSavedFeedsPersist() {
  if (savedFeedsPersistQueued) return;
  savedFeedsPersistQueued = true;

  const persist = () => {
    savedFeedsPersistQueued = false;
    persistSavedFeeds();
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(persist, { timeout: 2000 });
  } else {
    window.setTimeout(persist, 0);
  }
}

function countCsvPostsInText(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  let count = 0;
  for (const row of rows) {
    const postText = String(row?.[0] ?? "").trim();
    if (postText) count += 1;
  }
  return count;
}

function getSavedFeedPostCount(feed) {
  if (!feed || typeof feed !== "object") return 0;
  const userCount = Array.isArray(feed.userPosts) ? feed.userPosts.length : 0;
  let csvPostCount = Number.isFinite(feed.csvPostCount) ? feed.csvPostCount : null;
  if (csvPostCount === null && Array.isArray(feed.csvPosts)) csvPostCount = feed.csvPosts.length;
  if (csvPostCount === null && Array.isArray(feed.csvFiles)) {
    csvPostCount = feed.csvFiles.reduce((total, file) => {
      if (!file || typeof file.text !== "string") return total;
      return total + countCsvPostsInText(file.text);
    }, 0);
    feed.csvPostCount = csvPostCount;
  }
  if (!Number.isFinite(csvPostCount)) csvPostCount = 0;
  return userCount + csvPostCount;
}

function captureCurrentFeedSnapshot(name = "Untitled Feed") {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return {
    id: `f_${timestamp}_${random}`,
    name,
    createdAt: timestamp,
    source: { ...state.source },
    csvFiles: readStoredCsvFiles(),
    csvPostCount: Array.isArray(state.csvPosts) ? state.csvPosts.length : 0,
    userPosts: state.userPosts.map((p) => ({ idSeed: p.idSeed || `user|${p.createdAt}|${p.text}`, createdAt: p.createdAt, text: p.text })),
    likedIds: Array.from(state.likedIds),
    // Note: bookmarkedIds are stored globally, not per-feed
  };
}


async function createNewFeed() {
  const name = prompt("Enter a name for this feed:", `Feed ${new Date().toLocaleDateString()}`);
  if (name === null) return; // Cancelled

  // 1. Archive current feed if it has any user data
  const hasData = state.userPosts.length > 0 || state.source.kind === "uploaded" || state.likedIds.size > 0 || state.bookmarkedIds.size > 0;
  if (hasData) {
    const snapshot = captureCurrentFeedSnapshot(name || "Untitled Feed");
    state.savedFeeds.unshift(snapshot);
    persistSavedFeeds();
  }

  // 2. Reset current state
  await clearFeedConfirmed();
  setStatus("New feed created.");
}

function savePreviewedFeed() {
  const meta = state.previewedFeedMeta;
  if (!meta) return;

  // Don't save combined/temporary views
  if (meta.id === "combined-view") return;

  const snapshot = captureCurrentFeedSnapshot(meta.name || "Untitled Feed");
  snapshot.id = meta.id;
  if (Number.isFinite(meta.createdAt)) snapshot.createdAt = meta.createdAt;

  // Update the feed in-place to preserve its position in the list
  const feedIndex = state.savedFeeds.findIndex((feed) => feed.id === meta.id);
  if (feedIndex !== -1) {
    state.savedFeeds[feedIndex] = snapshot;
  } else {
    // Feed not in list (shouldn't happen), add it
    state.savedFeeds.unshift(snapshot);
  }
  persistSavedFeeds();
}

async function loadFeed(feedId) {
  console.log(`[loadFeed] Start loading feed: ${feedId}`);

  // Don't reload if already viewing this feed
  if (state.activeFeedId === feedId) {
    console.log(`[loadFeed] Already viewing feed: ${feedId}`);
    setView("home");
    return;
  }

  const feed = state.savedFeeds.find((f) => f.id === feedId);
  if (!feed) {
    console.warn(`[loadFeed] Feed not found: ${feedId}`);
    return;
  }

  // 2. Handle Current Workspace
  if (state.stashedWorkspace) {
    // We're already viewing a saved feed, need to save it before switching
    if (state.previewedFeedMeta) {
      console.log("[loadFeed] Switching preview feeds. Saving current preview back to list.");
      savePreviewedFeed();
    }
    // If previewReturn exists but previewedFeedMeta doesn't, we may be in an inconsistent state
    // Just proceed to load the new feed
  } else {
    // We are in the Main Workspace. Stash it!
    console.log(`[loadFeed] Stashing current main workspace.`);
    state.stashedWorkspace = captureCurrentFeedSnapshot("Stashed Workspace");
  }

  // Always set the previewed feed metadata for the feed we're about to load
  state.previewedFeedMeta = { id: feed.id, name: feed.name, createdAt: feed.createdAt };

  // 3. Apply New Feed Data
  state.activeFeedId = feed.id;
  persistSavedFeeds();

  console.log(`[loadFeed] Applying data for: ${feed.name}`);

  // Apply feed data
  state.userPosts = buildUserPostsFromBackup(feed.userPosts || []);
  state.likedIds = new Set(feed.likedIds || []);
  // Note: bookmarkedIds are global and not loaded from feed
  persistUserPosts();
  persistLikedIds();

  if (Array.isArray(feed.csvFiles) && feed.csvFiles.length > 0) {
    persistCsvFiles(feed.csvFiles);
    state.source = {
      kind: "uploaded",
      name: feed.csvFiles[0].name,
      files: feed.csvFiles.map((f) => f.name),
    };
    state.csvPosts = buildPostsFromFiles(feed.csvFiles);
  } else if (Array.isArray(feed.csvPosts) && feed.csvPosts.length > 0) {
    safeRemoveItem(STORAGE_KEYS.csvFiles);
    safeRemoveItem(STORAGE_KEYS.csvText);
    safeRemoveItem(STORAGE_KEYS.csvName);

    state.source = feed.source && typeof feed.source === "object"
      ? feed.source
      : { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] };
    state.csvPosts = feed.csvPosts;
  } else {
    // IMPORTANT: Clear CSV storage when loading a bundled feed to prevent pollution
    safeRemoveItem(STORAGE_KEYS.csvFiles);
    safeRemoveItem(STORAGE_KEYS.csvText);
    safeRemoveItem(STORAGE_KEYS.csvName);

    state.source = { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] };
    const csvText = await loadBundledCsvText();
    state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");
  }

  state.shuffleOrder = null;
  state.lastUploadSnapshot = null;
  state.query = "";
  el.search.value = "";
  setView("home");
  render();
  setStatus(`Viewing feed: ${feed.name}`);
}

async function returnToWorkspace() {
  if (!state.stashedWorkspace) return;

  console.log("[returnToWorkspace] Returning to workspace...");

  // 1. Save changes to current feed (the one we are leaving) using savePreviewedFeed
  if (state.previewedFeedMeta) {
    savePreviewedFeed();
  }

  // 2. Clear preview state
  state.previewedFeedMeta = null;
  state.previewReturn = null;
  state.activeFeedId = null;

  // 3. Restore Stashed Workspace
  const stash = state.stashedWorkspace;
  state.stashedWorkspace = null; // Clear stash

  console.log("[returnToWorkspace] Restoring stashed workspace");
  state.userPosts = buildUserPostsFromBackup(stash.userPosts || []);
  state.likedIds = new Set(stash.likedIds || []);
  // Note: bookmarkedIds are global and not restored from stash
  state.source = stash.source;

  persistUserPosts();
  persistLikedIds();

  if (stash.csvFiles && stash.csvFiles.length > 0) {
    persistCsvFiles(stash.csvFiles);
    state.csvPosts = buildPostsFromFiles(stash.csvFiles);
  } else {
    safeRemoveItem(STORAGE_KEYS.csvFiles);
    safeRemoveItem(STORAGE_KEYS.csvText);
    safeRemoveItem(STORAGE_KEYS.csvName);
    const csvText = await loadBundledCsvText();
    state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");
  }

  state.query = "";
  el.search.value = "";
  setView("home");
  render();
  setStatus("Returned to main workspace.");
}

async function returnFromPreview() {
  if (!state.previewReturn) return;

  console.log("[returnFromPreview] Returning to current feed...");

  savePreviewedFeed();

  const { snapshot, activeFeedId } = state.previewReturn;
  state.previewReturn = null;
  state.previewedFeedMeta = null;
  state.activeFeedId = activeFeedId ?? null;

  state.userPosts = buildUserPostsFromBackup(snapshot.userPosts || []);
  state.likedIds = new Set(snapshot.likedIds || []);
  // Note: bookmarkedIds are global and not restored from snapshot
  state.source = snapshot.source;

  persistUserPosts();
  persistLikedIds();

  if (snapshot.csvFiles && snapshot.csvFiles.length > 0) {
    persistCsvFiles(snapshot.csvFiles);
    state.csvPosts = buildPostsFromFiles(snapshot.csvFiles);
  } else {
    safeRemoveItem(STORAGE_KEYS.csvFiles);
    safeRemoveItem(STORAGE_KEYS.csvText);
    safeRemoveItem(STORAGE_KEYS.csvName);
    const csvText = await loadBundledCsvText();
    state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");
  }

  state.query = "";
  el.search.value = "";
  setView("home");
  render();
  setStatus("Returned to current feed.");
}

async function deleteFeed(feedId) {
  if (!confirm("Are you sure you want to delete this feed permanently?")) return;
  state.savedFeeds = state.savedFeeds.filter((f) => f.id !== feedId);
  persistSavedFeeds();
  renderExplore();
  setStatus("Feed deleted.");
}

let themeTransitionToken = 0;

function beginThemeTransition() {
  themeTransitionToken += 1;
  document.documentElement.dataset.themeTransitioning = "true";
  return themeTransitionToken;
}

function endThemeTransition(token) {
  if (token !== themeTransitionToken) return;
  delete document.documentElement.dataset.themeTransitioning;
}

function scheduleThemeTransitionCleanup(token) {
  requestAnimationFrame(() => requestAnimationFrame(() => endThemeTransition(token)));
  window.setTimeout(() => endThemeTransition(token), 2000);
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0f1419" : "#ffffff");
}

function getInitialTheme() {
  const stored = safeGetItem(STORAGE_KEYS.theme);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function updateThemeToggle() {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const isDark = current === "dark";
  if (el.themeToggle) el.themeToggle.textContent = isDark ? "Light mode" : "Dark mode";

  const profileSwitch = document.getElementById("profileThemeSwitch");
  if (profileSwitch instanceof HTMLElement) profileSwitch.setAttribute("aria-checked", String(isDark));

  if (el.profileModalThemeToggle) {
    el.profileModalThemeToggle.textContent = isDark ? "Switch to light mode" : "Switch to dark mode";
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  safeSetItem(STORAGE_KEYS.theme, next);

  const token = beginThemeTransition();
  const apply = () => {
    applyTheme(next);
    updateThemeToggle();
  };

  if (!prefersReducedMotion() && typeof document.startViewTransition === "function") {
    try {
      const transition = document.startViewTransition(() => apply());
      transition.finished.finally(() => endThemeTransition(token));
      window.setTimeout(() => endThemeTransition(token), 2000);
      return;
    } catch (error) {
      // Fallback: apply theme without view transitions.
    }
  }

  apply();
  scheduleThemeTransitionCleanup(token);
}

function mergePosts() {
  return [...state.userPosts, ...state.csvPosts];
}

// Gathers posts from ALL sources for the Bookmarks view
// This ensures bookmarked posts from any feed are visible
function getAllPostsForBookmarks() {
  const allPosts = new Map(); // Use Map to dedupe by post ID

  // Add current feed posts
  for (const post of mergePosts()) {
    if (post?.id) allPosts.set(post.id, post);
  }

  // Add posts from stashed workspace (if any)
  if (state.stashedWorkspace) {
    const stashUserPosts = buildUserPostsFromBackup(state.stashedWorkspace.userPosts || []);
    for (const post of stashUserPosts) {
      if (post?.id && !allPosts.has(post.id)) allPosts.set(post.id, post);
    }
    if (state.stashedWorkspace.csvFiles?.length > 0) {
      const stashCsvPosts = buildPostsFromFiles(state.stashedWorkspace.csvFiles);
      for (const post of stashCsvPosts) {
        if (post?.id && !allPosts.has(post.id)) allPosts.set(post.id, post);
      }
    }
  }

  // Add posts from all saved feeds
  for (const feed of state.savedFeeds) {
    if (!feed) continue;

    // User posts from saved feed
    const feedUserPosts = buildUserPostsFromBackup(feed.userPosts || []);
    for (const post of feedUserPosts) {
      if (post?.id && !allPosts.has(post.id)) allPosts.set(post.id, post);
    }

    // CSV posts from saved feed
    if (feed.csvFiles?.length > 0) {
      const feedCsvPosts = buildPostsFromFiles(feed.csvFiles);
      for (const post of feedCsvPosts) {
        if (post?.id && !allPosts.has(post.id)) allPosts.set(post.id, post);
      }
    } else if (feed.csvPosts?.length > 0) {
      for (const post of feed.csvPosts) {
        if (post?.id && !allPosts.has(post.id)) allPosts.set(post.id, post);
      }
    }
  }

  return Array.from(allPosts.values());
}

function getPostsInOrder() {
  const posts = mergePosts();
  if (!Array.isArray(state.shuffleOrder) || state.shuffleOrder.length === 0) return posts;
  const orderMap = new Map();
  state.shuffleOrder.forEach((id, index) => orderMap.set(id, index));
  return [...posts].sort((a, b) => {
    const ai = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

function captureUploadSnapshot() {
  state.lastUploadSnapshot = {
    files: readStoredCsvFiles(),
    source: { ...state.source },
    csvPosts: [...state.csvPosts],
  };
}

function getLikeCount(postId) {
  return state.likedIds.has(postId) ? 1 : 0;
}

function extractTagsFromText(text) {
  const normalized = [];
  const input = String(text ?? "");
  const regex = /#([a-z0-9_]{2,50})/gi;
  let match = regex.exec(input);
  while (match) {
    normalized.push(match[1].toLowerCase());
    match = regex.exec(input);
  }
  return normalized;
}

function computeTrendingTags(posts) {
  const counts = new Map();
  for (const post of posts) {
    if (!post) continue;
    const tags = extractTagsFromText(`${post.text ?? ""}\n${post.replyText ?? ""}`);
    const unique = new Set(tags);
    for (const tag of unique) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

function computeTopAuthors(posts) {
  const counts = new Map();
  for (const post of posts) {
    const handle = post?.author?.handle;
    if (!handle) continue;
    const current = counts.get(handle) ?? { count: 0, author: post.author };
    current.count += 1;
    current.author = post.author || current.author;
    counts.set(handle, current);
  }
  return Array.from(counts.entries()).map(([handle, value]) => ({ handle, count: value.count, author: value.author }));
}

function createPostElement(post) {
  const liked = state.likedIds.has(post.id);
  const bookmarked = state.bookmarkedIds.has(post.id);
  const likeCount = getLikeCount(post.id);
  const replyCount = post.replyText ? 1 : 0;
  const replyExpanded = state.expandedReplies.has(post.id);

  const article = document.createElement("article");
  article.className = "post";
  article.id = post.id;
  article.dataset.postId = post.id;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = post.author.avatar;
  avatar.style.background = `color-mix(in srgb, ${post.author.accent} 18%, var(--bg2))`;
  avatar.style.borderColor = `color-mix(in srgb, ${post.author.accent} 26%, var(--border))`;
  avatar.style.color = "var(--text)";

  const content = document.createElement("div");

  const header = document.createElement("div");
  header.className = "post-header";

  const meta = document.createElement("div");
  meta.className = "post-meta";

  const name = document.createElement("div");
  name.className = "post-name";
  name.textContent = post.author.name;

  const handle = document.createElement("div");
  handle.className = "post-handle";
  handle.textContent = `@${post.author.handle}`;

  const timeGroup = document.createElement("div");
  timeGroup.className = "post-time-group";

  const time = document.createElement("div");
  time.className = "post-time";
  time.textContent = formatRelativeTime(post.createdAt);
  time.title = new Date(post.createdAt).toLocaleString();

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "post-share";
  shareBtn.dataset.action = "share";
  shareBtn.dataset.postId = post.id;
  shareBtn.title = "Copy link";
  shareBtn.setAttribute("aria-label", "Copy link");
  shareBtn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 4.5a2.5 2.5 0 1 1 1 2l-5.05 3.03a2.55 2.55 0 0 1 0 0.94l5.05 3.03a2.5 2.5 0 1 1-.46.89l-5.05-3.03a2.5 2.5 0 1 1 0-1.83l5.05-3.03a2.5 2.5 0 0 1-.54-1z" />
    </svg>
  `;

  timeGroup.append(time, shareBtn);

  meta.append(name, handle);
  header.append(meta, timeGroup);

  const text = document.createElement("div");
  text.className = "post-text";
  text.textContent = post.text;

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const likeBtn = document.createElement("button");
  likeBtn.type = "button";
  likeBtn.className = "action";
  likeBtn.dataset.action = "like";
  likeBtn.dataset.postId = post.id;
  likeBtn.classList.toggle("is-liked", liked);
  likeBtn.setAttribute("aria-pressed", String(liked));
  likeBtn.setAttribute("aria-label", liked ? "Unlike" : "Like");
  likeBtn.innerHTML = `
    <span class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    </span>
    <span class="label">Like</span>
    <span class="count">${likeCount}</span>
  `;

  const replyBtn = document.createElement("button");
  replyBtn.type = "button";
  replyBtn.className = "action";
  replyBtn.dataset.action = "toggle-reply";
  replyBtn.dataset.postId = post.id;
  replyBtn.disabled = replyCount === 0;
  replyBtn.setAttribute("aria-expanded", String(replyExpanded));
  replyBtn.setAttribute("aria-label", replyCount === 0 ? "No replies" : replyExpanded ? "Hide reply" : "View reply");
  replyBtn.innerHTML = `
    <span class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
      </svg>
    </span>
    <span class="label">Reply</span>
    <span class="count">${replyCount}</span>
  `;

  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.type = "button";
  bookmarkBtn.className = "action";
  bookmarkBtn.dataset.action = "bookmark";
  bookmarkBtn.dataset.postId = post.id;
  bookmarkBtn.classList.toggle("is-bookmarked", bookmarked);
  bookmarkBtn.setAttribute("aria-pressed", String(bookmarked));
  bookmarkBtn.setAttribute("aria-label", bookmarked ? "Remove bookmark" : "Bookmark");
  bookmarkBtn.innerHTML = `
    <span class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-3-6 3V4z" />
      </svg>
    </span>
    <span class="label">${bookmarked ? "Bookmarked" : "Bookmark"}</span>
  `;
  actions.append(likeBtn, replyBtn, bookmarkBtn);

  const reply = document.createElement("div");
  reply.className = "reply";
  const replyId = `${post.id}__reply`;
  reply.id = replyId;
  replyBtn.setAttribute("aria-controls", replyId);
  reply.hidden = !replyExpanded;
  reply.classList.toggle("is-open", replyExpanded);
  reply.setAttribute("aria-hidden", String(!replyExpanded));
  if (post.replyText) {
    const title = document.createElement("div");
    title.className = "reply-title";
    title.textContent = "Reply";
    const body = document.createElement("div");
    body.className = "post-text";
    body.textContent = post.replyText;
    reply.append(title, body);
  }

  content.append(header, text, actions, reply);
  article.append(avatar, content);
  return article;
}

function updateViewUi() {
  const config = VIEW_CONFIG[state.view] ?? VIEW_CONFIG.home;

  if (el.pageTitle) el.pageTitle.textContent = config.title;
  if (el.composer) el.composer.hidden = !config.showComposer;
  if (el.clearBookmarks) el.clearBookmarks.hidden = !config.showClearBookmarks;
  const showSearch = config.showSearch !== false;
  if (el.search) el.search.placeholder = state.view === "explore" ? "Search tags, authors, posts" : "Search posts";

  const searchWrap = el.search?.closest?.(".search");
  if (searchWrap instanceof HTMLElement) searchWrap.hidden = !showSearch;
  if (el.clearSearch) el.clearSearch.hidden = !showSearch;

  const hideTopActions = state.view === "profile" || state.view === "bookmarks" || state.view === "explore";
  if (el.moreDropdown) el.moreDropdown.hidden = hideTopActions;
  if (el.undoUpload) el.undoUpload.hidden = hideTopActions || !state.lastUploadSnapshot;
  if (el.uploadCsvBtn) el.uploadCsvBtn.hidden = hideTopActions;
  if (el.mobileUploadBtn) el.mobileUploadBtn.hidden = hideTopActions;

  for (const item of el.navItems) {
    const isActive = item.dataset.view === state.view;
    item.classList.toggle("is-active", isActive);
  }

  // Handle back button visibility
  let backBtn = document.getElementById("backToWorkspaceBtn");
  const showPreviewBack = Boolean(state.previewReturn);
  const showWorkspaceBack = !showPreviewBack && Boolean(state.stashedWorkspace);
  if (showPreviewBack || showWorkspaceBack) {
    if (!backBtn) {
      backBtn = document.createElement("button");
      backBtn.id = "backToWorkspaceBtn";
      backBtn.className = "btn secondary full-width";
      backBtn.style.marginBottom = "1rem";
      backBtn.type = "button";
      // Insert before the composer
      if (el.composerText && el.composerText.closest(".composer")) {
        el.composerText.closest(".composer").before(backBtn);
      } else if (el.feed) {
        el.feed.prepend(backBtn);
      }
    }
    backBtn.textContent = showPreviewBack ? "Back to current feed" : "Back to main workspace";
    backBtn.onclick = showPreviewBack ? returnFromPreview : returnToWorkspace;
  } else if (backBtn) {
    backBtn.remove();
  }
}

function getSourceLabel() {
  const files = Array.isArray(state.source?.files) ? state.source.files : [];
  const fileCount = files.length || 1;
  if (state.source?.kind === "uploaded") {
    return fileCount > 1 ? `Uploaded CSVs (${fileCount} files)` : `Uploaded CSV (${state.source.name})`;
  }
  return `Bundled CSV (${state.source?.name ?? "flashcards.csv"})`;
}

function isProfileModalOpen() {
  return el.profileModal?.classList.contains("is-visible");
}

function openProfileModal() {
  if (!el.profileModal) return;
  el.profileModal.hidden = false;
  requestAnimationFrame(() => el.profileModal.classList.add("is-visible"));
  const toggle = el.profileModalThemeToggle;
  if (toggle instanceof HTMLElement) toggle.focus();
}

function closeProfileModal() {
  if (!el.profileModal) return;
  const modal = el.profileModal;
  modal.classList.remove("is-visible");

  const finish = () => {
    modal.hidden = true;
    modal.removeEventListener("transitionend", onTransitionEnd);
  };

  const onTransitionEnd = (event) => {
    if (event.target !== modal) return;
    if (event.propertyName !== "opacity") return;
    finish();
  };

  modal.addEventListener("transitionend", onTransitionEnd);
  window.setTimeout(finish, 250);
}

function isModalVisible(modal) {
  return modal?.classList.contains("is-visible");
}

function openFeedManager() {
  renderFeedManagerList();
  if (!el.feedManagerModal) return;
  el.feedManagerModal.hidden = false;
  requestAnimationFrame(() => el.feedManagerModal.classList.add("is-visible"));
}

function closeFeedManager() {
  if (!el.feedManagerModal) return;
  const modal = el.feedManagerModal;
  modal.classList.remove("is-visible");
  const finish = () => {
    modal.hidden = true;
    modal.removeEventListener("transitionend", onTransitionEnd);
  };
  const onTransitionEnd = (event) => {
    if (event.target !== modal) return;
    if (event.propertyName !== "opacity") return;
    finish();
  };
  modal.addEventListener("transitionend", onTransitionEnd);
  window.setTimeout(finish, 250);
}

function openClearFeedModal() {
  if (!el.clearFeedModal) return;
  el.clearFeedModal.hidden = false;
  requestAnimationFrame(() => el.clearFeedModal.classList.add("is-visible"));
  if (el.clearFeedCancel instanceof HTMLElement) el.clearFeedCancel.focus();
}

function closeClearFeedModal() {
  if (!el.clearFeedModal) return;
  const modal = el.clearFeedModal;
  modal.classList.remove("is-visible");

  const finish = () => {
    modal.hidden = true;
    modal.removeEventListener("transitionend", onTransitionEnd);
  };

  const onTransitionEnd = (event) => {
    if (event.target !== modal) return;
    if (event.propertyName !== "opacity") return;
    finish();
  };

  modal.addEventListener("transitionend", onTransitionEnd);
  window.setTimeout(finish, 250);
}

function openResetDataModal() {
  if (!el.resetDataModal) return;
  el.resetDataModal.hidden = false;
  requestAnimationFrame(() => el.resetDataModal.classList.add("is-visible"));
  if (el.resetDataCancel instanceof HTMLElement) el.resetDataCancel.focus();
}

function closeResetDataModal() {
  if (!el.resetDataModal) return;
  const modal = el.resetDataModal;
  modal.classList.remove("is-visible");

  const finish = () => {
    modal.hidden = true;
    modal.removeEventListener("transitionend", onTransitionEnd);
  };

  const onTransitionEnd = (event) => {
    if (event.target !== modal) return;
    if (event.propertyName !== "opacity") return;
    finish();
  };

  modal.addEventListener("transitionend", onTransitionEnd);
  window.setTimeout(finish, 250);
}

function renderFeedManagerList() {
  const list = el.feedFileList;
  if (!list) return;
  list.replaceChildren();
  const files = readStoredCsvFiles();
  if (files.length === 0) {
    const empty = document.createElement("div");
    empty.className = "status";
    empty.textContent = "No uploaded CSV files. Upload to add posts.";
    list.append(empty);
    return;
  }

  files.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "file-item";

    const meta = document.createElement("div");
    meta.className = "file-meta";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;

    const delimiter = detectDelimiter(file.text);
    const postCount = parseCsv(file.text, delimiter)
      .map((row, i) => createPostFromRow(row, i, file.name))
      .filter(Boolean).length;

    const count = document.createElement("div");
    count.className = "file-count";
    count.textContent = `${postCount} post${postCount === 1 ? "" : "s"}`;

    meta.append(name, count);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn ghost";
    removeBtn.dataset.index = String(index);
    removeBtn.textContent = "Remove";

    item.append(meta, removeBtn);
    list.append(item);
  });
}

async function removeCsvFileByIndex(index) {
  const files = readStoredCsvFiles();
  if (index < 0 || index >= files.length) return;
  files.splice(index, 1);

  if (files.length === 0) {
    safeRemoveItem(STORAGE_KEYS.csvFiles);
    safeRemoveItem(STORAGE_KEYS.csvText);
    safeRemoveItem(STORAGE_KEYS.csvName);
    state.source = { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] };
    const csvText = await loadBundledCsvText();
    state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");
    setStatus("Removed CSV. Reverted to bundled feed.");
  } else {
    persistCsvFiles(files);
    state.source = { kind: "uploaded", name: files[0].name, files: files.map((f) => f.name) };
    state.csvPosts = buildPostsFromFiles(files);
    setStatus("Removed CSV from feed.");
  }

  state.shuffleOrder = null;
  state.query = "";
  el.search.value = "";
  render();
  renderFeedManagerList();
}

function setView(view) {
  if (!VIEW_CONFIG[view]) return;
  state.view = view;
  state.shuffleOrder = null;
  updateViewUi();
  render();
}

function render() {
  if (state.view === "profile") {
    renderProfile();
    return;
  }

  if (state.view === "explore") {
    renderExplore();
    return;
  }

  // For bookmarks view, use ALL posts from all feeds
  // For other views, use only current feed posts
  const isBookmarksView = state.view === "bookmarks";
  const posts = isBookmarksView ? getAllPostsForBookmarks() : mergePosts();
  const inView = isBookmarksView
    ? posts.filter((p) => state.bookmarkedIds.has(p.id))
    : posts;

  // For bookmarks, sort by most recently bookmarked (we don't have timestamp, so use createdAt)
  // For other views, use shuffle order if available
  let orderedFiltered;
  if (isBookmarksView) {
    orderedFiltered = inView.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } else {
    const ordered = getPostsInOrder();
    orderedFiltered = ordered;
  }

  const q = String(state.query ?? "").trim().toLowerCase();
  const visible = q
    ? orderedFiltered.filter((p) => {
      const haystack = `${p.text}\n${p.replyText}`.toLowerCase();
      return haystack.includes(q);
    })
    : orderedFiltered;

  const frag = document.createDocumentFragment();
  for (const post of visible) frag.append(createPostElement(post));

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "status";
    if (isBookmarksView) {
      empty.textContent = q ? "No bookmarks match your search." : "No bookmarks yet.";
    } else {
      empty.textContent = q ? "No posts match your search." : "No posts to show.";
    }
    frag.append(empty);
  }

  const justAddedId = state.justAddedPostId;
  el.feed.replaceChildren(frag);
  if (justAddedId) retriggerAnimation(document.getElementById(justAddedId), "is-entering");
  state.justAddedPostId = null;

  const sourceLabel = getSourceLabel();

  if (isBookmarksView) {
    setStatus(
      q
        ? `Showing ${visible.length} of ${inView.length} bookmarks.`
        : `${inView.length} bookmarks from all feeds.`,
    );
  } else {
    const viewLabel = "posts";
    const totalInView = inView.length;
    setStatus(
      q
        ? `Showing ${visible.length} of ${totalInView} ${viewLabel}. Source: ${sourceLabel}.`
        : `Loaded ${totalInView} ${viewLabel}. Source: ${sourceLabel}.`,
    );
  }

  if (el.clearBookmarks) el.clearBookmarks.disabled = state.bookmarkedIds.size === 0;
}

function renderProfile() {
  const isDark = document.documentElement.dataset.theme === "dark";

  const wrapper = document.createElement("div");
  wrapper.className = "profile";

  const appearance = document.createElement("div");
  appearance.className = "card";

  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = "Appearance";

  const themeSwitch = document.createElement("button");
  themeSwitch.id = "profileThemeSwitch";
  themeSwitch.type = "button";
  themeSwitch.className = "setting-switch";
  themeSwitch.setAttribute("role", "switch");
  themeSwitch.setAttribute("aria-checked", String(isDark));

  const label = document.createElement("span");
  label.className = "setting-label";
  label.textContent = "Dark mode";

  const track = document.createElement("span");
  track.className = "switch-track";
  track.setAttribute("aria-hidden", "true");

  const thumb = document.createElement("span");
  thumb.className = "switch-thumb";
  track.append(thumb);

  themeSwitch.append(label, track);
  themeSwitch.addEventListener("click", toggleTheme);

  appearance.append(title, themeSwitch);
  wrapper.append(appearance);

  const storageCard = document.createElement("div");
  storageCard.className = "card";

  const storageTitle = document.createElement("h2");
  storageTitle.className = "card-title";
  storageTitle.textContent = "Local storage";

  const storageDesc = document.createElement("p");
  storageDesc.className = "muted";
  storageDesc.textContent = "Stored locally on this device.";

  storageCard.append(storageTitle, storageDesc);

  const usage = state.storage?.usage;
  const quota = state.storage?.quota;
  const persisted = state.storage?.persisted;

  const details = document.createElement("ul");
  details.className = "list";
  const items = [];

  if (Number.isFinite(usage) && Number.isFinite(quota)) {
    items.push(`Usage: ${formatBytes(usage)} of ${formatBytes(quota)}`);
  } else if (Number.isFinite(usage)) {
    items.push(`Usage: ${formatBytes(usage)}`);
  }

  if (typeof persisted === "boolean") {
    items.push(`Persistence: ${persisted ? "enabled" : "not granted"}`);
  }

  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    details.append(li);
  }

  if (items.length > 0) storageCard.append(details);
  wrapper.append(storageCard);

  const dataCard = document.createElement("div");
  dataCard.className = "card";

  const dataTitle = document.createElement("h2");
  dataTitle.className = "card-title";
  dataTitle.textContent = "Local data";

  const dataDesc = document.createElement("p");
  dataDesc.className = "muted";
  dataDesc.textContent = "Export, import, or reset your local posts, likes, bookmarks, and CSV uploads.";

  const dataActions = document.createElement("div");
  dataActions.className = "modal-actions";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn secondary";
  exportBtn.textContent = "Export Local Data";
  exportBtn.addEventListener("click", exportLocalData);

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "btn secondary";
  importBtn.textContent = "Import Local Data";
  importBtn.addEventListener("click", promptImportLocalData);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "btn primary danger";
  resetBtn.textContent = "Reset Local Data";
  resetBtn.addEventListener("click", openResetDataModal);

  dataActions.append(exportBtn, importBtn, resetBtn);
  dataCard.append(dataTitle, dataDesc, dataActions);
  wrapper.append(dataCard);

  el.feed.replaceChildren(wrapper);
  setStatus("");
}

function renderExplore() {
  const ordered = [...mergePosts()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const selectedTag = state.explore?.selectedTag || null;
  const selectedAuthor = state.explore?.selectedAuthor || null;
  const sort = state.explore?.sort || "trending";
  const q = String(state.query ?? "").trim().toLowerCase();

  const tagsCache = new Map();
  const getTagsForPost = (post) => {
    if (!post?.id) return [];
    if (tagsCache.has(post.id)) return tagsCache.get(post.id);
    const tags = extractTagsFromText(`${post.text ?? ""}\n${post.replyText ?? ""}`);
    tagsCache.set(post.id, tags);
    return tags;
  };

  const trending = Array.from(computeTrendingTags(ordered).entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);



  const wrapper = document.createElement("div");
  wrapper.className = "explore";

  const grid = document.createElement("div");
  grid.className = "explore-grid";

  // --- NEW: Your Feeds Section ---
  const feedsCard = document.createElement("div");
  feedsCard.className = "card feeds-card";
  const feedsTitle = document.createElement("h2");
  feedsTitle.className = "card-title";
  feedsTitle.textContent = "Your Feeds";
  feedsCard.append(feedsTitle);

  if (state.savedFeeds.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No saved feeds yet. Create one from the 'More' menu.";
    feedsCard.append(empty);
  } else {
    // Bulk actions bar
    const bulkBar = document.createElement("div");
    bulkBar.className = "feeds-bulk-bar";

    const selectAllLabel = document.createElement("label");
    selectAllLabel.className = "feeds-select-all";
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.dataset.action = "select-all-feeds";
    selectAllCheckbox.checked = state.selectedFeedIds.size === state.savedFeeds.length && state.savedFeeds.length > 0;
    selectAllCheckbox.indeterminate = state.selectedFeedIds.size > 0 && state.selectedFeedIds.size < state.savedFeeds.length;
    const selectAllText = document.createElement("span");
    selectAllText.style.fontWeight = "600";
    selectAllText.textContent = state.selectedFeedIds.size > 0
      ? `${state.selectedFeedIds.size} selected`
      : "Select all";
    selectAllLabel.append(selectAllCheckbox, selectAllText);
    bulkBar.append(selectAllLabel);

    if (state.selectedFeedIds.size > 0) {
      const bulkActions = document.createElement("div");
      bulkActions.className = "feeds-bulk-actions";

      if (state.selectedFeedIds.size >= 2) {
        const mergeBtn = document.createElement("button");
        mergeBtn.type = "button";
        mergeBtn.className = "btn secondary sm";
        mergeBtn.dataset.action = "merge-selected-feeds";
        mergeBtn.textContent = "Merge";
        bulkActions.append(mergeBtn);

        const viewTogetherBtn = document.createElement("button");
        viewTogetherBtn.type = "button";
        viewTogetherBtn.className = "btn secondary sm";
        viewTogetherBtn.dataset.action = "view-selected-feeds";
        viewTogetherBtn.textContent = "View Together";
        bulkActions.append(viewTogetherBtn);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn ghost sm danger-hover";
      deleteBtn.dataset.action = "delete-selected-feeds";
      deleteBtn.textContent = "Delete";
      bulkActions.append(deleteBtn);

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "btn ghost sm";
      clearBtn.dataset.action = "clear-feed-selection";
      clearBtn.textContent = "Clear";
      bulkActions.append(clearBtn);

      bulkBar.append(bulkActions);
    }

    feedsCard.append(bulkBar);

    const list = document.createElement("div");
    list.className = "saved-feeds-list";
    for (const feed of state.savedFeeds) {
      const item = document.createElement("div");
      item.className = "saved-feed-item";
      if (state.selectedFeedIds.has(feed.id)) {
        item.classList.add("is-selected");
      }

      // Checkbox for selection
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "feed-checkbox";
      checkbox.dataset.action = "toggle-feed-select";
      checkbox.dataset.feedId = feed.id;
      checkbox.checked = state.selectedFeedIds.has(feed.id);

      const info = document.createElement("div");
      info.className = "feed-info";

      const name = document.createElement("div");
      name.className = "feed-name";
      name.textContent = feed.name;

      const meta = document.createElement("div");
      meta.className = "feed-meta-text";
      const date = new Date(feed.createdAt).toLocaleDateString();
      const postsCount = getSavedFeedPostCount(feed);
      meta.textContent = `${date} · ${postsCount} posts`;

      info.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "feed-actions";

      // Check if this is the currently active feed
      const isActiveFeed = state.activeFeedId === feed.id;

      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.dataset.feedId = feed.id;

      if (isActiveFeed) {
        loadBtn.className = "btn secondary sm";
        loadBtn.textContent = "Viewing";
        loadBtn.disabled = true;
      } else {
        loadBtn.className = "btn primary sm";
        loadBtn.dataset.action = "load-feed";
        loadBtn.textContent = "Continue";
      }

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn ghost sm";
      editBtn.dataset.action = "rename-feed";
      editBtn.dataset.feedId = feed.id;
      editBtn.textContent = "Edit";

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn ghost sm danger-hover";
      delBtn.dataset.action = "delete-feed";
      delBtn.dataset.feedId = feed.id;
      delBtn.textContent = "Delete";

      // Disable delete for active feed
      if (isActiveFeed) {
        delBtn.disabled = true;
        delBtn.title = "Return to main workspace before deleting";
      }

      actions.append(loadBtn, editBtn, delBtn);
      item.append(checkbox, info, actions);
      list.append(item);
    }
    feedsCard.append(list);
  }
  wrapper.append(feedsCard);
  // --- END OF NEW SECTION ---

  const tagsCard = document.createElement("div");
  tagsCard.className = "card";
  const tagsTitle = document.createElement("h2");
  tagsTitle.className = "card-title";
  tagsTitle.textContent = "Trending tags";
  tagsCard.append(tagsTitle);

  if (trending.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No hashtags yet.";
    tagsCard.append(empty);
  } else {
    const chipRow = document.createElement("div");
    chipRow.className = "tag-chips";
    for (const [tag, count] of trending) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "action chip";
      chip.dataset.action = "explore-tag";
      chip.dataset.tag = tag;
      const isSelected = selectedTag === tag;
      chip.classList.toggle("is-selected", isSelected);
      chip.setAttribute("aria-pressed", String(isSelected));

      const label = document.createElement("span");
      label.className = "chip-label";
      label.textContent = `#${tag}`;

      const badge = document.createElement("span");
      badge.className = "chip-count";
      badge.textContent = String(count);

      chip.append(label, badge);
      chipRow.append(chip);
    }
    tagsCard.append(chipRow);
  }

  grid.append(tagsCard);
  wrapper.append(grid);

  const resultsHeader = document.createElement("div");
  resultsHeader.className = "explore-results-header";

  const summary = document.createElement("div");
  summary.className = "muted";
  const tokens = [];
  if (selectedTag) tokens.push(`#${selectedTag}`);
  if (selectedAuthor) tokens.push(`@${selectedAuthor}`);
  if (q) tokens.push(`"${q}"`);
  summary.textContent = tokens.length > 0 ? `Results for ${tokens.join(" · ")}` : "Try searching or pick a tag.";

  resultsHeader.append(summary);

  if (tokens.length > 0) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "action explore-clear-btn";
    clear.dataset.action = "explore-clear";
    clear.textContent = "Clear";
    resultsHeader.append(clear);
  }

  wrapper.append(resultsHeader);

  const results = document.createElement("div");
  results.className = "explore-results";

  let visible = ordered;
  if (selectedAuthor) visible = visible.filter((p) => p?.author?.handle === selectedAuthor);
  if (selectedTag) visible = visible.filter((p) => getTagsForPost(p).includes(selectedTag));
  if (q) {
    visible = visible.filter((p) => {
      const tags = getTagsForPost(p);
      const haystack = `${p.text}\n${p.replyText}\n${p.author?.name ?? ""}\n@${p.author?.handle ?? ""}\n${tags.join(
        " ",
      )}\n#${tags.join(" #")}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  if (sort === "top") {
    const score = (post) => {
      let points = 0;
      if (state.likedIds.has(post.id)) points += 2;
      if (state.bookmarkedIds.has(post.id)) points += 1;
      return points;
    };
    visible = [...visible].sort((a, b) => score(b) - score(a) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  if (tokens.length === 0) {
    const hint = document.createElement("div");
    hint.className = "status";
    hint.textContent = "Try searching or pick a tag.";
    results.append(hint);
    setStatus(`Explore ready. Source: ${getSourceLabel()}.`);
  } else {
    const frag = document.createDocumentFragment();
    for (const post of visible) frag.append(createPostElement(post));
    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "status";
      empty.textContent = "No results match your filters.";
      frag.append(empty);
    }
    results.append(frag);
    setStatus(`Showing ${visible.length} result${visible.length === 1 ? "" : "s"}. Source: ${getSourceLabel()}.`);
  }

  wrapper.append(results);
  el.feed.replaceChildren(wrapper);
}

async function loadBundledCsvText() {
  const response = await fetch(BUNDLED_CSV_PATH, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Failed to fetch ${BUNDLED_CSV_PATH}: ${response.status}`);
  return await response.text();
}

function buildCsvPosts(csvText, sourceName) {
  const delimiter = detectDelimiter(csvText);
  const rows = parseCsv(csvText, delimiter);
  return rows.map((row, index) => createPostFromRow(row, index, sourceName)).filter(Boolean);
}

async function loadInitialCsv() {
  const storedCsvFiles = readStoredCsvFiles();
  if (storedCsvFiles.length > 0) {
    const posts = buildPostsFromFiles(storedCsvFiles);
    state.source = {
      kind: "uploaded",
      name: storedCsvFiles[0].name,
      files: storedCsvFiles.map((f) => f.name),
    };
    state.csvPosts = posts;
    return;
  }

  const storedCsvText = safeGetItem(STORAGE_KEYS.csvText);
  const storedCsvName = safeGetItem(STORAGE_KEYS.csvName) || "uploaded.csv";

  if (storedCsvText) {
    state.source = { kind: "uploaded", name: storedCsvName, files: [storedCsvName] };
    state.csvPosts = buildCsvPosts(storedCsvText, storedCsvName);
    persistCsvFiles([{ name: storedCsvName, text: storedCsvText }]);
    return;
  }

  state.source = { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] };
  const csvText = await loadBundledCsvText();
  state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");
}

async function setUploadedCsv(csvText, fileName) {
  const safeName = String(fileName || "uploaded.csv");
  captureUploadSnapshot();
  persistCsvFiles([{ name: safeName, text: csvText }]);
  state.source = { kind: "uploaded", name: safeName, files: [safeName] };
  state.csvPosts = buildCsvPosts(csvText, safeName);
  state.shuffleOrder = null;
  state.query = "";
  el.search.value = "";
  updateViewUi();
  render();
}

async function appendUploadedCsv(csvText, fileName) {
  const safeName = String(fileName || "uploaded.csv");
  const nextPosts = buildCsvPosts(csvText, safeName);
  state.csvPosts = [...nextPosts, ...state.csvPosts];
  const stored = readStoredCsvFiles();
  captureUploadSnapshot();
  const filesList = [{ name: safeName, text: csvText }, ...stored];
  persistCsvFiles(filesList);
  const files = filesList.map((f) => f.name);
  state.source = { kind: "uploaded", name: safeName, files };
  state.shuffleOrder = null;
  state.query = "";
  el.search.value = "";
  updateViewUi();
  render();
}

function updateComposerUi() {
  const text = String(el.composerText.value ?? "");
  el.charLeft.textContent = String(280 - text.length);
  el.postBtn.disabled = text.trim().length === 0;
}

function addUserPost(text) {
  const post = createUserPost(text);
  state.userPosts.unshift(post);
  state.userPosts = state.userPosts.slice(0, 50);
  persistUserPosts();
  state.shuffleOrder = null;
  state.query = "";
  el.search.value = "";
  state.justAddedPostId = post.id;
  render();
}

async function handleCsvFile(file) {
  if (!file) return;
  if (typeof file.size === "number" && file.size > MAX_CSV_BYTES) {
    setStatus("CSV is too large. Max size is 5MB.");
    return;
  }

  const fileName = String(file.name || "");
  const lowerName = fileName.toLowerCase();
  const fileType = String(file.type || "").toLowerCase();
  const isCsvType = fileType.includes("csv") || fileType.startsWith("text/");
  const isCsvName = lowerName.endsWith(".csv");
  if (!isCsvType && !isCsvName) {
    setStatus("Unsupported file type. Please choose a .csv file.");
    return;
  }
  const text = await file.text();
  const analysis = analyzeCsv(text, fileName);
  const byteSize = getCsvByteSize(file, text);
  const summary = formatCsvSummary(analysis, byteSize);
  const existingFiles = readStoredCsvFiles();
  const isFirstUpload = existingFiles.length === 0 && state.source.kind === "bundled";
  if (isFirstUpload) {
    await setUploadedCsv(text, fileName);
    pendingCsvFile = null;
    const statusParts = [`Feed replaced with ${fileName}.`];
    if (summary) statusParts.push(summary);
    setStatus(statusParts.join(" "));
    return;
  }

  pendingCsvFile = { file, text, analysis, byteSize };
  const hasMetaSlot = Boolean(el.csvChoiceMeta);
  const meta = hasMetaSlot ? summary || "" : "";
  const message = hasMetaSlot ? `Load "${fileName}"?` : summary ? `Load "${fileName}"? ${summary}.` : `Load "${fileName}"?`;
  openCsvChoiceModal(fileName, { message, meta });
}

function requestClearFeed() {
  openClearFeedModal();
}

async function clearFeedConfirmed() {
  state.userPosts = [];
  state.likedIds.clear();
  state.bookmarkedIds.clear();
  state.expandedReplies.clear();
  state.shuffleOrder = null;
  state.lastUploadSnapshot = null;
  persistUserPosts();
  persistLikedIds();
  persistBookmarkedIds();
  safeRemoveItem(STORAGE_KEYS.csvFiles);
  safeRemoveItem(STORAGE_KEYS.csvText);
  safeRemoveItem(STORAGE_KEYS.csvName);
  state.source = { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] };
  const csvText = await loadBundledCsvText();
  state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");
  state.query = "";
  el.search.value = "";
  updateViewUi();
  render();
  setStatus("Feed reset to bundled CSV.");
}

function clearAllAppStorageKeys() {
  for (const key of Object.values(STORAGE_KEYS)) safeRemoveItem(key);
}

async function resetLocalDataConfirmed() {
  clearAllAppStorageKeys();

  state.userPosts = [];
  state.likedIds.clear();
  state.bookmarkedIds.clear();
  state.expandedReplies.clear();
  state.shuffleOrder = null;
  state.lastUploadSnapshot = null;
  pendingCsvFile = null;

  state.source = { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] };
  const csvText = await loadBundledCsvText();
  state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");

  applyTheme(getInitialTheme());
  updateThemeToggle();

  state.query = "";
  el.search.value = "";
  updateViewUi();
  render();
  setStatus("Local data reset.");
}

function shuffleFeed() {
  const ids = mergePosts().map((p) => p.id);
  state.shuffleOrder = shuffleArray(ids);
  render();
  setStatus("Feed shuffled.");
}

async function undoLastUpload() {
  const snapshot = state.lastUploadSnapshot;
  if (!snapshot) return;
  if (snapshot.files && snapshot.files.length > 0) {
    persistCsvFiles(snapshot.files);
    state.source = snapshot.source;
    state.csvPosts = buildPostsFromFiles(snapshot.files);
  } else {
    safeRemoveItem(STORAGE_KEYS.csvFiles);
    safeRemoveItem(STORAGE_KEYS.csvText);
    safeRemoveItem(STORAGE_KEYS.csvName);
    const csvText = await loadBundledCsvText();
    state.source = { kind: "bundled", name: "flashcards.csv", files: ["flashcards.csv"] };
    state.csvPosts = buildCsvPosts(csvText, "flashcards.csv");
  }
  state.shuffleOrder = null;
  state.lastUploadSnapshot = null;
  state.query = "";
  el.search.value = "";
  updateViewUi();
  render();
  setStatus("Undo applied.");
}

function downloadCurrentFeed() {
  const rows = mergePosts().map((p) => [p.text, p.replyText]);
  const sanitizeCsvCell = (cell) => {
    const str = String(cell ?? "");
    const trimmedStart = str.trimStart();
    if (
      trimmedStart.startsWith("=") ||
      trimmedStart.startsWith("+") ||
      trimmedStart.startsWith("-") ||
      trimmedStart.startsWith("@")
    ) {
      return `'${str}`;
    }
    return str;
  };
  const escape = (cell) => {
    const str = sanitizeCsvCell(cell);
    if (str.includes('"') || str.includes(",") || str.includes("\n")) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "feed.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Downloaded feed.");
}

let dropOverlayToken = 0;
let dropOverlayHideTimeoutId = 0;
let pendingCsvFile = null;
let lastScrollY = 0;
let scrollHideTicking = false;

function openCsvChoiceModal(fileName, { message, meta } = {}) {
  if (!el.csvChoiceModal) return;
  const safeName = String(fileName ?? "");
  if (el.csvChoiceMessage) el.csvChoiceMessage.textContent = message ?? `Load "${safeName}"?`;
  if (el.csvChoiceMeta) el.csvChoiceMeta.textContent = meta ?? "";
  el.csvChoiceModal.hidden = false;
  requestAnimationFrame(() => el.csvChoiceModal.classList.add("is-visible"));
}

function closeCsvChoiceModal() {
  if (!el.csvChoiceModal) return;
  const modal = el.csvChoiceModal;
  modal.classList.remove("is-visible");
  pendingCsvFile = null;

  const finish = () => {
    modal.hidden = true;
    modal.removeEventListener("transitionend", onTransitionEnd);
    if (el.csvChoiceMeta) el.csvChoiceMeta.textContent = "";
  };

  const onTransitionEnd = (event) => {
    if (event.target !== modal) return;
    if (event.propertyName !== "opacity") return;
    finish();
  };

  modal.addEventListener("transitionend", onTransitionEnd);
  window.setTimeout(finish, 250);
}

function showDropOverlay(show) {
  if (!el.dropOverlay) return;
  const overlay = el.dropOverlay;

  dropOverlayToken += 1;
  const token = dropOverlayToken;

  if (dropOverlayHideTimeoutId) {
    window.clearTimeout(dropOverlayHideTimeoutId);
    dropOverlayHideTimeoutId = 0;
  }

  if (show) {
    overlay.hidden = false;
    overlay.classList.remove("is-visible");
    requestAnimationFrame(() => {
      if (dropOverlayToken !== token) return;
      overlay.classList.add("is-visible");
    });
    return;
  }

  overlay.classList.remove("is-visible");
  if (overlay.hidden) return;

  const finish = () => {
    if (dropOverlayToken !== token) return;
    overlay.hidden = true;
    dropOverlayHideTimeoutId = 0;
  };

  const onTransitionEnd = (event) => {
    if (event.target !== overlay) return;
    if (event.propertyName !== "opacity") return;
    overlay.removeEventListener("transitionend", onTransitionEnd);
    finish();
  };

  overlay.addEventListener("transitionend", onTransitionEnd);
  const styles = window.getComputedStyle(overlay);
  const totalMs = cssTimeToMs(styles.transitionDuration) + cssTimeToMs(styles.transitionDelay);
  dropOverlayHideTimeoutId = window.setTimeout(() => {
    overlay.removeEventListener("transitionend", onTransitionEnd);
    finish();
  }, Math.max(250, totalMs + 50));
}

async function boot() {
  applyTheme(getInitialTheme());
  updateThemeToggle();

  state.userPosts = loadUserPosts();
  state.likedIds = loadLikedIds();
  state.bookmarkedIds = loadBookmarkedIds();
  state.savedFeeds = loadSavedFeeds();

  setStatus("Loading posts...");
  try {
    await loadInitialCsv();
  } catch (error) {
    setStatus(
      `Couldn't load ${BUNDLED_CSV_PATH}. If you opened the HTML file directly, run a local server (ex: VS Code Live Server).`,
    );
    throw error;
  }

  updateViewUi();
  render();
  updateComposerUi();
  initStorageInfo();

  for (const item of el.navItems) {
    item.addEventListener("click", () => {
      retriggerAnimation(item, "is-nav-animating");
      const view = item.dataset.view;
      if (view && VIEW_CONFIG[view]) {
        setView(view);
        return;
      }
      setStatus("That page isn't implemented yet.");
    });
  }

  if (el.profileModal) {
    el.profileModal.addEventListener("click", (event) => {
      if (event.target === el.profileModal) closeProfileModal();
    });
  }

  if (el.csvChoiceModal) {
    el.csvChoiceModal.addEventListener("click", (event) => {
      if (event.target === el.csvChoiceModal) closeCsvChoiceModal();
    });
  }

  if (el.feedManagerModal) {
    el.feedManagerModal.addEventListener("click", (event) => {
      if (event.target === el.feedManagerModal) closeFeedManager();
    });
  }

  if (el.clearFeedModal) {
    el.clearFeedModal.addEventListener("click", (event) => {
      if (event.target === el.clearFeedModal) closeClearFeedModal();
    });
  }

  if (el.resetDataModal) {
    el.resetDataModal.addEventListener("click", (event) => {
      if (event.target === el.resetDataModal) closeResetDataModal();
    });
  }

  if (el.closeProfileModal) el.closeProfileModal.addEventListener("click", closeProfileModal);
  if (el.closeCsvChoiceModal) el.closeCsvChoiceModal.addEventListener("click", closeCsvChoiceModal);
  if (el.closeFeedManager) el.closeFeedManager.addEventListener("click", closeFeedManager);
  if (el.closeClearFeedModal) el.closeClearFeedModal.addEventListener("click", closeClearFeedModal);
  if (el.closeResetDataModal) el.closeResetDataModal.addEventListener("click", closeResetDataModal);

  if (el.csvChoiceCancel) el.csvChoiceCancel.addEventListener("click", closeCsvChoiceModal);
  if (el.clearFeedCancel) el.clearFeedCancel.addEventListener("click", closeClearFeedModal);
  if (el.resetDataCancel) el.resetDataCancel.addEventListener("click", closeResetDataModal);

  if (el.clearFeedConfirm) {
    el.clearFeedConfirm.addEventListener("click", async () => {
      const confirmButton = el.clearFeedConfirm;
      confirmButton.disabled = true;
      try {
        await clearFeedConfirmed();
        closeClearFeedModal();
      } finally {
        confirmButton.disabled = false;
      }
    });
  }

  if (el.resetDataConfirm) {
    el.resetDataConfirm.addEventListener("click", async () => {
      const confirmButton = el.resetDataConfirm;
      confirmButton.disabled = true;
      try {
        await resetLocalDataConfirmed();
        closeResetDataModal();
      } finally {
        confirmButton.disabled = false;
      }
    });
  }

  if (el.csvChoiceReplace) {
    el.csvChoiceReplace.addEventListener("click", async () => {
      if (!pendingCsvFile) return;
      const current = pendingCsvFile;
      const text = current.text || (await current.file?.text?.());
      await setUploadedCsv(text, current.file?.name || "uploaded.csv");
      closeCsvChoiceModal();
      pendingCsvFile = null;
      const summary = formatCsvSummary(current.analysis, current.byteSize ?? getCsvByteSize(current.file, text));
      const statusParts = ["Feed replaced with uploaded CSV."];
      if (summary) statusParts.push(summary);
      setStatus(statusParts.join(" "));
      if (el.csvChoiceMeta) el.csvChoiceMeta.textContent = "";
    });
  }

  if (el.csvChoiceAppend) {
    el.csvChoiceAppend.addEventListener("click", async () => {
      if (!pendingCsvFile) return;
      const current = pendingCsvFile;
      const text = current.text || (await current.file?.text?.());
      await appendUploadedCsv(text, current.file?.name || "uploaded.csv");
      closeCsvChoiceModal();
      pendingCsvFile = null;
      const summary = formatCsvSummary(current.analysis, current.byteSize ?? getCsvByteSize(current.file, text));
      const statusParts = ["CSV added to current feed."];
      if (summary) statusParts.push(summary);
      setStatus(statusParts.join(" "));
      if (el.csvChoiceMeta) el.csvChoiceMeta.textContent = "";
    });
  }

  if (el.manageFeed) {
    el.manageFeed.addEventListener("click", () => {
      openFeedManager();
      closeMoreMenu();
    });
  }

  if (el.moreBtn) {
    el.moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMoreMenu();
    });
  }

  window.addEventListener("click", () => {
    closeMoreMenu();
  });

  document.body.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "load-feed") {
      const feedId = button.dataset.feedId;
      if (feedId) loadFeed(feedId);
    } else if (action === "delete-feed") {
      const feedId = button.dataset.feedId;
      if (feedId) deleteFeed(feedId);
    }
  });

  function toggleMoreMenu() {
    const isVisible = el.moreMenu.classList.contains("is-visible");
    if (isVisible) closeMoreMenu();
    else openMoreMenu();
  }

  function openMoreMenu() {
    if (!el.moreMenu) return;
    el.moreMenu.hidden = false;
    el.moreBtn.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => el.moreMenu.classList.add("is-visible"));
  }

  function closeMoreMenu() {
    if (!el.moreMenu) return;
    el.moreMenu.classList.remove("is-visible");
    el.moreBtn.setAttribute("aria-expanded", "false");
    const finish = () => {
      el.moreMenu.hidden = true;
      el.moreMenu.removeEventListener("transitionend", onTransitionEnd);
    };
    const onTransitionEnd = (event) => {
      if (event.target !== el.moreMenu) return;
      finish();
    };
    el.moreMenu.addEventListener("transitionend", onTransitionEnd);
    window.setTimeout(finish, 200);
  }

  if (el.feedFileList) {
    el.feedFileList.addEventListener("click", async (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest("button[data-index]") : null;
      if (!button) return;
      const index = Number.parseInt(button.dataset.index || "-1", 10);
      if (Number.isNaN(index)) return;
      await removeCsvFileByIndex(index);
    });
  }

  if (el.profileModalThemeToggle) {
    el.profileModalThemeToggle.addEventListener("click", () => {
      toggleTheme();
    });
  }

  el.search.addEventListener("input", () => {
    state.query = el.search.value;
    render();
  });

  el.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      el.search.value = "";
      state.query = "";
      render();
    }
  });



  el.clearBookmarks.addEventListener("click", () => {
    if (state.bookmarkedIds.size === 0) return;
    state.bookmarkedIds.clear();
    persistBookmarkedIds();
    render();
    setStatus("Bookmarks cleared.");
  });

  el.composerText.addEventListener("input", updateComposerUi);
  el.composerText.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      if (!el.postBtn.disabled) el.postBtn.click();
    }
  });

  el.postBtn.addEventListener("click", () => {
    const text = String(el.composerText.value ?? "");
    if (!text.trim()) return;
    addUserPost(text.trim());
    el.composerText.value = "";
    updateComposerUi();
    el.composerText.focus();
    setStatus("Posted.");
  });

  el.themeToggle.addEventListener("click", toggleTheme);
  el.themeToggle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    spawnRipple(el.themeToggle, event);
  });
  el.themeToggle.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") spawnRipple(el.themeToggle);
  });

  el.csvInput.addEventListener("change", async () => {
    const file = el.csvInput.files?.[0];
    el.csvInput.value = "";
    await handleCsvFile(file);
  });

  if (el.newFeed) {
    el.newFeed.addEventListener("click", () => {
      createNewFeed();
      closeMoreMenu();
    });
  }

  if (el.clearFeed) {
    el.clearFeed.addEventListener("click", () => {
      requestClearFeed();
      closeMoreMenu();
    });
  }

  if (el.shuffleFeed) {
    el.shuffleFeed.addEventListener("click", () => {
      shuffleFeed();
      closeMoreMenu();
    });
  }

  if (el.undoUpload) {
    el.undoUpload.addEventListener("click", () => {
      undoLastUpload();
    });
  }

  if (el.downloadFeed) {
    el.downloadFeed.addEventListener("click", () => {
      downloadCurrentFeed();
      closeMoreMenu();
    });
  }

  el.feed.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!button) return;

    const action = button.dataset.action;
    const postId = button.dataset.postId;

    if (action === "explore-tag") {
      const tag = button.dataset.tag;
      if (!tag) return;
      state.explore.selectedTag = state.explore.selectedTag === tag ? null : tag;
      state.explore.selectedAuthor = null;
      renderExplore();
      setStatus(state.explore.selectedTag ? `Filtering by #${tag}.` : "Explore filter cleared.");
      return;
    }

    if (action === "explore-author") {
      const handle = button.dataset.handle;
      if (!handle) return;
      state.explore.selectedAuthor = state.explore.selectedAuthor === handle ? null : handle;
      state.explore.selectedTag = null;
      renderExplore();
      setStatus(state.explore.selectedAuthor ? `Filtering by @${handle}.` : "Explore filter cleared.");
      return;
    }

    if (action === "load-feed") {
      const feedId = button.dataset.feedId;
      if (feedId) loadFeed(feedId);
      return;
    }

    if (action === "delete-feed") {
      const feedId = button.dataset.feedId;
      if (feedId) deleteFeed(feedId);
      return;
    }

    if (action === "rename-feed") {
      const feedId = button.dataset.feedId;
      if (!feedId) return;
      const feed = state.savedFeeds.find((f) => f.id === feedId);
      if (!feed) return;
      const newName = prompt("Enter new feed name:", feed.name);
      if (newName && newName.trim() !== "") {
        feed.name = newName.trim();
        // Also update previewedFeedMeta if this is the active feed
        if (state.previewedFeedMeta && state.previewedFeedMeta.id === feedId) {
          state.previewedFeedMeta.name = newName.trim();
        }
        persistSavedFeeds();
        renderExplore();
        setStatus(`Feed renamed to "${newName.trim()}".`);
      }
      return;
    }

    if (action === "toggle-feed-select") {
      const feedId = button.dataset.feedId;
      if (!feedId) return;
      if (state.selectedFeedIds.has(feedId)) {
        state.selectedFeedIds.delete(feedId);
      } else {
        state.selectedFeedIds.add(feedId);
      }
      renderExplore();
      return;
    }

    if (action === "select-all-feeds") {
      if (state.selectedFeedIds.size === state.savedFeeds.length) {
        // All selected, so deselect all
        state.selectedFeedIds.clear();
      } else {
        // Select all
        state.selectedFeedIds = new Set(state.savedFeeds.map((f) => f.id));
      }
      renderExplore();
      return;
    }

    if (action === "clear-feed-selection") {
      state.selectedFeedIds.clear();
      renderExplore();
      return;
    }

    if (action === "delete-selected-feeds") {
      const count = state.selectedFeedIds.size;
      if (count === 0) return;
      const confirmed = confirm(`Delete ${count} selected feed(s)? This cannot be undone.`);
      if (!confirmed) return;

      // Check if active feed is in selection
      if (state.activeFeedId && state.selectedFeedIds.has(state.activeFeedId)) {
        alert("Cannot delete the currently active feed. Please return to workspace first.");
        return;
      }

      state.savedFeeds = state.savedFeeds.filter((f) => !state.selectedFeedIds.has(f.id));
      state.selectedFeedIds.clear();
      persistSavedFeeds();
      renderExplore();
      setStatus(`Deleted ${count} feed(s).`);
      return;
    }

    if (action === "merge-selected-feeds") {
      if (state.selectedFeedIds.size < 2) return;

      const selectedFeeds = state.savedFeeds.filter((f) => state.selectedFeedIds.has(f.id));
      const newName = prompt("Enter name for merged feed:", `Merged Feed (${selectedFeeds.length} feeds)`);
      if (!newName || newName.trim() === "") return;

      // Combine all posts from selected feeds
      const allCsvPosts = [];
      const allUserPosts = [];
      const allLikedIds = new Set();
      const allCsvFiles = [];

      for (const feed of selectedFeeds) {
        if (feed.csvPosts) allCsvPosts.push(...feed.csvPosts);
        if (feed.userPosts) allUserPosts.push(...feed.userPosts);
        if (feed.likedIds) feed.likedIds.forEach((id) => allLikedIds.add(id));
        if (feed.csvFiles) allCsvFiles.push(...feed.csvFiles);
      }

      // Create merged feed
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 9);
      const mergedFeed = {
        id: `f_${timestamp}_${random}`,
        name: newName.trim(),
        createdAt: timestamp,
        source: { kind: "merged", name: newName.trim(), files: [] },
        csvFiles: allCsvFiles,
        csvPosts: allCsvPosts,
        csvPostCount: allCsvPosts.length,
        userPosts: allUserPosts,
        likedIds: Array.from(allLikedIds),
      };

      state.savedFeeds.unshift(mergedFeed);
      state.selectedFeedIds.clear();
      persistSavedFeeds();
      renderExplore();
      setStatus(`Created merged feed "${newName.trim()}" with ${allCsvPosts.length + allUserPosts.length} posts.`);
      return;
    }

    if (action === "view-selected-feeds") {
      if (state.selectedFeedIds.size < 2) return;

      const selectedFeeds = state.savedFeeds.filter((f) => state.selectedFeedIds.has(f.id));
      const feedNames = selectedFeeds.map((f) => f.name).join(", ");

      // Combine posts from selected feeds only
      const combinedCsvPosts = [];
      const combinedUserPosts = [];

      for (const feed of selectedFeeds) {
        // Handle csvFiles (raw CSV data) - needs to be parsed
        if (Array.isArray(feed.csvFiles) && feed.csvFiles.length > 0) {
          const parsedPosts = buildPostsFromFiles(feed.csvFiles);
          combinedCsvPosts.push(...parsedPosts);
        }
        // Handle pre-parsed csvPosts
        else if (Array.isArray(feed.csvPosts) && feed.csvPosts.length > 0) {
          combinedCsvPosts.push(...feed.csvPosts);
        }

        // Handle userPosts
        if (Array.isArray(feed.userPosts) && feed.userPosts.length > 0) {
          const userPosts = buildUserPostsFromBackup(feed.userPosts);
          combinedUserPosts.push(...userPosts);
        }
      }

      // Stash current workspace if not already stashed
      if (!state.stashedWorkspace) {
        state.stashedWorkspace = captureCurrentFeedSnapshot("Stashed Workspace");
      }

      // Load combined view
      state.csvPosts = combinedCsvPosts;
      state.userPosts = combinedUserPosts;
      state.source = { kind: "combined", name: `Combined View`, files: [] };
      state.activeFeedId = null;
      state.previewedFeedMeta = { id: "combined-view", name: `Combined: ${feedNames}`, createdAt: Date.now() };
      state.selectedFeedIds.clear();

      setView("home");
      render();
      setStatus(`Viewing ${selectedFeeds.length} feeds combined: ${feedNames}`);
      return;
    }

    if (action === "explore-clear") {
      state.explore.selectedTag = null;
      state.explore.selectedAuthor = null;
      state.query = "";
      el.search.value = "";
      renderExplore();
      setStatus(`Explore cleared. Source: ${getSourceLabel()}.`);
      return;
    }

    if (action === "share") {
      retriggerAnimation(button, "is-share-animating");
      const url = new URL(location.href);
      url.hash = postId;
      try {
        await navigator.clipboard.writeText(url.toString());
        setStatus("Link copied.");
      } catch {
        setStatus("Couldn't copy link.");
      }
      return;
    }

    if (action === "toggle-reply") {
      const post = mergePosts().find((p) => p.id === postId);
      if (!post?.replyText) return;
      if (state.expandedReplies.has(postId)) state.expandedReplies.delete(postId);
      else state.expandedReplies.add(postId);

      const expanded = state.expandedReplies.has(postId);
      const postEl = document.getElementById(postId);
      const replyEl = postEl?.querySelector(".reply");
      if (replyEl instanceof HTMLElement) setReplyExpanded(replyEl, expanded);
      button.setAttribute("aria-expanded", String(expanded));
      button.setAttribute("aria-label", expanded ? "Hide reply" : "View reply");
      return;
    }

    if (action === "bookmark") {
      const bookmarked = state.bookmarkedIds.has(postId);
      if (bookmarked) state.bookmarkedIds.delete(postId);
      else state.bookmarkedIds.add(postId);
      persistBookmarkedIds();

      const nextBookmarked = state.bookmarkedIds.has(postId);
      if (state.view === "bookmarks" && !nextBookmarked) {
        render();
        setStatus("Bookmark removed.");
        return;
      }
      button.classList.toggle("is-bookmarked", nextBookmarked);
      button.setAttribute("aria-pressed", String(nextBookmarked));
      button.setAttribute("aria-label", nextBookmarked ? "Remove bookmark" : "Bookmark");
      const label = button.querySelector(".label");
      if (label instanceof HTMLElement) label.textContent = nextBookmarked ? "Bookmarked" : "Bookmark";
      else button.textContent = nextBookmarked ? "Bookmarked" : "Bookmark";
      retriggerAnimation(button, "is-bookmark-animating");
      setStatus(nextBookmarked ? "Bookmarked." : "Bookmark removed.");
      return;
    }

    if (action === "like") {
      const liked = state.likedIds.has(postId);
      if (liked) state.likedIds.delete(postId);
      else state.likedIds.add(postId);
      persistLikedIds();

      const nextLiked = state.likedIds.has(postId);
      button.classList.toggle("is-liked", nextLiked);
      button.setAttribute("aria-pressed", String(nextLiked));
      button.setAttribute("aria-label", nextLiked ? "Unlike" : "Like");
      const count = button.querySelector(".count");
      if (count instanceof HTMLElement) count.textContent = String(getLikeCount(postId));
      retriggerAnimation(button, "is-like-animating");
      setStatus(nextLiked ? "Liked." : "Unliked.");
      return;
    }
  });

  let dragDepth = 0;
  const onDragEvent = (event) => {
    const hasFiles = event.dataTransfer?.types?.includes?.("Files");
    if (!hasFiles) return false;
    event.preventDefault();
    return true;
  };

  document.addEventListener("dragenter", (event) => {
    if (!onDragEvent(event)) return;
    dragDepth++;
    showDropOverlay(true);
  });

  document.addEventListener("dragover", (event) => {
    if (!onDragEvent(event)) return;
    event.dataTransfer.dropEffect = "copy";
  });

  document.addEventListener("dragleave", (event) => {
    if (!onDragEvent(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) showDropOverlay(false);
  });

  document.addEventListener("drop", async (event) => {
    if (!onDragEvent(event)) return;
    dragDepth = 0;
    showDropOverlay(false);
    const file = event.dataTransfer.files?.[0];
    await handleCsvFile(file);
  });

  let pullStartY = 0;
  let pullDistance = 0;
  let isPulling = false;
  const resetPull = () => {
    pullStartY = 0;
    pullDistance = 0;
    isPulling = false;
    document.body.classList.remove("is-pull-refreshing");
  };

  document.addEventListener(
    "touchstart",
    (event) => {
      if (!isMobileWidth()) return;
      if (window.scrollY > 0) return;
      if (event.touches.length !== 1) return;
      pullStartY = event.touches[0].clientY;
      isPulling = true;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      if (!isPulling) return;
      if (event.touches.length !== 1) return;
      pullDistance = event.touches[0].clientY - pullStartY;
      if (pullDistance > 0 && window.scrollY === 0) {
        if (pullDistance > 90) document.body.classList.add("is-pull-refreshing");
      } else {
        resetPull();
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "touchend",
    () => {
      if (!isPulling) return;
      if (pullDistance > 90) {
        render();
        setStatus("Feed refreshed.");
      }
      resetPull();
    },
    { passive: true },
  );

  const updateTopbarVisibility = () => {
    const currentY = window.scrollY;
    const topbar = document.querySelector(".topbar");
    if (!(topbar instanceof HTMLElement)) {
      scrollHideTicking = false;
      return;
    }
    const isScrollingDown = currentY > lastScrollY;
    if (currentY > 64 && isScrollingDown) topbar.classList.add("is-hidden");
    else topbar.classList.remove("is-hidden");
    lastScrollY = currentY;
    scrollHideTicking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!scrollHideTicking) {
        scrollHideTicking = true;
        window.requestAnimationFrame(updateTopbarVisibility);
      }
    },
    { passive: true },
  );

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (isTypingTarget(event.target)) return;

    if (
      event.key === "Escape" &&
      (isProfileModalOpen() ||
        isModalVisible(el.csvChoiceModal) ||
        isModalVisible(el.feedManagerModal) ||
        isModalVisible(el.clearFeedModal) ||
        isModalVisible(el.resetDataModal))
    ) {
      event.preventDefault();
      if (isProfileModalOpen()) closeProfileModal();
      if (isModalVisible(el.csvChoiceModal)) closeCsvChoiceModal();
      if (isModalVisible(el.feedManagerModal)) closeFeedManager();
      if (isModalVisible(el.clearFeedModal)) closeClearFeedModal();
      if (isModalVisible(el.resetDataModal)) closeResetDataModal();
      return;
    }

    if (event.key === "/") {
      const searchWrap = el.search?.closest?.(".search");
      if (searchWrap instanceof HTMLElement && searchWrap.hidden) return;
      event.preventDefault();
      el.search.focus();
      return;
    }

    if (event.key === "Escape") {
      if (el.search.value) {
        el.search.value = "";
        state.query = "";
        render();
      }
      return;
    }

    if (event.key.toLowerCase() === "d") {
      toggleTheme();
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
    });
  }
}

boot();
