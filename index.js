const fileInput = document.getElementById("subtitle-file");
const fileUploadContainer = document.getElementById("file-upload-container");
const applyAdjustmentsBtn = document.getElementById("apply-adjustments");
const downloadBtn = document.getElementById("download-srt");
const downloadContainer = document.getElementById("download-container");
const syncPointsContainer = document.getElementById("sync-points-container");
const firstCurrentTime = document.getElementById("first-current-time");
const firstSubtitleText = document.getElementById("first-subtitle-text");
const firstNewTimeInput = document.getElementById("first-new-time");
const lastCurrentTime = document.getElementById("last-current-time");
const lastSubtitleText = document.getElementById("last-subtitle-text");
const lastNewTimeInput = document.getElementById("last-new-time");
const lastSyncPoint = document.getElementById("last-sync-point");
const syncError = document.getElementById("sync-error");
const subtitleContext = document.getElementById("subtitle-context");
const firstSubtitlesList = document.getElementById("first-subtitles");
const lastSubtitlesList = document.getElementById("last-subtitles");
const importPopover = document.getElementById("import-popover");
const importStats = document.getElementById("import-stats");
const importWarnings = document.getElementById("import-warnings");
const adjustmentPopover = document.getElementById("adjustment-popover");
const adjustmentStats = document.getElementById("adjustment-stats");

let originalSubtitles = [];
let adjustedSubtitles = [];

function parseTimeToMs(timeStr) {
  const [hours, minutes, secondsMs] = timeStr.split(":");
  const [seconds, milliseconds] = secondsMs.split(",");
  return (
    parseInt(hours) * 3600000 +
    parseInt(minutes) * 60000 +
    parseInt(seconds) * 1000 +
    parseInt(milliseconds)
  );
}

function parseTimeToMsFlexible(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;

  let normalized = timeStr.trim();

  // Replace period with comma for millisecond separator
  normalized = normalized.replace(/(\d)\.(\d)/, "$1,$2");

  // Match time pattern: flexible on leading zeros, strict on structure
  const match = normalized.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  // Pad milliseconds to 3 digits (e.g., "5" -> "500", "50" -> "500")
  const msStr = match[4].padEnd(3, "0");
  const milliseconds = parseInt(msStr, 10);

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
    return null;
  }

  if (minutes >= 60 || seconds >= 60) return null;

  return hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
}

function formatMsToTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

function parseUserTimeToMs(timeStr) {
  const trimmed = timeStr.trim();

  // Split into time and optional milliseconds
  const [timePart, msPart] = trimmed.split(".");
  const parts = timePart.split(":").map((p) => parseInt(p, 10));

  // Require exactly 3 parts: h:m:s
  if (parts.some(isNaN) || parts.length !== 3) return null;

  const [hours, minutes, seconds] = parts;

  if (minutes >= 60 || seconds >= 60 || hours < 0 || minutes < 0 || seconds < 0) return null;

  let milliseconds = 0;
  if (msPart !== undefined) {
    const padded = msPart.padEnd(3, "0").slice(0, 3);
    milliseconds = parseInt(padded, 10);
    if (isNaN(milliseconds)) return null;
  }

  return hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
}

function formatMsToUserTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

function formatShift(shiftMs) {
  const sign = shiftMs >= 0 ? "+" : "";
  const absMs = Math.abs(shiftMs);
  const seconds = (absMs / 1000).toFixed(3);
  return `${sign}${seconds}s`;
}

function applyLinearCorrection(subtitles, firstOldMs, lastOldMs, firstNewMs, lastNewMs) {
  const timeDiff = lastOldMs - firstOldMs;
  const multiplier = timeDiff > 0 ? (lastNewMs - firstNewMs) / timeDiff : 1;

  return subtitles.map((sub) => ({
    ...sub,
    startMs: Math.max(0, Math.round(firstNewMs + (sub.startMs - firstOldMs) * multiplier)),
    endMs: Math.max(0, Math.round(firstNewMs + (sub.endMs - firstOldMs) * multiplier)),
  }));
}

function updateSyncPointsUI() {
  if (originalSubtitles.length === 0) {
    syncPointsContainer.style.display = "none";
    return;
  }

  syncPointsContainer.style.display = "block";
  const firstSub = originalSubtitles[0];
  const lastSub = originalSubtitles[originalSubtitles.length - 1];

  firstCurrentTime.textContent = formatMsToUserTime(firstSub.startMs);
  firstSubtitleText.textContent = firstSub.text;
  firstNewTimeInput.value = formatMsToUserTime(firstSub.startMs);

  if (originalSubtitles.length === 1) {
    lastSyncPoint.style.display = "none";
  } else {
    lastSyncPoint.style.display = "block";
    lastCurrentTime.textContent = formatMsToUserTime(lastSub.startMs);
    lastSubtitleText.textContent = lastSub.text;
    lastNewTimeInput.value = formatMsToUserTime(lastSub.startMs);
  }

  syncError.textContent = "";
}

function validateSyncInputs() {
  const firstNewMs = parseUserTimeToMs(firstNewTimeInput.value);
  if (firstNewMs === null) {
    return { valid: false, error: "Invalid time format for first subtitle. Use h:m:s" };
  }

  if (originalSubtitles.length === 1) {
    return { valid: true, firstNewMs, lastNewMs: firstNewMs };
  }

  const lastNewMs = parseUserTimeToMs(lastNewTimeInput.value);
  if (lastNewMs === null) {
    return { valid: false, error: "Invalid time format for last subtitle. Use h:m:s" };
  }

  if (lastNewMs <= firstNewMs) {
    return { valid: false, error: "Last subtitle time must be after first subtitle time." };
  }

  return { valid: true, firstNewMs, lastNewMs };
}

function parseSrt(srtContent) {
  const normalized = srtContent.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n\n+/).filter((block) => block.trim());
  const subtitles = [];
  const warnings = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    // More lenient regex: allows flexible digit counts and both comma/period separators
    const timeMatch = lines[1].match(
      /(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})/
    );
    if (!timeMatch) {
      warnings.push(`Entry ${index}: invalid time format`);
      continue;
    }

    const startMs = parseTimeToMsFlexible(timeMatch[1]);
    const endMs = parseTimeToMsFlexible(timeMatch[2]);

    if (startMs === null || endMs === null) {
      warnings.push(`Entry ${index}: could not parse time values`);
      continue;
    }

    const text = lines.slice(2).join("\n");
    subtitles.push({ index, startMs, endMs, text });
  }

  return { subtitles, warnings };
}

function serializeSrt(subtitles) {
  return subtitles
    .map(
      (sub) =>
        `${sub.index}\n${formatMsToTime(sub.startMs)} --> ${formatMsToTime(sub.endMs)}\n${sub.text}`
    )
    .join("\n\n");
}

function renderSubtitleSamples(subtitles) {
  if (subtitles.length === 0) {
    subtitleContext.style.display = "none";
    return;
  }

  subtitleContext.style.display = "block";

  // Get first 2 subtitles
  const firstSubs = subtitles.slice(0, 2);
  firstSubtitlesList.innerHTML = firstSubs
    .map((sub) => {
      const firstLine = sub.text.split("\n")[0].slice(0, 80);
      const truncated = sub.text.length > 80 || sub.text.includes("\n") ? "..." : "";
      return `<li><span class="timestamp">${formatMsToUserTime(sub.startMs)}</span><span class="text">${firstLine}${truncated}</span></li>`;
    })
    .join("");

  // Get last 2 subtitles
  const lastSubs = subtitles.slice(-2);
  lastSubtitlesList.innerHTML = lastSubs
    .map((sub) => {
      const firstLine = sub.text.split("\n")[0].slice(0, 80);
      const truncated = sub.text.length > 80 || sub.text.includes("\n") ? "..." : "";
      return `<li><span class="timestamp">${formatMsToUserTime(sub.startMs)}</span><span class="text">${firstLine}${truncated}</span></li>`;
    })
    .join("");
}

function showImportPopover(subtitles, warnings) {
  const first = subtitles[0];
  const last = subtitles[subtitles.length - 1];
  const durationStart = formatMsToUserTime(first.startMs);
  const durationEnd = formatMsToUserTime(last.endMs);

  importStats.innerHTML = `
    <p><strong>${subtitles.length}</strong> subtitles loaded</p>
    <p>Duration: ${durationStart} - ${durationEnd}</p>
  `;

  if (warnings.length > 0) {
    importWarnings.innerHTML = `<p>${warnings.length} entries skipped due to format errors</p>`;
    importWarnings.classList.remove("hidden");
  } else {
    importWarnings.innerHTML = "";
    importWarnings.classList.add("hidden");
  }

  importPopover.showPopover();
}

function showAdjustmentPopover(firstOldMs, lastOldMs, firstNewMs, lastNewMs, scaleFactor) {
  const firstShift = firstNewMs - firstOldMs;
  const lastShift = lastNewMs - lastOldMs;

  let html = `
    <p>First subtitle: ${formatShift(firstShift)}</p>
    <p>Last subtitle: ${formatShift(lastShift)}</p>
  `;

  if (Math.abs(scaleFactor - 1) > 0.0001) {
    html += `<p>Scale factor: ${scaleFactor.toFixed(6)}x</p>`;
  }

  adjustmentStats.innerHTML = html;
  adjustmentPopover.showPopover();
}

function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const content = e.target.result;

    if (!content || content.trim().length === 0) {
      syncError.textContent = "The file is empty.";
      originalSubtitles = [];
      adjustedSubtitles = [];
      downloadContainer.style.display = "none";
      subtitleContext.style.display = "none";
      updateSyncPointsUI();
      return;
    }

    const result = parseSrt(content);
    originalSubtitles = result.subtitles;
    const warnings = result.warnings;

    if (originalSubtitles.length === 0) {
      syncError.textContent = "No valid subtitles found. Please check the SRT format.";
      adjustedSubtitles = [];
      downloadContainer.style.display = "none";
      subtitleContext.style.display = "none";
      updateSyncPointsUI();
      return;
    }

    syncError.textContent = "";
    adjustedSubtitles = [];
    downloadContainer.style.display = "none";

    renderSubtitleSamples(originalSubtitles);
    showImportPopover(originalSubtitles, warnings);
    updateSyncPointsUI();
  };
  reader.onerror = function () {
    syncError.textContent = "Error reading file. Please try again.";
  };
  reader.readAsText(file);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    handleFileUpload(file);
  }
});

fileUploadContainer.addEventListener("dragover", (e) => {
  e.preventDefault();
  fileUploadContainer.classList.add("drag-over");
});

fileUploadContainer.addEventListener("dragleave", () => {
  fileUploadContainer.classList.remove("drag-over");
});

fileUploadContainer.addEventListener("drop", (e) => {
  e.preventDefault();
  fileUploadContainer.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) {
    handleFileUpload(file);
  }
});

applyAdjustmentsBtn.addEventListener("click", () => {
  if (originalSubtitles.length === 0) return;

  const validation = validateSyncInputs();
  if (!validation.valid) {
    syncError.textContent = validation.error;
    return;
  }
  syncError.textContent = "";

  const firstSub = originalSubtitles[0];
  const lastSub = originalSubtitles[originalSubtitles.length - 1];
  const firstOldMs = firstSub.startMs;
  const lastOldMs = lastSub.startMs;
  const firstNewMs = validation.firstNewMs;
  const lastNewMs = validation.lastNewMs;

  let scaleFactor = 1;

  if (originalSubtitles.length === 1) {
    const shift = firstNewMs - firstOldMs;
    adjustedSubtitles = originalSubtitles.map((sub) => ({
      ...sub,
      startMs: Math.max(0, sub.startMs + shift),
      endMs: Math.max(0, sub.endMs + shift),
    }));
  } else {
    const timeDiff = lastOldMs - firstOldMs;
    scaleFactor = timeDiff > 0 ? (lastNewMs - firstNewMs) / timeDiff : 1;
    adjustedSubtitles = applyLinearCorrection(
      originalSubtitles,
      firstOldMs,
      lastOldMs,
      firstNewMs,
      lastNewMs
    );
  }

  downloadContainer.style.display = "block";
  showAdjustmentPopover(firstOldMs, lastOldMs, firstNewMs, lastNewMs, scaleFactor);
});

downloadBtn.addEventListener("click", () => {
  if (adjustedSubtitles.length > 0) {
    const content = serializeSrt(adjustedSubtitles);
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "adjusted_subtitles.srt";
    link.click();
    URL.revokeObjectURL(url);
  }
});

importPopover.addEventListener("toggle", (e) => {
  if (e.newState === "closed" && originalSubtitles.length > 0) {
    firstNewTimeInput.focus();
    firstNewTimeInput.select();
  }
});
