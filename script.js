console.log('BUILD MARKER ZZZ5');

(() => {
  'use strict';

// ====== 基本設定 ======
const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
const CANVAS_SIZE = 200;
let bgTransparent = true;
let exportSize = 200;

// ---- デフォルト（スマホ見栄え寄り） ----
const DEFAULTS = {
  STROKE_W: 8,  // 吹き出しの線の太さ（px）
  TAIL_W: 30,   // しっぽの幅（px）
};

const IS_MOBILE = window.matchMedia('(max-width: 480px)').matches;
// 見た目は小さく、ヒットはそのまま
let HANDLE_SIZE = IS_MOBILE ? 12 : 8;    // ⬛︎の実寸（従来 16/10）
let HANDLE_HIT  = IS_MOBILE ? 22 : 14;   // 当たり判定
let TAIL_HIT_R  = IS_MOBILE ? 26 : 18;
let TAIL_BASE_HIT_R = IS_MOBILE ? 22 : 14;
// 新規：オレンジ○の見た目半径
let TAIL_TIP_DRAW_R  = IS_MOBILE ? 5.5 : 4.5; // 先端○
let TAIL_BASE_DRAW_R = IS_MOBILE ? 5.0 : 4.0; // 基点○（輪）

window.addEventListener('resize', () => {
  const m = matchMedia('(max-width: 480px)').matches;
  HANDLE_SIZE = m ? 12 : 8;
  HANDLE_HIT  = m ? 22 : 14;
  TAIL_HIT_R  = m ? 26 : 18;
  TAIL_BASE_HIT_R = m ? 22 : 14;
  TAIL_TIP_DRAW_R  = m ? 5.5 : 4.5;
  TAIL_BASE_DRAW_R = m ? 5.0 : 4.0;
}, { passive: true });

// 論理座標は固定（見た目サイズはCSS、内部解像度はDPRで強化）
function setupCanvasResolution() {
  const rect = canvas.getBoundingClientRect();
  const displayW = Math.max(1, Math.round(rect.width || CANVAS_SIZE));
  const displayH = Math.max(1, Math.round(rect.height || CANVAS_SIZE));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pixelW = Math.round(displayW * dpr);
  const pixelH = Math.round(displayH * dpr);

  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }

  // 論理座標(0..CANVAS_SIZE)をそのまま使えるように変換
  ctx.setTransform(canvas.width / CANVAS_SIZE, 0, 0, canvas.height / CANVAS_SIZE, 0, 0);
}

// 角丸長方形の統一半径（描画・ヒット・書き出しで共通）
const RECT_R = 18;

// ====== 状態管理 ======
const state = {
  elements: [],       // {id, type, x,y, w,h, hidden:false, locked:false, ...}
  selectedId: null,
  history: [],
  future: [],
};

// スナップ＆ガイド
const guides = { x: null, y: null, active: false, threshold: 6 };
const snapLinesX = [0, CANVAS_SIZE / 2, CANVAS_SIZE];
const snapLinesY = [0, CANVAS_SIZE / 2, CANVAS_SIZE];

function snapshot() {
  // 画像も含めて復元できる形で履歴保存（背景状態も一緒に）
  const snap = {
    elements: serializeElements(state.elements),
    bgTransparent,
  };
  state.history.push(JSON.stringify(snap));
  if (state.history.length > 50) state.history.shift();
  state.future = [];
}

function undo() {
  if (!state.history.length) return;

  // 現在状態を future へ（こちらも復元可能な形で）
  const cur = {
    elements: serializeElements(state.elements),
    bgTransparent,
  };
  state.future.push(JSON.stringify(cur));

  // 直前スナップショットへ復元
  const prev = JSON.parse(state.history.pop());
  state.elements = reviveElements(prev.elements || []);
  bgTransparent = !!prev.bgTransparent;
  state.selectedId = state.elements.at(-1)?.id || null;
  updateUIFromSelection();
  draw();
}

function redo() {
  if (!state.future.length) return;

  // 現在状態を history へ
  const cur = {
    elements: serializeElements(state.elements),
    bgTransparent,
  };
  state.history.push(JSON.stringify(cur));

  // future から取り出して復元
  const next = JSON.parse(state.future.pop());
  state.elements = reviveElements(next.elements || []);
  bgTransparent = !!next.bgTransparent;
  state.selectedId = state.elements.at(-1)?.id || null;
  updateUIFromSelection();
  draw();
}

// ====== オートセーブ ======
const LS_KEY = 'stampMakerStateV1';

function serializeElements(els){
  return els.map(el => {
    if (el.type !== 'image') return el;

    const sourceDataUrl = el.originalDataUrl
      || (typeof el.img?.src === 'string' && el.img.src.startsWith('data:') ? el.img.src : null)
      || el.dataUrl
      || null;

    const { img, dataUrl, ...rest } = el;
    return {
      ...rest,
      originalDataUrl: sourceDataUrl,
      naturalWidth: el.naturalWidth || el.img?.naturalWidth || null,
      naturalHeight: el.naturalHeight || el.img?.naturalHeight || null,
    };
  });
}

function reviveElements(raw){
  const out = [];
  for (const el of raw) {
    if (el.type === 'image') {
      const sourceDataUrl = el.originalDataUrl || el.dataUrl || null; // dataUrlは旧互換
      if (!sourceDataUrl) {
        const { img, ...rest } = el;
        out.push(rest);
        continue;
      }
      const img = new Image();
      img.onload = () => draw();
      img.src = sourceDataUrl;
      const { dataUrl, ...rest } = el;
      out.push({
        ...rest,
        originalDataUrl: sourceDataUrl,
        naturalWidth: rest.naturalWidth || null,
        naturalHeight: rest.naturalHeight || null,
        img,
      });
    } else {
      out.push(normalizeTextElement(el));
    }
  }
  return out;
}

let saveTimer = null;
function saveLocal(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    const payload = {
      bgTransparent,
      exportSize,
      elements: serializeElements(state.elements),
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch {}
  }, 250);
}

function loadLocal(){
  try {
    const s = localStorage.getItem(LS_KEY);
    if (!s) return;
    const parsed = JSON.parse(s);
    bgTransparent = !!parsed.bgTransparent;
    exportSize = parsed.exportSize || 200;
    state.elements = reviveElements(parsed.elements || []);
    state.selectedId = state.elements.at(-1)?.id || null;
    updateUIFromSelection();
  } catch(e){
    console.warn('loadLocal failed', e);
  }
}

// ====== 要素生成 ======
const genId = () => Math.random().toString(36).slice(2, 9);

const TEXT_PRESETS = {
  standard: {
    name: '標準',
    color: '#111111',
    lineHeight: 1.2,
    strokeEnabled: false,
    strokeColor: '#000000',
    strokeWidth: 3,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fontWeight: 700,
  },
  whiteBlack: {
    name: '白文字＋黒縁',
    color: '#ffffff',
    lineHeight: 1.2,
    strokeEnabled: true,
    strokeColor: '#111111',
    strokeWidth: 4,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fontWeight: 800,
  },
  blackWhite: {
    name: '黒文字＋白縁',
    color: '#111111',
    lineHeight: 1.2,
    strokeEnabled: true,
    strokeColor: '#ffffff',
    strokeWidth: 4,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.2)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fontWeight: 800,
  },
  softShadow: {
    name: 'ふんわり影',
    color: '#ffffff',
    lineHeight: 1.25,
    strokeEnabled: true,
    strokeColor: '#1f2937',
    strokeWidth: 2,
    shadowEnabled: true,
    shadowColor: 'rgba(0,0,0,0.35)',
    shadowBlur: 6,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    fontWeight: 800,
  },
  strong: {
    name: '強調',
    color: '#ffe45e',
    lineHeight: 1.1,
    strokeEnabled: true,
    strokeColor: '#111111',
    strokeWidth: 5,
    shadowEnabled: true,
    shadowColor: 'rgba(0,0,0,0.4)',
    shadowBlur: 4,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    fontWeight: 900,
  },
  lineStamp: {
    name: 'LINE風',
    color: '#ffffff',
    lineHeight: 1.15,
    strokeEnabled: true,
    strokeColor: '#00b900',
    strokeWidth: 6,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.2)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fontWeight: 900,
  },
};
let defaultTextPreset = 'standard';

const TEMPLATES = [
  {
    id: 'tsukkomi',
    name: 'ツッコミ',
    bubble: { shape: 'round', x: 104, y: 88, w: 132, h: 96, strokeW: 7, tail: { angle: Math.PI / 3.2, length: 34, width: 24 } },
    text: { text: 'それな', x: 104, y: 84, size: 34, preset: 'blackWhite', maxWidth: 118, lineHeight: 1.2 },
  },
  {
    id: 'sakebi',
    name: '叫び',
    bubble: { shape: 'burst', x: 102, y: 88, w: 138, h: 106, strokeW: 9, tail: { enabled: false } },
    text: { text: 'ええ!?', x: 102, y: 86, size: 40, preset: 'strong', maxWidth: 122, lineHeight: 1.08 },
  },
  {
    id: 'hitokoto',
    name: 'ひとこと',
    bubble: { shape: 'rect', x: 100, y: 92, w: 130, h: 90, strokeW: 6, tail: { angle: Math.PI / 2.9, length: 26, width: 20 } },
    text: { text: '了解', x: 100, y: 90, size: 30, preset: 'standard', maxWidth: 110, lineHeight: 1.2 },
  },
  {
    id: 'line',
    name: 'LINE風',
    bubble: { shape: 'round', x: 102, y: 92, w: 134, h: 92, strokeW: 5, tail: { angle: Math.PI / 2.7, length: 24, width: 18 } },
    text: { text: 'おつかれ！', x: 102, y: 90, size: 28, preset: 'standard', maxWidth: 118, lineHeight: 1.25 },
  },
  {
    id: 'stamp',
    name: 'スタンプ風',
    bubble: null,
    text: { text: '最高', x: 100, y: 100, size: 42, preset: 'whiteBlack', maxWidth: 140, lineHeight: 1.12 },
  },
];

function applyTextPresetToElement(el, presetName) {
  const preset = TEXT_PRESETS[presetName] || TEXT_PRESETS.standard;
  el.presetName = presetName in TEXT_PRESETS ? presetName : 'standard';
  el.color = preset.color;
  el.lineHeight = preset.lineHeight;
  el.strokeEnabled = preset.strokeEnabled;
  el.strokeColor = preset.strokeColor;
  el.strokeWidth = preset.strokeWidth;
  el.shadowEnabled = preset.shadowEnabled;
  el.shadowColor = preset.shadowColor;
  el.shadowBlur = preset.shadowBlur;
  el.shadowOffsetX = preset.shadowOffsetX;
  el.shadowOffsetY = preset.shadowOffsetY;
  el.fontWeight = preset.fontWeight;
}

function normalizeTextElement(el) {
  if (!el || el.type !== 'text') return el;
  if (!el.presetName) el.presetName = defaultTextPreset;
  if (el.maxWidth == null) el.maxWidth = 160;
  if (el.lineHeight == null) el.lineHeight = 1.2;
  if (el.strokeEnabled == null) el.strokeEnabled = false;
  if (!el.strokeColor) el.strokeColor = '#000000';
  if (el.strokeWidth == null) el.strokeWidth = 3;
  if (el.shadowEnabled == null) el.shadowEnabled = false;
  if (!el.shadowColor) el.shadowColor = 'rgba(0,0,0,0.25)';
  if (el.shadowBlur == null) el.shadowBlur = 0;
  if (el.shadowOffsetX == null) el.shadowOffsetX = 0;
  if (el.shadowOffsetY == null) el.shadowOffsetY = 0;
  if (el.fontWeight == null) el.fontWeight = 700;
  return el;
}

function createBubbleElement(config = {}) {
  const swInput = document.getElementById('strokeWidth');
  const twInput = document.getElementById('tailWidth');
  return {
    id: genId(),
    type: 'bubble',
    shape: config.shape ?? 'round',
    x: config.x ?? (CANVAS_SIZE / 2),
    y: config.y ?? (CANVAS_SIZE / 2),
    w: config.w ?? 150,
    h: config.h ?? 110,
    hidden: false,
    locked: false,
    fill: config.fill ?? document.getElementById('fillColor').value,
    stroke: config.stroke ?? document.getElementById('strokeColor').value,
    strokeW: config.strokeW ?? parseInt(swInput?.value ?? DEFAULTS.STROKE_W, 10),
    tail: {
      angle: config.tail?.angle ?? Math.PI / 6,
      length: config.tail?.length ?? 40,
      width: config.tail?.width ?? parseInt(twInput?.value ?? DEFAULTS.TAIL_W, 10),
      enabled: config.tail?.enabled ?? (config.shape !== 'burst'),
      skew: config.tail?.skew ?? 0,
    }
  };
}

function createTextElement(config = {}) {
  const fsInput = document.getElementById('fontSize');
  const textEl = normalizeTextElement({
    id: genId(),
    type: 'text',
    x: config.x ?? 150,
    y: config.y ?? 150,
    hidden: false,
    locked: false,
    text: config.text ?? (document.getElementById('textInput').value || 'テキスト'),
    color: config.color ?? document.getElementById('textColor').value,
    size: config.size ?? parseInt(fsInput?.value ?? 32, 10),
    font: config.font ?? document.getElementById('fontFamily').value,
    align: 'center',
    maxWidth: config.maxWidth ?? 160,
    lineHeight: config.lineHeight ?? 1.2,
    presetName: config.preset ?? defaultTextPreset,
  });
  applyTextPresetToElement(textEl, textEl.presetName);
  if (config.color) textEl.color = config.color;
  if (config.lineHeight) textEl.lineHeight = config.lineHeight;
  if (config.maxWidth) textEl.maxWidth = config.maxWidth;
  return textEl;
}

function addBubble(shape = 'round') {
  snapshot();
  const el = createBubbleElement({ shape });
  state.elements.push(el);
  state.selectedId = el.id;
  updateUIFromSelection();
  draw();
}

function addText() {
  snapshot();
  const textEl = createTextElement({});
  state.elements.push(textEl);
  state.selectedId = state.elements.at(-1)?.id || null;
  updateUIFromSelection();
  draw();
}

function applyTemplate(templateId) {
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) return;

  snapshot();

  const created = [];
  if (template.bubble) {
    const bubbleEl = createBubbleElement(template.bubble);
    state.elements.push(bubbleEl);
    created.push(bubbleEl);
  }

  if (template.text) {
    const textEl = createTextElement(template.text);
    state.elements.push(textEl);
    created.push(textEl);
  }

  if (!created.length) return;

  state.selectedId = created.at(-1).id;
  updateUIFromSelection();
  draw();
}

function addImage(file) {
  console.log('[addImage] file:', file && file.name, file && file.size);
  const reader = new FileReader();
  reader.onload = () => {
    const originalDataUrl = reader.result;
    if (typeof originalDataUrl !== 'string') return;

    const img = new Image();
    img.onload = async () => {
    try {
      try { await img.decode?.(); } catch {}

      snapshot();

      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) { console.error('[addImage] invalid image size'); return; }

      const maxW = CANVAS_SIZE;
      const maxH = CANVAS_SIZE;
      const scale = Math.min(maxW / iw, maxH / ih, 1);
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));

      state.elements.push({
        id: genId(),
        type: 'image',
        x: (CANVAS_SIZE - w) / 2 + w / 2,
        y: (CANVAS_SIZE - h) / 2 + h / 2,
        w, h,
        img,
        originalDataUrl,
        naturalWidth: iw,
        naturalHeight: ih,
        hidden: false, locked: false
      });
      state.selectedId = state.elements.at(-1)?.id || null;
      updateUIFromSelection();

      const btn = document.getElementById('centerUploadBtn');
      if (btn) btn.style.display = 'none';
      draw();
    } catch (err) {
      console.error('[addImage] onload handler error', err);
    }
    };
    img.onerror = (e) => console.error('[addImage] failed to load image', e);
    img.src = originalDataUrl;
  };
  reader.onerror = (e) => console.error('[addImage] failed to read image file', e);
  reader.readAsDataURL(file);
}

// ベース画像（最初の image 要素）をキャンバス中央＆フィットに戻す
function resetBaseImage(){
  const imgEl = state.elements.find(el => el.type === 'image');
  if (!imgEl || !imgEl.img) return;

  snapshot();

  const iw = imgEl.img.naturalWidth || imgEl.img.width;
  const ih = imgEl.img.naturalHeight || imgEl.img.height;
  if (!iw || !ih) return;

  const scale = Math.min(CANVAS_SIZE / iw, CANVAS_SIZE / ih, 1);
  imgEl.w = Math.max(1, Math.round(iw * scale));
  imgEl.h = Math.max(1, Math.round(ih * scale));
  imgEl.x = CANVAS_SIZE / 2;
  imgEl.y = CANVAS_SIZE / 2;

  draw();
}

function resetAll() {
  // ローカル保存も消して、完全に最初から
  try { localStorage.removeItem(LS_KEY); } catch {}

  // 状態まっさら
  state.elements = [];
  state.selectedId = null;
  state.history = [];
  state.future = [];

  // 初期UI値（必要なら調整）
  bgTransparent = true;
  exportSize = 200;

  // 中央のアップロードボタンを再表示
  const btn = document.getElementById('centerUploadBtn');
  if (btn) btn.style.display = 'block';

  // 画面更新（空状態を保存し直す）
  draw();
}

// ====== 描画 ======
function drawBackground() {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  if (!bgTransparent) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }
}

function drawBubble(el) {
  paintBubble(ctx, el);
}

function getEffectiveTailBaseHalf(el) {
  const raw = Math.max(6, (el.tail?.width || 24) / 2);
  const maxHalf = Math.min(el.w, el.h) * 0.18;
  return Math.min(raw, maxHalf);
}

function normalizeVec(x, y, fallback = { x: 1, y: 0 }) {
  const len = Math.hypot(x, y);
  if (!len) return fallback;
  return { x: x / len, y: y / len };
}

function tailTipWorld(el, attach = null) {
  const a = attach || edgePointForShape(el, el.tail?.angle ?? 0);
  const angle = el.tail?.angle ?? 0;
  const length = el.tail?.length ?? 0;
  return {
    x: a.x + Math.cos(angle) * length,
    y: a.y + Math.sin(angle) * length,
  };
}

function getEllipseAttachData(el) {
  const rx = Math.max(1, el.w / 2);
  const ry = Math.max(1, el.h / 2);
  const tip = tailTipWorld(el, { x: el.x, y: el.y });
  const vx = tip.x - el.x;
  const vy = tip.y - el.y;
  const theta = Math.atan2(vy / ry, vx / rx);

  const px = rx * Math.cos(theta);
  const py = ry * Math.sin(theta);
  const attach = { x: el.x + px, y: el.y + py };

  const normal = normalizeVec(px / (rx * rx), py / (ry * ry));
  const tangent = normalizeVec(-normal.y, normal.x);

  return {
    attach,
    tangent,
    normal,
    baseHalf: getEffectiveTailBaseHalf(el),
    angle: el.tail?.angle ?? 0,
  };
}

function getRoundedRectAttachData(el) {
  const angle = el.tail?.angle ?? 0;
  const attach = edgePointForShape(el, angle);
  const normal = normalizeVec(Math.cos(angle), Math.sin(angle));
  const tangent = normalizeVec(-Math.sin(angle), Math.cos(angle));
  return {
    attach,
    tangent,
    normal,
    baseHalf: getEffectiveTailBaseHalf(el),
    angle,
  };
}

function getBubbleAttachData(el) {
  if (el.shape === 'round') return getEllipseAttachData(el);
  return getRoundedRectAttachData(el);
}

function drawBubbleBodyPath(c, el) {
  const w = el.w;
  const h = el.h;

  if (el.shape === 'round') {
    c.ellipse(el.x, el.y, w / 2, h / 2, 0, 0, Math.PI * 2);
    return;
  }

  c.save();
  c.translate(el.x, el.y);
  if (el.shape === 'rect') {
    const rr = Math.min(RECT_R, w / 2, h / 2);
    c.moveTo(-w/2 + rr, -h/2);
    c.arcTo(w/2, -h/2,  w/2,  h/2, rr);
    c.arcTo(w/2,  h/2, -w/2,  h/2, rr);
    c.arcTo(-w/2, h/2, -w/2, -h/2, rr);
    c.arcTo(-w/2, -h/2,  w/2, -h/2, rr);
    c.closePath();
  } else if (el.shape === 'cloud' || el.shape === 'thought') {
    const a = Math.min(w, h)/2;
    c.arc(a*0.8 - w/2, a*0.9 - h/2, a*0.55, 0, Math.PI*2);
    c.arc(a*1.2 - w/2, a*0.7 - h/2, a*0.6, 0, Math.PI*2);
    c.arc(a*1.6 - w/2, a*0.9 - h/2, a*0.5, 0, Math.PI*2);
    c.arc(a*1.2 - w/2, a*1.2 - h/2, a*0.6, 0, Math.PI*2);
  } else if (el.shape === 'burst') {
    const spikes = 12;
    const R = Math.min(w, h) * 0.50;
    const r = R * 0.62;
    const step = (Math.PI * 2) / (spikes * 2);
    c.moveTo(R, 0);
    for (let i = 1; i < spikes * 2; i++) {
      const ang = i * step;
      const rad = (i % 2 === 0) ? R : r;
      c.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    c.closePath();
  } else {
    c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  }
  c.restore();
}

function paintBubble(c, el, opts = {}) {
  const canvasSize = opts.canvasSize || CANVAS_SIZE;

  c.save();
  c.fillStyle = el.fill;
  c.beginPath();
  drawBubbleBodyPath(c, el);
  c.closePath();
  c.fill();
  c.restore();

  c.save();
  c.strokeStyle = el.stroke;
  c.lineWidth = el.strokeW;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.miterLimit = 3;
  c.beginPath();
  drawBubbleBodyPath(c, el);
  c.closePath();
  c.stroke();
  c.restore();

  const canTail = el.tail && el.tail.enabled && el.shape !== 'thought' && el.shape !== 'burst';
  if (!canTail) return;

  const attachData = getBubbleAttachData(el);
  const tip = tailTipWorld(el, attachData.attach);
  const n = attachData.normal;
  const t = attachData.tangent;
  const half = attachData.baseHalf;
  const rootL = { x: attachData.attach.x - t.x * half, y: attachData.attach.y - t.y * half };
  const rootR = { x: attachData.attach.x + t.x * half, y: attachData.attach.y + t.y * half };
  const inset = Math.max(0.4, el.strokeW * 0.18);
  const rootLIn = { x: rootL.x - n.x * inset, y: rootL.y - n.y * inset };
  const rootRIn = { x: rootR.x - n.x * inset, y: rootR.y - n.y * inset };

  c.save();
  c.fillStyle = el.fill;
  c.beginPath();
  c.moveTo(rootLIn.x, rootLIn.y);
  c.lineTo(tip.x, tip.y);
  c.lineTo(rootRIn.x, rootRIn.y);
  c.closePath();
  c.fill();
  c.restore();

  c.save();
  c.beginPath();
  c.rect(0, 0, canvasSize, canvasSize);
  drawBubbleBodyPath(c, el);
  c.closePath();
  c.clip('evenodd');

  c.strokeStyle = el.stroke;
  c.lineWidth = el.strokeW;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(rootL.x, rootL.y);
  c.lineTo(tip.x, tip.y);
  c.lineTo(rootR.x, rootR.y);
  c.stroke();
  c.restore();

  c.save();
  c.fillStyle = el.fill;
  c.beginPath();
  c.arc(attachData.attach.x, attachData.attach.y, Math.max(0.4, el.strokeW * 0.32), 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// 楕円外周
function ellipseEdgePoint(cx, cy, rx, ry, angle) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const t  = 1 / Math.sqrt((ca*ca)/(rx*rx) + (sa*sa)/(ry*ry));
  return { x: cx + t*ca, y: cy + t*sa };
}

// 角丸長方形 SDF
function sdfRoundedRect(px, py, w, h, r) {
  const qx  = Math.abs(px) - (w/2 - r);
  const qy  = Math.abs(py) - (h/2 - r);
  const qx2 = Math.max(qx, 0), qy2 = Math.max(qy, 0);
  return Math.hypot(qx2, qy2) + Math.min(Math.max(qx, qy), 0) - r;
}

// 角丸長方形の外周点（レイで二分探索）
function roundedRectEdgePoint(cx, cy, w, h, r, angle) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  let t0 = 0, t1 = Math.max(w, h);
  for (let i = 0; i < 22; i++) {
    const tm = (t0 + t1) / 2;
    const px = tm * ca, py = tm * sa;
    const d  = sdfRoundedRect(px, py, w, h, r);
    if (d > 0) t1 = tm; else t0 = tm;
  }
  const t = (t0 + t1) / 2;
  return { x: cx + t*ca, y: cy + t*sa };
}

function edgePointForShape(el, angle) {
  if (el.shape === 'rect') {
    const r = 18;
    return roundedRectEdgePoint(el.x, el.y, el.w, el.h, r, angle);
  }
  return ellipseEdgePoint(el.x, el.y, el.w/2, el.h/2, angle);
}

function roundedRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
function cloudPath(w, h) {
  const a = Math.min(w, h)/2;
  ctx.save(); ctx.translate(-w/2, -h/2);
  ctx.beginPath();
  ctx.arc(a*0.8, a*0.9, a*0.55, 0, Math.PI*2);
  ctx.arc(a*1.2, a*0.7, a*0.6, 0, Math.PI*2);
  ctx.arc(a*1.6, a*0.9, a*0.5, 0, Math.PI*2);
  ctx.arc(a*1.2, a*1.2, a*0.6, 0, Math.PI*2);
  ctx.closePath();
  ctx.restore();
}
function thoughtPath(w, h) {
  cloudPath(w*0.9, h*0.9);
  ctx.moveTo(w*0.1 - w/2, h*0.4 - h/2);
  ctx.arc(w*0.1 - w/2, h*0.4 - h/2, 8, 0, Math.PI*2);
  ctx.moveTo(w*0.05 - w/2, h*0.55 - h/2);
  ctx.arc(w*0.05 - w/2, h*0.55 - h/2, 5, 0, Math.PI*2);
}

// 爆発（星型スパイク）パス
function burstPath(w, h, spikes = 12, innerRatio = 0.42) {
  const rx = w * 0.46;   // 少し内側に収める
  const ry = h * 0.46;
  const cx = 0, cy = 0;  // すでに translate(el.x, el.y) 済み
  const outer = Math.min(rx, ry);
  const inner = outer * innerRatio;

  const step = Math.PI / spikes; // 外→内→外…の半角刻み
  let ang = -Math.PI/2;          // 上から開始

  ctx.moveTo(cx + Math.cos(ang)*outer, cy + Math.sin(ang)*outer);
  for (let i=0; i<spikes; i++) {
    ang += step;
    ctx.lineTo(cx + Math.cos(ang)*inner, cy + Math.sin(ang)*inner);
    ang += step;
    ctx.lineTo(cx + Math.cos(ang)*outer, cy + Math.sin(ang)*outer);
  }
}

// ギザギザの“爆発”吹き出し
function burstPath(w, h) {
  // 楕円をベースに 12 本のトゲ。内外半径を交互に打つ
  const spikes = 12;                 // トゲ数（好みで調整可）
  const R  = Math.min(w, h) * 0.50;  // 外側半径
  const r  = R * 0.62;               // 内側半径
  const cx = 0, cy = 0;              // すでに ctx.translate(el.x, el.y) 済

  ctx.moveTo(cx + R, cy);
  const step = (Math.PI * 2) / (spikes * 2);
  for (let i = 1; i < spikes * 2; i++) {
    const ang = i * step;
    const rad = (i % 2 === 0) ? R : r;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function getTextFont(el) {
  return `${el.fontWeight ?? 700} ${el.size}px ${el.font}`;
}

function layoutText(c, el) {
  const content = String(el.text ?? '');
  const maxWidth = Math.max(40, Number(el.maxWidth ?? 160));
  const lineHeightPx = (el.size || 32) * (el.lineHeight || 1.2);

  c.save();
  c.font = getTextFont(el);

  const lines = [];
  const paragraphs = content.split('\n');
  for (const p of paragraphs) {
    const chars = Array.from(p);
    if (!chars.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const ch of chars) {
      const test = line + ch;
      if (line && c.measureText(test).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }

  const maxLineW = lines.reduce((m, l) => Math.max(m, c.measureText(l).width), 0);
  c.restore();

  return {
    lines,
    width: Math.min(maxWidth, Math.ceil(maxLineW)),
    lineHeightPx,
    height: Math.max(lineHeightPx, lines.length * lineHeightPx),
  };
}

function drawTextElement(c, el) {
  const t = normalizeTextElement(el);
  const layout = layoutText(c, t);
  const startY = t.y - layout.height / 2 + layout.lineHeightPx / 2;

  c.save();
  c.font = getTextFont(t);
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  if (t.strokeEnabled && t.strokeWidth > 0) {
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.lineWidth = t.strokeWidth;
    c.strokeStyle = t.strokeColor;
    layout.lines.forEach((line, i) => {
      c.strokeText(line, t.x, startY + i * layout.lineHeightPx);
    });
  }

  if (t.shadowEnabled) {
    c.shadowColor = t.shadowColor;
    c.shadowBlur = t.shadowBlur;
    c.shadowOffsetX = t.shadowOffsetX;
    c.shadowOffsetY = t.shadowOffsetY;
  }

  c.fillStyle = t.color;
  layout.lines.forEach((line, i) => {
    c.fillText(line, t.x, startY + i * layout.lineHeightPx);
  });
  c.restore();
}

function drawText(el) {
  drawTextElement(ctx, el);
}

function drawGuides(){
  ctx.save();
  ctx.setLineDash([6,6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(92,167,255,0.9)';
  if (guides.x != null) {
    ctx.beginPath();
    ctx.moveTo(guides.x, 0);
    ctx.lineTo(guides.x, CANVAS_SIZE);
    ctx.stroke();
  }
  if (guides.y != null) {
    ctx.beginPath();
    ctx.moveTo(0, guides.y);
    ctx.lineTo(CANVAS_SIZE, guides.y);
    ctx.stroke();
  }
  ctx.restore();
}

// テキスト選択枠の実寸（描画に合わせて折り返し考慮）
function measureTextBlock(el) {
  const t = normalizeTextElement(el);
  const layout = layoutText(ctx, t);
  const fx = Math.max(t.strokeEnabled ? t.strokeWidth : 0, t.shadowEnabled ? (Math.abs(t.shadowOffsetX) + t.shadowBlur) : 0);
  const fy = Math.max(t.strokeEnabled ? t.strokeWidth : 0, t.shadowEnabled ? (Math.abs(t.shadowOffsetY) + t.shadowBlur) : 0);
  const w = layout.width + 20 + fx * 2;
  const h = layout.height + 16 + fy * 2;
  return { w, h };
}

function drawImageEl(el) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(el.img, el.x - el.w/2, el.y - el.h/2, el.w, el.h);
  ctx.restore();
}

function drawSelection(el) {
  ctx.save();
  ctx.strokeStyle = '#5ca7ff'; ctx.setLineDash([6,4]); ctx.lineWidth = 2;

  let w, h;
if (el.type === 'text') {
  const m = measureTextBlock(el);
  w = m.w; h = m.h;
} else {
  w = el.w; h = el.h;
}

  ctx.strokeRect(el.x - w/2, el.y - h/2, w, h);

  // 角ハンドル
  const hs = HANDLE_SIZE;
  const corners = [
    { k: 'nw', x: el.x - w/2, y: el.y - h/2 },
    { k: 'ne', x: el.x + w/2, y: el.y - h/2 },
    { k: 'se', x: el.x + w/2, y: el.y + h/2 },
    { k: 'sw', x: el.x - w/2, y: el.y + h/2 },
  ];
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#5ca7ff';
  for (const c of corners) {
    ctx.fillRect(c.x - hs/2, c.y - hs/2, hs, hs);
    ctx.strokeRect(c.x - hs/2, c.y - hs/2, hs, hs);
  }

    // しっぽハンドル（基点＋先端）
  if (el.type === 'bubble' && el.tail && el.tail.enabled && el.shape !== 'thought') {
    const edgeBase = edgePointForShape(el, el.tail.angle);
    const tip = { x: edgeBase.x + el.tail.length * Math.cos(el.tail.angle),
                  y: edgeBase.y + el.tail.length * Math.sin(el.tail.angle) };

  // 基点（外周上）…オレンジの輪（見た目だけ小さく）
ctx.beginPath();
ctx.lineWidth = 2;
ctx.strokeStyle = '#ff8a00';
ctx.fillStyle = 'rgba(255,138,0,0.12)';
ctx.arc(edgeBase.x, edgeBase.y, TAIL_BASE_DRAW_R, 0, Math.PI*2);
ctx.fill();
ctx.stroke();

// 先端（オレンジ点）
ctx.beginPath();
ctx.fillStyle = '#ff8a00';
ctx.strokeStyle = '#ff8a00';
ctx.lineWidth = 2;
ctx.arc(tip.x, tip.y, TAIL_TIP_DRAW_R, 0, Math.PI*2);
ctx.fill();
ctx.stroke();

  }

  ctx.restore();
}

function draw() {
  setupCanvasResolution();
  drawBackground();

  // 配列順に描画（末尾ほど前面）
  for (const el of state.elements) {
    if (el.hidden) continue;
    if (el.type === 'image') drawImageEl(el);
    else if (el.type === 'bubble') drawBubble(el);
    else if (el.type === 'text') drawText(el);
  }

  const sel = state.elements.find(e => e.id === state.selectedId);
  if (sel && !sel.hidden) drawSelection(sel);

  // ガイド線の描画
  if (guides.active) drawGuides();

  // オートセーブ
  saveLocal();

  // レイヤー一覧更新
  updateLayerPanel();
}

function updateUIFromSelection() {
  const sel = state.elements.find(e => e.id === state.selectedId);
  if (!sel) return;

  if (sel.type === 'bubble') activatePanel('bubble');
  if (sel.type === 'text') activatePanel('text');

  if (sel.type === 'bubble') {
    if (bubbleWidth)  bubbleWidth.value  = Math.round(sel.w);
    if (bubbleHeight) bubbleHeight.value = Math.round(sel.h);
    const sw = document.getElementById('strokeWidth');
    if (sw) sw.value = sel.strokeW ?? 6;
    const fc = document.getElementById('fillColor');
    if (fc) fc.value = sel.fill ?? '#ffffff';
    const sc = document.getElementById('strokeColor');
    if (sc) sc.value = sel.stroke ?? '#000000';
    if (sel.tail) {
      if (tailEnabled) tailEnabled.checked = !!sel.tail.enabled;
      if (tailWidth)   tailWidth.value = Math.round(sel.tail.width ?? 28);
    }
  }
  if (sel.type === 'text') {
    normalizeTextElement(sel);
    const fs = document.getElementById('fontSize');
    if (fs) fs.value = sel.size ?? 32;
    const tc = document.getElementById('textColor');
    if (tc) tc.value = sel.color ?? '#000000';
    const ti = document.getElementById('textInput');
    if (ti) ti.value = sel.text ?? '';
    const tp = document.getElementById('textPreset');
    if (tp) tp.value = sel.presetName ?? 'standard';
    const tmw = document.getElementById('textMaxWidth');
    if (tmw) tmw.value = sel.maxWidth ?? 160;
    const tlh = document.getElementById('textLineHeight');
    if (tlh) tlh.value = sel.lineHeight ?? 1.2;
    const tse = document.getElementById('textStrokeEnabled');
    if (tse) tse.checked = !!sel.strokeEnabled;
    const tsc = document.getElementById('textStrokeColor');
    if (tsc) tsc.value = sel.strokeColor ?? '#000000';
    const tsw = document.getElementById('textStrokeWidth');
    if (tsw) tsw.value = sel.strokeWidth ?? 3;
    const tsh = document.getElementById('textShadowEnabled');
    if (tsh) tsh.checked = !!sel.shadowEnabled;
    const tss = document.getElementById('textShadowStrength');
    if (tss) tss.value = sel.shadowBlur ?? 0;
  }
}

function hitTest(x, y) {
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const el = state.elements[i];
    if (el.hidden || el.locked) continue;
    if (el.type === 'text') {
  const { w, h } = measureTextBlock(el);
  if (x > el.x - w/2 && x < el.x + w/2 && y > el.y - h/2 && y < el.y + h/2) return el.id;
} else {
      if (x > el.x - el.w/2 && x < el.x + el.w/2 && y > el.y - el.h/2 && y < el.y + el.h/2) return el.id;
    }
  }
  return null;
}

function hitTestHandle(x, y) {
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const el = state.elements[i];
    if (el.id !== state.selectedId) continue;
    let w, h;
    if (el.type === 'text') {
      const m = measureTextBlock(el);
      w = m.w; h = m.h;
    } else {
      w = el.w; h = el.h;
    }
    const hs = HANDLE_HIT;
    const corners = [
      { k: 'nw', cx: el.x - w/2, cy: el.y - h/2 },
      { k: 'ne', cx: el.x + w/2, cy: el.y - h/2 },
      { k: 'se', cx: el.x + w/2, cy: el.y + h/2 },
      { k: 'sw', cx: el.x - w/2, cy: el.y + h/2 },
    ];
    for (const c of corners) {
      if (x > c.cx - hs/2 && x < c.cx + hs/2 && y > c.cy - hs/2 && y < c.cy + hs/2) {
        return { id: el.id, handle: c.k };
      }
    }
  }
  return null;
}

function getElementSizeForBounds(el) {
  if (el.type === 'text') {
    const m = measureTextBlock(el);
    return { w: m.w, h: m.h };
  }
  return { w: el.w, h: el.h };
}

function computeSnapForMove(nx, ny, el) {
  const { w, h } = getElementSizeForBounds(el);
  const halfW = w / 2;
  const halfH = h / 2;
  const threshold = guides.threshold;

  const candidatesX = [
    { key: 'left', value: nx - halfW },
    { key: 'center', value: nx },
    { key: 'right', value: nx + halfW },
  ];
  const candidatesY = [
    { key: 'top', value: ny - halfH },
    { key: 'middle', value: ny },
    { key: 'bottom', value: ny + halfH },
  ];

  let bestX = null;
  for (const c of candidatesX) {
    for (const line of snapLinesX) {
      const d = Math.abs(c.value - line);
      if (d > threshold) continue;
      if (!bestX || d < bestX.d) bestX = { ...c, line, d };
    }
  }

  let bestY = null;
  for (const c of candidatesY) {
    for (const line of snapLinesY) {
      const d = Math.abs(c.value - line);
      if (d > threshold) continue;
      if (!bestY || d < bestY.d) bestY = { ...c, line, d };
    }
  }

  let snappedX = nx;
  if (bestX) {
    if (bestX.key === 'left') snappedX = bestX.line + halfW;
    if (bestX.key === 'center') snappedX = bestX.line;
    if (bestX.key === 'right') snappedX = bestX.line - halfW;
  }

  let snappedY = ny;
  if (bestY) {
    if (bestY.key === 'top') snappedY = bestY.line + halfH;
    if (bestY.key === 'middle') snappedY = bestY.line;
    if (bestY.key === 'bottom') snappedY = bestY.line - halfH;
  }

  return {
    x: snappedX,
    y: snappedY,
    guideX: bestX ? bestX.line : null,
    guideY: bestY ? bestY.line : null,
  };
}

let dragging = false;
let dragOffsetX = 0, dragOffsetY = 0;

let tailDragging = false;
let tailBaseDragging = false;   // ← 基点ドラッグ中フラグ
// ※ 値は前項のモバイル最適化ブロックで可変管理

function hitTailHandle(x, y, el) {
  if (!el || el.type !== 'bubble' || !el.tail || el.shape === 'thought') return false;
  const edgeBase = edgePointForShape(el, el.tail.angle);
const tip  = { x: edgeBase.x + el.tail.length * Math.cos(el.tail.angle),
               y: edgeBase.y + el.tail.length * Math.sin(el.tail.angle) };
const dx = x - tip.x, dy = y - tip.y;
  return (dx*dx + dy*dy) <= (TAIL_HIT_R * TAIL_HIT_R);
}

function hitTailBaseHandle(x, y, el) {
  if (!el || el.type !== 'bubble' || !el.tail || el.shape === 'thought') return false;
  const edgeBase = edgePointForShape(el, el.tail.angle);
  const dx = x - edgeBase.x, dy = y - edgeBase.y;
  return (dx*dx + dy*dy) <= (TAIL_BASE_HIT_R * TAIL_BASE_HIT_R);
}

let resizing = false;
let activeHandle = null;

// 最小サイズを線の太さに応じて可変に（小さくもできる）
function getMinW(el){
  const sw = (el?.strokeW ?? DEFAULTS.STROKE_W);
  return Math.max(22, sw * 2 + 8);   // 22pxを下限に、線の太さ×2 + 余白
}
function getMinH(el){
  const sw = (el?.strokeW ?? DEFAULTS.STROKE_W);
  return Math.max(18, sw * 2 + 6);   // 18pxを下限に、線の太さ×2 + 余白
}

function pointerPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  const x = (clientX - rect.left) * (CANVAS_SIZE / rect.width);
  const y = (clientY - rect.top) * (CANVAS_SIZE / rect.height);
  return { x, y };
}

// ピンチ追跡
const activePointers = new Map();
let pinchScaling = false;
let pinchStartDist = 0;
let pinchStart = null;

function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

const LISTENER_OPT = { capture: true, passive: false };

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  activePointers.set(e.pointerId, p);

  if (activePointers.size === 2) {
    const [a,b] = [...activePointers.values()];
    pinchStartDist = distance(a,b);
    const sel = state.elements.find(el => el.id === state.selectedId);
    if (sel) {
      pinchScaling = true;
      snapshot();
      pinchStart = sel.type === 'text'
        ? { size: sel.size }
        : { w: sel.w, h: sel.h };
    }
  }
}, LISTENER_OPT);

canvas.addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, pointerPos(e));

  if (pinchScaling && activePointers.size >= 2) {
    const sel = state.elements.find(el => el.id === state.selectedId);
    if (!sel) return;
    const [a,b] = [...activePointers.values()];
    const d = distance(a,b);
    const scale = Math.max(0.3, Math.min(4, d / pinchStartDist));
if (sel.type === 'text') {
  sel.size = Math.max(12, Math.round(pinchStart.size * scale));
} else {
  const minW = getMinW(sel), minH = getMinH(sel);
  sel.w = Math.max(minW, Math.round(pinchStart.w * scale));
  sel.h = Math.max(minH, Math.round(pinchStart.h * scale));
  if (sel.tail) {
    sel.tail.length = Math.max(12, Math.round(sel.tail.length * scale));
    sel.tail.width  = Math.max(8,  Math.round(sel.tail.width  * scale));
  }
}
    draw();
  }
}, LISTENER_OPT);

canvas.addEventListener('pointerup', (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) { pinchScaling = false; }
  }, LISTENER_OPT);

canvas.addEventListener('pointercancel', (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) { pinchScaling = false; }
}, LISTENER_OPT);

canvas.addEventListener('pointerdown', (e) => {
  const {x, y} = pointerPos(e);

  // 角ハンドル
  const h = hitTestHandle(x, y);
  if (h && h.id) {
    state.selectedId = h.id;
    activeHandle = h.handle;
    resizing = true;
    snapshot();
    updateUIFromSelection();
    draw();
    return;
  }

  // しっぽハンドル
  const current = state.elements.find(el => el.id === state.selectedId);
  if (current && hitTailHandle(x, y, current)) {
    snapshot();
    tailDragging = true;
    return;
  }

  // 通常選択/ドラッグ
  const id = hitTest(x, y);
  if (id) {
    state.selectedId = id; dragging = true;
    const sel = state.elements.find(el => el.id === id);
    dragOffsetX = x - sel.x; dragOffsetY = y - sel.y;
    snapshot();
    updateUIFromSelection();
    draw();
  } else {
    state.selectedId = null;
    updateUIFromSelection();
    draw();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const {x, y} = pointerPos(e);
  const sel = state.elements.find(el => el.id === state.selectedId);
  if (!sel) return;

  // 角リサイズ
if (resizing && activeHandle) {
  if (sel.type === 'text') {
    // テキストは角ハンドルでフォントサイズをスケーリング
    // 選択枠の高さ h = size * 1.6 を基準に、ドラッグ高さから新sizeを算出
    const newH = Math.max(18, Math.abs(x /* 使わないが左右ドラッグでも良いように残す */ , y - sel.y) * 2);
    sel.size = Math.max(12, Math.round((Math.abs(y - sel.y) * 2) / 1.6));
    draw();
    return;
  } else {
    const minW = getMinW(sel), minH = getMinH(sel);
let newW = Math.max(minW, Math.abs(x - sel.x) * 2);
let newH = Math.max(minH, Math.abs(y - sel.y) * 2);
sel.w = newW; sel.h = newH;

    draw();
    return;
  }
}

  // しっぽドラッグ
  if (tailDragging && sel.type === 'bubble' && sel.tail) {
    const angle = Math.atan2(y - sel.y, x - sel.x);
sel.tail.angle = angle;
const edgeBase = edgePointForShape(sel, angle);
const dx = x - edgeBase.x, dy = y - edgeBase.y;
    sel.tail.length = Math.max(12, Math.min(180, Math.hypot(dx, dy)));
    draw();
    return;
  }

  // 移動（スナップ＆ガイド）
  if (dragging) {
    let nx = x - dragOffsetX;
    let ny = y - dragOffsetY;

    const snapped = computeSnapForMove(nx, ny, sel);
    nx = snapped.x;
    ny = snapped.y;

    guides.active = snapped.guideX != null || snapped.guideY != null;
    guides.x = snapped.guideX;
    guides.y = snapped.guideY;

    sel.x = nx; sel.y = ny;
    draw();
  }

});

canvas.addEventListener('pointerup', () => { 
  dragging = false; resizing = false; tailDragging = false; tailBaseDragging = false;
  guides.active = false; guides.x = guides.y = null; draw();
});
canvas.addEventListener('pointercancel', () => { 
  dragging = false; resizing = false; tailDragging = false; tailBaseDragging = false;
  guides.active = false; guides.x = guides.y = null; draw();
});

// ====== UIイベント ======
const tabButtons = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

function activatePanel(panelName) {
  tabButtons.forEach(b => b.classList.remove('is-active'));
  panels.forEach(p => p.classList.remove('is-active'));

  const activeTab = document.querySelector(`.tab[data-tab="${panelName}"]`);
  const activePanel = document.querySelector(`.panel[data-panel="${panelName}"]`);
  if (activeTab) activeTab.classList.add('is-active');
  if (activePanel) activePanel.classList.add('is-active');
}

tabButtons.forEach(btn => btn.addEventListener('click', () => {
  activatePanel(btn.dataset.tab);
}));

Array.from(document.querySelectorAll('[data-action="add-bubble"]')).forEach(b => {
  b.addEventListener('click', () => addBubble(b.dataset.shape));
});
Array.from(document.querySelectorAll('[data-action="apply-template"]')).forEach(btn => {
  btn.addEventListener('click', () => applyTemplate(btn.dataset.template));
});
document.getElementById('addTextBtn').addEventListener('click', addText);

document.getElementById('textInput').addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (sel) { sel.text = e.target.value; draw(); }
});
document.getElementById('textInput').addEventListener('change', snapshot);

const fontSizeInput = document.getElementById('fontSize');
if (fontSizeInput) {
  fontSizeInput.addEventListener('input', (e) => {
    const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
    if (sel) { sel.size = parseInt(e.target.value, 10); draw(); }
  });
  fontSizeInput.addEventListener('change', snapshot);
}

document.getElementById('fontFamily').addEventListener('change', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (sel) { sel.font = e.target.value; draw(); }
});
document.getElementById('fontFamily').addEventListener('change', snapshot);

const textPresetInput = document.getElementById('textPreset');
if (textPresetInput?.value) defaultTextPreset = textPresetInput.value;
textPresetInput?.addEventListener('change', (e) => {
  const name = e.target.value;
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (!sel) {
    defaultTextPreset = name;
    return;
  }
  snapshot();
  applyTextPresetToElement(sel, name);
  draw();
  updateUIFromSelection();
});

const textMaxWidthInput = document.getElementById('textMaxWidth');
textMaxWidthInput?.addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (!sel) return;
  sel.maxWidth = parseInt(e.target.value, 10);
  draw();
});
textMaxWidthInput?.addEventListener('change', snapshot);

const textLineHeightInput = document.getElementById('textLineHeight');
textLineHeightInput?.addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (!sel) return;
  sel.lineHeight = parseFloat(e.target.value);
  draw();
});
textLineHeightInput?.addEventListener('change', snapshot);

const textStrokeEnabledInput = document.getElementById('textStrokeEnabled');
textStrokeEnabledInput?.addEventListener('change', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (!sel) return;
  snapshot();
  sel.strokeEnabled = !!e.target.checked;
  draw();
});

const textStrokeColorInput = document.getElementById('textStrokeColor');
textStrokeColorInput?.addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (!sel) return;
  sel.strokeColor = e.target.value;
  draw();
});
textStrokeColorInput?.addEventListener('change', snapshot);

const textStrokeWidthInput = document.getElementById('textStrokeWidth');
textStrokeWidthInput?.addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (!sel) return;
  sel.strokeWidth = parseInt(e.target.value, 10);
  sel.strokeEnabled = sel.strokeWidth > 0;
  draw();
});
textStrokeWidthInput?.addEventListener('change', snapshot);

const textShadowEnabledInput = document.getElementById('textShadowEnabled');
textShadowEnabledInput?.addEventListener('change', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (!sel) return;
  snapshot();
  sel.shadowEnabled = !!e.target.checked;
  draw();
});

const textShadowStrengthInput = document.getElementById('textShadowStrength');
textShadowStrengthInput?.addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (!sel) return;
  const s = parseInt(e.target.value, 10);
  sel.shadowBlur = s;
  sel.shadowOffsetX = 0;
  sel.shadowOffsetY = Math.round(s * 0.35);
  sel.shadowEnabled = s > 0;
  draw();
});
textShadowStrengthInput?.addEventListener('change', snapshot);


document.getElementById('fillColor').addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'bubble');
  if (sel) { sel.fill = e.target.value; draw(); }
});
document.getElementById('strokeColor').addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'bubble');
  if (sel) { sel.stroke = e.target.value; draw(); }
});
document.getElementById('textColor').addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (sel) { sel.color = e.target.value; draw(); }
});
document.getElementById('fillColor').addEventListener('change', snapshot);
document.getElementById('strokeColor').addEventListener('change', snapshot);
document.getElementById('textColor').addEventListener('change', snapshot);

document.getElementById('strokeWidth').addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'bubble');
  if (sel) { sel.strokeW = parseInt(e.target.value, 10); draw(); }
});
document.getElementById('strokeWidth').addEventListener('change', snapshot);

// スライダー
const bubbleWidth = document.getElementById('bubbleWidth');
const bubbleHeight = document.getElementById('bubbleHeight');
if (bubbleWidth) {
  bubbleWidth.addEventListener('input', (e) => {
    const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'bubble');
    if (!sel) return;
    sel.w = parseInt(e.target.value, 10);
    draw();
  });
  bubbleWidth.addEventListener('change', snapshot);
}
if (bubbleHeight) {
  bubbleHeight.addEventListener('input', (e) => {
    const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'bubble');
    if (!sel) return;
    sel.h = parseInt(e.target.value, 10);
    draw();
  });
  bubbleHeight.addEventListener('change', snapshot);
}

// しっぽ UI
const tailEnabled = document.getElementById('tailEnabled');
const tailWidth   = document.getElementById('tailWidth');
if (tailEnabled) {
  tailEnabled.addEventListener('change', (e) => {
    const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'bubble');
    if (!sel || !sel.tail) return;
    snapshot();
    sel.tail.enabled = !!e.target.checked;
    draw();
  });
}
if (tailWidth) {
  tailWidth.addEventListener('input', (e) => {
    const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'bubble');
    if (!sel || !sel.tail) return;
    sel.tail.width = parseInt(e.target.value, 10);
    draw();
  });
  tailWidth.addEventListener('change', snapshot);
}

const addImageBtn     = document.getElementById('addImageBtn');
const imageUpload     = document.getElementById('imageUpload');
const centerUploadBtn = document.getElementById('centerUploadBtn');

imageUpload.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  console.log('[imageUpload change]', !!f, f && f.name, f && f.size);
  if (f) {
    addImage(f);
    const btn = document.getElementById('centerUploadBtn');
    if (btn) btn.style.display = 'none';
  }
  e.target.value = ''; // 同じファイルを続けて選んでも再発火
});

/* 「背景画像を入れる」は input を開くだけ */
addImageBtn?.addEventListener('click', () => imageUpload.click());

/* 中央ボタン（button/label どちらでも）からも確実に input を開く */
const centerUploadBtnEl = document.getElementById('centerUploadBtn');
centerUploadBtnEl?.addEventListener('click', (e) => {
  e.preventDefault();
  imageUpload.click();
});

// 削除（関数化して複数ボタンから使う）
function deleteSelected(){
  if (!state.selectedId) return;
  snapshot();
  state.elements = state.elements.filter(e => e.id !== state.selectedId);
  state.selectedId = null;
  draw(); // レイヤーUIも同期
}
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelected);

// 背景透過切替
const toggleBgBtn = document.getElementById('toggleBgBtn');
toggleBgBtn?.addEventListener('click', () => {
  snapshot();
  bgTransparent = !bgTransparent;
  toggleBgBtn.textContent = `背景：${bgTransparent ? '透過' : '白'}`;
  draw();
});

// Undo/Redo
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
if (undoBtn) undoBtn.addEventListener('click', undo);
if (redoBtn) redoBtn.addEventListener('click', redo);

// フローティングツールバー
document.getElementById('ftUndo')  ?.addEventListener('click', undo);
document.getElementById('ftRedo')  ?.addEventListener('click', redo);
document.getElementById('ftBringForward')?.addEventListener('click', () => moveSelected(+1));
document.getElementById('ftSendBackward')?.addEventListener('click', () => moveSelected(-1));
document.getElementById('ftDelete')?.addEventListener('click', deleteSelected);
document.getElementById('ftReset') ?.addEventListener('click', resetBaseImage);

// 画面を完全に初期化する新ボタン（フローティング or サイドどちらでも）
document.getElementById('ftInit') ?.addEventListener('click', () => {
  if (confirm('初期状態に戻しますか？')) resetAll();
});
document.getElementById('resetBtn')?.addEventListener('click', () => {
  if (confirm('初期状態に戻しますか？')) resetAll();
});

// ====== 保存（キャンバス全体を透明PNGで出力） ======

function renderPNGDataURL() {
  const exportSizeInput = document.getElementById('exportSize');
  const requestedSize = Number(exportSizeInput?.value ?? exportSize ?? CANVAS_SIZE);
  const outSize = Number.isFinite(requestedSize)
    ? Math.max(1, Math.round(requestedSize))
    : CANVAS_SIZE;

  const tmp = document.createElement('canvas');
  tmp.width = outSize;
  tmp.height = outSize;

  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';

  // 背景は常に透明のまま（白塗りしない）
  const scale = outSize / CANVAS_SIZE;
  tctx.setTransform(scale, 0, 0, scale, 0, 0);

  // 画面上のキャンバス論理座標をそのまま再描画（配列順）
  for (const el of state.elements) {
    if (el.hidden) continue;
    if (el.type === 'image' && el.img) {
      tctx.drawImage(el.img, el.x - el.w / 2, el.y - el.h / 2, el.w, el.h);
    } else if (el.type === 'bubble') {
      paintBubble(tctx, el, { canvasSize: CANVAS_SIZE });
    } else if (el.type === 'text') {
      drawTextElement(tctx, el);
    }
  }

  return tmp.toDataURL('image/png');
}


// ===== Web Share（画像ファイルを共有）ヘルパー =====
function dataURLtoBlob(dataURL) {
  const [head, body] = dataURL.split(',');
  const mime = head.match(/data:(.*?);base64/)[1];
  const bin = atob(body);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

async function shareImageFile(shareText, dataUrl, fallbackUrl) {
  try {
    const blob = dataURLtoBlob(dataUrl);
    const file = new File([blob], 'stamp.png', { type: 'image/png' });

    // Web Share Level 2（ファイル対応）判定
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ text: shareText, files: [file] });
      return true;
    }
  } catch (_) { /* no-op */ }

  // 非対応ブラウザ → テキストのみの共有URLへフォールバック
  if (fallbackUrl) window.location.href = fallbackUrl;
  return false;
}


// 右の丸ボタン「保存」―――――――――――――――――――― ここから差し替え
const saveBtn =
  document.getElementById('ftSave') ||
  [...document.querySelectorAll('.floating-tools .icon-btn')].find(b =>
    b?.title === '保存' || (b?.textContent || '').includes('💾')
  );

saveBtn?.addEventListener('click', () => {
  const url   = renderPNGDataURL();             // 生成した画像 dataURL
  const img   = document.getElementById('savedImagePreview');
  const modal = document.getElementById('saveModal');
  if (img) img.src = url;

  // ← ここを追加：本文にサイトURLを入れる
  const shareUrl  = (window.SHARE_URL || location.origin);
  const shareText = `作ったスタンプをシェア！\n${shareUrl}`;

  // 各ボタン（Aタグ）
  const x  = document.getElementById('modalShareX');
  const li = document.getElementById('modalShareLINE');
  const ig = document.getElementById('modalShareInsta');

  // フォールバック（テキストのみ投稿）
  const fallbackX  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const fallbackLI = `https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`;

  // 画像付き共有 → 失敗時はテキストのみ
  if (x) {
    x.href = fallbackX;
    x.onclick = (e) => { e.preventDefault(); shareImageFile(shareText, url, fallbackX); };
  }
  if (li) {
    li.href = fallbackLI;
    li.onclick = (e) => { e.preventDefault(); shareImageFile(shareText, url, fallbackLI); };
  }
  if (ig) {
    ig.href = '#';
    ig.onclick = (e) => { e.preventDefault(); shareImageFile(shareText, url, null); };
  }

  modal?.classList.remove('hidden');
});

document.getElementById('closeModal')?.addEventListener('click', () => {
  document.getElementById('saveModal')?.classList.add('hidden');
});

document.getElementById('savedImagePreview')?.addEventListener('click', (e) => {
  const src = e.currentTarget.src;
  window.open(src, '_blank', 'noopener');
});
// ――――――――――――――――――――――――――――――――――― ここまで差し替え


// --- 差し替えここまで ---

// ====== レイヤーUI ======
const layerList = document.getElementById('layerList');
const layerUpBtn = document.getElementById('layerUpBtn');
const layerDownBtn = document.getElementById('layerDownBtn');
const layerDelBtn = document.getElementById('layerDelBtn');

function labelOf(el, idx){
  if (el.type === 'image') return `画像 ${idx}`;
  if (el.type === 'bubble') return `吹き出し ${idx}`;
  return `テキスト ${idx}`;
}

function updateLayerPanel(){
  if (!layerList) return;
  layerList.innerHTML = '';
  // 上（末尾＝最前面）ほど前面にあるので、UIは逆順に表示
  const els = [...state.elements].map((e,i)=>({e,i})).reverse();
  for (const {e,i} of els){
    const li = document.createElement('li');
    li.className = 'layer-item' + (e.id === state.selectedId ? ' is-active' : '');
    li.dataset.id = e.id;

    const name = document.createElement('div');
    name.className = 'layer-item__name';
    name.textContent = labelOf(e, i+1);

    const eye = document.createElement('button');
    eye.className = 'layer-item__btn';
    eye.title = '表示/非表示';
    eye.textContent = e.hidden ? '🙈' : '👁';
    eye.addEventListener('click', (ev)=>{
      ev.stopPropagation(); snapshot();
      e.hidden = !e.hidden; draw();
    });

    const lock = document.createElement('button');
    lock.className = 'layer-item__btn';
    lock.title = 'ロック/解除';
    lock.textContent = e.locked ? '🔒' : '🔓';
    lock.addEventListener('click', (ev)=>{
      ev.stopPropagation(); snapshot();
      e.locked = !e.locked; draw();
    });

    li.appendChild(name);
    li.appendChild(eye);
    li.appendChild(lock);
    li.addEventListener('click', ()=>{
      state.selectedId = e.id; updateUIFromSelection(); draw();
    });

    layerList.appendChild(li);
  }
}

function moveSelected(delta){ // +1:前面へ, -1:背面へ
  const idx = state.elements.findIndex(e=>e.id===state.selectedId);
  if (idx < 0) return;
  const ni = idx + delta;
  if (ni < 0 || ni >= state.elements.length) return;
  snapshot();
  const [el] = state.elements.splice(idx,1);
  state.elements.splice(ni,0,el);
  draw();
}

// レイヤーパネル開閉
const layerPanelEl = document.getElementById('layerPanel');
const toggleLayerBtn = document.getElementById('toggleLayerBtn');
if (toggleLayerBtn && layerPanelEl) {
  toggleLayerBtn.addEventListener('click', () => {
    const hidden = layerPanelEl.classList.toggle('is-hidden');
    toggleLayerBtn.setAttribute('aria-expanded', String(!hidden));
  });
}

layerUpBtn?.addEventListener('click', ()=> moveSelected(+1));
layerDownBtn?.addEventListener('click', ()=> moveSelected(-1));
layerDelBtn?.addEventListener('click', ()=>{
  if (!state.selectedId) return;
  snapshot();
  state.elements = state.elements.filter(e=>e.id!==state.selectedId);
  state.selectedId = null; draw();
});

// ====== 初期ロード（ローカル復元）→ 描画 ======
setupCanvasResolution();
window.addEventListener('resize', () => {
  setupCanvasResolution();
  draw();
}, { passive: true });

loadLocal();

// ローカル保存が無い初回のみ、スライダーの初期値をデフォルトへ
try {
  const hasSaved = !!localStorage.getItem(LS_KEY);
  if (!hasSaved) {
    const sw = document.getElementById('strokeWidth');
    const tw = document.getElementById('tailWidth');
    if (sw) sw.value = DEFAULTS.STROKE_W;
    if (tw) tw.value = DEFAULTS.TAIL_W;
  }
} catch (_) { /* 何もしない */ }

const btn = document.getElementById('centerUploadBtn');
const hasImage = state.elements.some(e => e.type === 'image' && !e.hidden);
if (btn && hasImage) btn.style.display = 'none';
draw();

// IIFEを閉じる（ファイルの最後に必ず必要）
})();
