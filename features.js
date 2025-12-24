export function initFeatures(ctx) {
  const {
    APP_VERSION,
    MAX_CSV_BYTES,
    STORAGE_KEYS,
    state,
    el,
    setStatus,
    render,
    updateViewUi,
    applyTheme,
    getInitialTheme,
    updateThemeToggle,
    persistUserPosts,
    persistLikedIds,
    persistBookmarkedIds,
    persistCsvFiles,
    readStoredCsvFiles,
    buildPostsFromFiles,
    buildCsvPosts,
    loadBundledCsvText,
    detectDelimiter,
    parseCsv,
    createPostFromRow,
    analyzeCsv,
    formatBytes,
    mergePosts,
    shuffleArray,
    retriggerAnimation,
    buildUserPostsFromBackup,
    safeRemoveItem,
    cssTimeToMs,
  } = ctx;

  let dropOverlayToken = 0;
  let dropOverlayHideTimeoutId = 0;
  let pendingCsvFile = null;

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
        `Detected ${analysis.postCount} post${analysis.postCount === 1 ? "" : "s"} from ${analysis.rowCount} row${
          analysis.rowCount === 1 ? "" : "s"
        } (${analysis.delimiter} delimiter)`,
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
            typeof post.idSeed === "string"
              ? post.idSeed
              : `user|${safeCreatedAt}|${typeof post.text === "string" ? post.text : text}`;
          return { idSeed, createdAt: safeCreatedAt, text };
        })
        .filter(Boolean),
    };
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

  function captureUploadSnapshot() {
    state.lastUploadSnapshot = {
      files: readStoredCsvFiles(),
      source: { ...state.source },
      csvPosts: [...state.csvPosts],
    };
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
    render();
    renderFeedManagerList();
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

  async function handleCsvChoiceReplace() {
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
  }

  async function handleCsvChoiceAppend() {
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

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn ghost";
      remove.textContent = "Remove";
      remove.dataset.index = String(index);

      item.append(meta, remove);
      list.append(item);
    });
  }

  async function removeCsvFileByIndex(index) {
    const files = readStoredCsvFiles();
    if (files.length === 0) return;

    if (index < 0 || index >= files.length) return;
    const removed = files.splice(index, 1)[0];
    if (!removed) return;

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
    state.lastUploadSnapshot = null;
    state.query = "";
    el.search.value = "";
    updateViewUi();
    render();
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

  async function handleShare(button, postId) {
    retriggerAnimation(button, "is-share-animating");
    const url = new URL(location.href);
    url.hash = postId;
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus("Link copied.");
    } catch {
      setStatus("Couldn't copy link.");
    }
  }

  return {
    exportLocalData,
    promptImportLocalData,
    handleCsvFile,
    requestClearFeed,
    clearFeedConfirmed,
    resetLocalDataConfirmed,
    shuffleFeed,
    undoLastUpload,
    downloadCurrentFeed,
    openCsvChoiceModal,
    closeCsvChoiceModal,
    handleCsvChoiceReplace,
    handleCsvChoiceAppend,
    openFeedManager,
    closeFeedManager,
    openClearFeedModal,
    closeClearFeedModal,
    openResetDataModal,
    closeResetDataModal,
    removeCsvFileByIndex,
    showDropOverlay,
    handleShare,
  };
}
