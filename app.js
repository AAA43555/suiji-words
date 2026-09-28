import { isDue, scheduleReview } from "./scheduler.mjs";
import { entryType, parseOcrText, validEntry } from "./recognition.mjs";

const STORAGE_KEY = "suiji-words-v1";
const pages = new Set(["home", "scan", "confirm", "deck", "study", "settings"]);
const $ = (selector) => document.querySelector(selector);
const state = {
  cards: loadCards(),
  page: "home",
  stream: null,
  recognizing: false,
  candidates: [],
  studyQueue: [],
  studyDone: 0,
  studyTotal: 0,
  flipped: false,
  editingId: null
};
let toastTimer;
let wordLexicon = null;

async function loadWordLexicon() {
  if (wordLexicon) return wordLexicon;
  const fallback = ["apple", "beautiful", "because", "different", "education", "example", "favorite", "language", "progress", "serendipity", "vivid"];
  try {
    const response = await fetch("./data/words.txt", { cache: "force-cache" });
    if (!response.ok) throw new Error("word list unavailable");
    const words = (await response.text()).split(/\s+/).map(word => word.trim().toLowerCase()).filter(word => /^[a-z]{2,32}$/.test(word));
    wordLexicon = new Set([...words, ...fallback]);
  } catch {
    wordLexicon = new Set(fallback);
  }
  return wordLexicon;
}

function loadCards() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter(card => card && typeof card.word === "string" && typeof card.id === "string") : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cards));
    return true;
  } catch {
    toast("保存失败：浏览器存储空间不足或已被禁用");
    return false;
  }
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 3500);
}

function navigate(page) {
  if (!pages.has(page)) return;
  if (state.page === "scan" && page !== "scan") stopCamera();
  state.page = page;
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === `page-${page}`));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.nav === page));
  window.scrollTo(0, 0);
  if (page === "home") renderHome();
  if (page === "deck") renderDeck();
  if (page === "confirm") renderCandidates();
  if (page === "study") renderStudy();
}

function renderHome() {
  const due = state.cards.filter(card => isDue(card)).length;
  $("#due-count").textContent = due;
  $("#total-count").textContent = state.cards.length;
  $("#due-caption").textContent = due ? "翻开单词卡，巩固刚好要忘记的内容。" : state.cards.length ? "今天已经复习完啦，明天再见。" : "新的一页，从第一个单词开始。";
  $("#start-review").textContent = due ? "开始复习 ↗" : "看看词库 ↗";
  $("#today-label").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
}

function formatDue(card) {
  if (isDue(card)) return "现在复习";
  const days = Math.ceil((Date.parse(card.dueAt) - Date.now()) / 86400000);
  return days <= 1 ? "明天复习" : `${days} 天后复习`;
}

function renderDeck() {
  const container = $("#word-list");
  const query = $("#search-input").value.trim().toLocaleLowerCase();
  const words = [...state.cards]
    .filter(card => `${card.word} ${card.meaning || ""}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  $("#total-count").textContent = state.cards.length;
  container.replaceChildren();
  if (!words.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = query ? "<span>⌕</span><strong>没有找到这个单词</strong><p>试试其他拼写或释义。</p>" : "<span>✦</span><strong>词库还是空的</strong><p>扫描手写本，或先手动记下第一个单词。</p>";
    container.append(empty);
    return;
  }
  for (const card of words) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "word-row";
    const icon = document.createElement("span");
    icon.className = "word-row-icon";
    icon.textContent = "▤";
    const content = document.createElement("span");
    content.className = "word-row-content";
    const word = document.createElement("strong");
    word.textContent = card.word;
    const detail = document.createElement("small");
    detail.textContent = `${entryType(card.word)} · ${card.meaning || "待添加释义"} · ${formatDue(card)}`;
    content.append(word, detail);
    const arrow = document.createElement("span");
    arrow.className = "word-row-arrow";
    arrow.textContent = "›";
    row.append(icon, content, arrow);
    row.addEventListener("click", () => openWordDialog(card));
    container.append(row);
  }
}

function makeCard(word, meaning = "", note = "") {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    word: word.trim(),
    meaning: meaning.trim(),
    note: note.trim(),
    createdAt: now,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    ease: 2.5,
    lapses: 0,
    lastReviewedAt: null
  };
}

function openWordDialog(card = null) {
  state.editingId = card?.id || null;
  $("#dialog-title").textContent = card ? "编辑单词卡" : "添加单词";
  $("#word-input").value = card?.word || "";
  $("#meaning-input").value = card?.meaning || "";
  $("#note-input").value = card?.note || "";
  $("#delete-word").hidden = !card;
  $("#word-dialog").showModal();
  setTimeout(() => $("#word-input").focus(), 30);
}

function renderCandidates() {
  $("#result-count").textContent = `${state.candidates.length} 个候选词`;
  const list = $("#results-list");
  list.replaceChildren();
  if (!state.candidates.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<span>✎</span><strong>没有识别出单词</strong><p>可以手动添加一行，或返回重新扫描。</p>";
    list.append(empty);
    return;
  }
  state.candidates.forEach((candidate, index) => {
    const row = document.createElement("div");
    row.className = "result-row";
    const head = document.createElement("div");
    head.className = "result-row-head";
    const number = document.createElement("span");
    number.textContent = `单词 ${String(index + 1).padStart(2, "0")}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "移除";
    remove.addEventListener("click", () => { state.candidates.splice(index, 1); renderCandidates(); });
    head.append(number, remove);
    const wordLabel = document.createElement("label");
    wordLabel.textContent = "英文单词 / 短语 / 例句";
    const wordInput = document.createElement("input");
    wordInput.value = candidate.word;
    wordInput.placeholder = "请填写英文单词";
    wordInput.autocapitalize = "none";
    wordInput.addEventListener("input", () => candidate.word = wordInput.value);
    wordLabel.append(wordInput);
    const meaningLabel = document.createElement("label");
    meaningLabel.textContent = "中文释义";
    const meaningInput = document.createElement("input");
    meaningInput.value = candidate.meaning;
    meaningInput.placeholder = "可选，建议补充释义";
    meaningInput.addEventListener("input", () => candidate.meaning = meaningInput.value);
    meaningLabel.append(meaningInput);
    row.append(head, wordLabel, meaningLabel);
    list.append(row);
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("当前浏览器不支持摄像头，请用 HTTPS 打开或手动添加");
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const video = $("#camera-video");
    video.srcObject = state.stream;
    await video.play();
    $(".camera-panel").classList.add("live");
    $("#camera-action").textContent = "识别当前画面";
    $("#camera-close").hidden = false;
  } catch (error) {
    toast(error.name === "NotAllowedError" ? "请在浏览器里允许摄像头权限" : "无法打开摄像头，请检查 HTTPS 和权限");
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach(track => track.stop());
  state.stream = null;
  $("#camera-video").srcObject = null;
  $(".camera-panel").classList.remove("live");
  $("#camera-action").textContent = "打开摄像头";
  $("#camera-close").hidden = true;
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js";
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("OCR unavailable"));
    script.onerror = () => reject(new Error("OCR download failed"));
    document.head.append(script);
  });
}

async function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Frame capture failed")), "image/png"));
}

async function makeHandwritingVariants(source) {
  const variants = [];
  const marginX = Math.round(source.width * 0.035);
  const marginY = Math.round(source.height * 0.035);
  const cropW = source.width - marginX * 2;
  const cropH = source.height - marginY * 2;
  const scale = Math.min(2.2, Math.max(1.25, 1800 / Math.max(cropW, cropH)));
  const width = Math.round(cropW * scale);
  const height = Math.round(cropH * scale);
  const base = document.createElement("canvas");
  base.width = width;
  base.height = height;
  const ctx = base.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, marginX, marginY, cropW, cropH, 0, 0, width, height);
  variants.push(await canvasToBlob(base));
  const image = ctx.getImageData(0, 0, width, height);
  const processed = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      let local = 0;
      let count = 0;
      for (let yy = Math.max(0, y - 8); yy <= Math.min(height - 1, y + 8); yy += 4) {
        for (let xx = Math.max(0, x - 8); xx <= Math.min(width - 1, x + 8); xx += 4) {
          const q = (yy * width + xx) * 4;
          local += image.data[q] * 0.299 + image.data[q + 1] * 0.587 + image.data[q + 2] * 0.114;
          count++;
        }
      }
      const q = p * 4;
      const luminance = image.data[q] * 0.299 + image.data[q + 1] * 0.587 + image.data[q + 2] * 0.114;
      const ink = luminance < local / count - 8 ? 22 : 247;
      processed.data[q] = ink;
      processed.data[q + 1] = ink;
      processed.data[q + 2] = ink;
      processed.data[q + 3] = 255;
    }
  }
  ctx.putImageData(processed, 0, 0);
  variants.push(await canvasToBlob(base));
  base.width = 0;
  base.height = 0;
  return variants;
}

async function recognizeFrame() {
  if (!state.stream || state.recognizing) return;
  const video = $("#camera-video");
  if (!video.videoWidth || !video.videoHeight) {
    toast("摄像头画面还没准备好，请稍等一下");
    return;
  }
  state.recognizing = true;
  $("#camera-action").disabled = true;
  $("#ocr-progress").hidden = false;
  $("#ocr-status").textContent = "正在读取当前画面…";
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 2200 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  stopCamera();
  let worker;
  try {
    const variants = await makeHandwritingVariants(canvas);
    canvas.width = 0;
    canvas.height = 0;
    $("#ocr-status").textContent = "首次使用需下载识别模型，请稍等…";
    const tesseract = await loadTesseract();
    worker = await tesseract.createWorker(["eng", "chi_sim"], 1, {
      logger: event => {
        if (event.status === "recognizing text" && event.progress != null) {
          $("#ocr-status").textContent = "正在增强识别 " + Math.round((event.progress || 0) * 100) + "%";
        }
      }
    });
    const lexicon = await loadWordLexicon();
    const candidates = [];
    for (const [index, variant] of variants.entries()) {
      await worker.setParameters({ tessedit_pageseg_mode: ["6", "11"][index], preserve_interword_spaces: "1" });
      const { data } = await worker.recognize(variant);
      candidates.push(...parseOcrText(data.text, lexicon));
    }
    const seen = new Set();
    state.candidates = candidates.filter(candidate => {
      const key = candidate.word.toLocaleLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 40);
    navigate("confirm");
    if (!state.candidates.length) toast("未找到清晰的英文单词，可以手动补充");
  } catch (error) {
    console.error("OCR failed", error);
    toast("识别失败，请检查网络代理后重试，或手动添加单词");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    await worker?.terminate().catch(() => {});
    state.recognizing = false;
    $("#camera-action").disabled = false;
    $("#ocr-progress").hidden = true;
  }
}

function startReview() {
  state.studyQueue = state.cards.filter(card => isDue(card)).map(card => card.id);
  state.studyTotal = state.studyQueue.length;
  state.studyDone = 0;
  state.flipped = false;
  if (!state.studyTotal) {
    navigate("deck");
    toast(state.cards.length ? "今天的单词已经复习完了" : "先添加一个单词，再来复习");
    return;
  }
  navigate("study");
}

function renderStudy() {
  const id = state.studyQueue[0];
  const card = state.cards.find(item => item.id === id);
  if (!card) {
    navigate("home");
    toast("今天的复习完成了");
    return;
  }
  $("#study-progress-text").textContent = `第 ${state.studyDone + 1} / ${state.studyTotal} 张`;
  $("#study-progress-fill").style.width = `${Math.round(state.studyDone / state.studyTotal * 100)}%`;
  $("#flashcard-word").textContent = card.word;
  $("#flashcard-word").classList.toggle("long-text", card.word.length > 42);
  $("#flashcard-hint").textContent = state.flipped ? (card.meaning || "还没有释义，去词库补充吧") + (card.note ? `\n${card.note}` : "") : "轻点下方按钮查看释义";
  $("#flashcard-hint").style.whiteSpace = "pre-line";
  $("#flashcard").classList.toggle("flipped", state.flipped);
  $("#flip-card").hidden = state.flipped;
  $("#rating-wrap").hidden = !state.flipped;
}

function gradeCurrent(grade) {
  const id = state.studyQueue.shift();
  const index = state.cards.findIndex(card => card.id === id);
  if (index < 0) return;
  state.cards[index] = scheduleReview(state.cards[index], grade);
  persist();
  state.studyDone += 1;
  state.flipped = false;
  if (state.studyQueue.length) renderStudy();
  else {
    navigate("home");
    toast(`完成 ${state.studyDone} 张，做得好！`);
  }
}

function exportData() {
  const data = JSON.stringify({ app: "随记单词", version: 1, exportedAt: new Date().toISOString(), cards: state.cards }, null, 2);
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  link.href = url;
  link.download = `随记单词-备份-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.cards)) throw new Error("Invalid backup");
    const existing = new Set(state.cards.map(card => card.word.trim().toLocaleLowerCase()));
    let added = 0;
    for (const row of data.cards.slice(0, 10000)) {
      if (!row || typeof row.word !== "string" || !validEntry(row.word)) continue;
      const key = row.word.trim().toLocaleLowerCase();
      if (existing.has(key)) continue;
      const card = makeCard(row.word, typeof row.meaning === "string" ? row.meaning : "", typeof row.note === "string" ? row.note : "");
      if (Number.isFinite(Date.parse(row.dueAt))) card.dueAt = row.dueAt;
      if (Number.isFinite(Number(row.intervalDays))) card.intervalDays = Math.max(0, Math.min(36500, Number(row.intervalDays)));
      if (Number.isFinite(Number(row.ease))) card.ease = Math.max(1.3, Math.min(3, Number(row.ease)));
      if (Number.isFinite(Number(row.repetitions))) card.repetitions = Math.max(0, Math.min(10000, Number(row.repetitions)));
      state.cards.push(card);
      existing.add(key);
      added++;
    }
    persist();
    renderHome();
    toast(`已导入 ${added} 张单词卡`);
  } catch {
    toast("导入失败：请选择随记单词导出的 JSON 备份");
  }
}

document.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.nav)));
$("#open-settings").addEventListener("click", () => navigate("settings"));
$("#start-review").addEventListener("click", () => state.cards.some(card => isDue(card)) ? startReview() : navigate("deck"));
$("#home-add").addEventListener("click", () => openWordDialog());
$("#deck-add").addEventListener("click", () => openWordDialog());
$("#search-input").addEventListener("input", renderDeck);
$("#camera-action").addEventListener("click", () => state.stream ? recognizeFrame() : startCamera());
$("#camera-close").addEventListener("click", stopCamera);
$("#add-result").addEventListener("click", () => { state.candidates.push({ word: "", meaning: "" }); renderCandidates(); });
$("#save-results").addEventListener("click", () => {
  const existing = new Set(state.cards.map(card => card.word.trim().toLocaleLowerCase()));
  let added = 0;
  let invalid = 0;
  for (const row of state.candidates) {
    const word = row.word.trim();
    if (!validEntry(word)) { invalid++; continue; }
    const key = word.toLocaleLowerCase();
    if (existing.has(key)) continue;
    state.cards.push(makeCard(word, row.meaning));
    existing.add(key);
    added++;
  }
  if (!added && invalid) { toast("请先填写有效的英文单词"); return; }
  if (added) persist();
  state.candidates = [];
  navigate("deck");
  toast(added ? `已加入 ${added} 张单词卡${invalid ? `，跳过 ${invalid} 行` : ""}` : "这些单词已经在词库里了");
});
$("#flip-card").addEventListener("click", () => { state.flipped = true; renderStudy(); });
document.querySelectorAll("[data-grade]").forEach(button => button.addEventListener("click", () => gradeCurrent(button.dataset.grade)));
$("#close-dialog").addEventListener("click", () => $("#word-dialog").close());
$("#word-form").addEventListener("submit", event => {
  event.preventDefault();
  const word = $("#word-input").value.trim();
  if (!validEntry(word)) { toast("请输入英文单词、短语或例句"); return; }
  const duplicate = state.cards.find(card => card.id !== state.editingId && card.word.toLocaleLowerCase() === word.toLocaleLowerCase());
  if (duplicate) { toast("这个单词已在词库里"); return; }
  const card = state.cards.find(item => item.id === state.editingId);
  if (card) {
    card.word = word;
    card.meaning = $("#meaning-input").value.trim();
    card.note = $("#note-input").value.trim();
  } else state.cards.push(makeCard(word, $("#meaning-input").value, $("#note-input").value));
  persist();
  $("#word-dialog").close();
  renderHome();
  if (state.page === "deck") renderDeck();
  toast(card ? "单词卡已更新" : "已加入词库");
});
$("#delete-word").addEventListener("click", () => {
  const card = state.cards.find(item => item.id === state.editingId);
  if (!card || !confirm(`删除「${card.word}」这张单词卡？`)) return;
  state.cards = state.cards.filter(item => item.id !== card.id);
  persist();
  $("#word-dialog").close();
  renderHome();
  renderDeck();
  toast("单词卡已删除");
});
$("#export-data").addEventListener("click", exportData);
$("#import-data").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", event => { if (event.target.files[0]) importData(event.target.files[0]); event.target.value = ""; });
window.addEventListener("pagehide", stopCamera);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
renderHome();
