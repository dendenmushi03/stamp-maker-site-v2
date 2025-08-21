console.log('BUILD MARKER ZZZ5');

(() => {
  'use strict';

// ====== 基本設定 ======
const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
let bgTransparent = true;
let exportSize = 200;

// ---- デフォルト（スマホ見栄え寄り） ----
const DEFAULTS = {
  STROKE_W: 8,  // 吹き出しの線の太さ（px）
  TAIL_W: 30,   // しっぽの幅（px）
};

// --- モバイル最適化：ヒットエリアを広げる -----------------------
const IS_MOBILE = window.matchMedia('(max-width: 480px)').matches;
let HANDLE_SIZE = IS_MOBILE ? 16 : 10;  // 選択枠ハンドル描画サイズ
let HANDLE_HIT  = IS_MOBILE ? 22 : 14;  // ハンドルの当たり判定
let TAIL_HIT_R  = IS_MOBILE ? 26 : 18;  // しっぽ先端ヒット
let TAIL_BASE_HIT_R = IS_MOBILE ? 22 : 14; // しっぽ基点ヒット

// 画面回転などでサイズが変わったときの再計算
window.addEventListener('resize', () => {
  const m = matchMedia('(max-width: 480px)').matches;
  HANDLE_SIZE = m ? 16 : 10;
  HANDLE_HIT  = m ? 22 : 14;
  TAIL_HIT_R  = m ? 26 : 18;
  TAIL_BASE_HIT_R = m ? 22 : 14;
}, { passive: true });

// 論理サイズは 300x300 固定（見た目はCSSで拡大）
canvas.width = 200;
canvas.height = 200;

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
const snapLinesX = [canvas.width/2, canvas.width/3, (canvas.width*2)/3]; // 150,100,200
const snapLinesY = [canvas.height/2, canvas.height/3, (canvas.height*2)/3]; // 150,100,200

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
  draw();
}

// ====== オートセーブ ======
const LS_KEY = 'stampMakerStateV1';

function serializeElements(els){
  return els.map(el=>{
    if (el.type === 'image' && el.img) {
      // 画像をDataURL化して保存（Blob URLは復元不可のため）
      try {
        const off = document.createElement('canvas');
        off.width = Math.max(1, Math.round(el.w));
        off.height = Math.max(1, Math.round(el.h));
        const octx = off.getContext('2d');
        octx.drawImage(el.img, 0, 0, off.width, off.height);
        const dataUrl = off.toDataURL('image/png');
        return { ...el, img: undefined, dataUrl };
      } catch(e) {
        console.warn('serialize image failed', e);
        return { ...el, img: undefined, dataUrl: null };
      }
    }
    return el;
  });
}

function reviveElements(raw){
  const out = [];
  for (const el of raw) {
    if (el.type === 'image' && el.dataUrl) {
      const img = new Image();
      img.onload = () => draw();
      img.src = el.dataUrl;
      const {dataUrl, ...rest} = el;
      out.push({ ...rest, img });
    } else {
      out.push(el);
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
  } catch(e){
    console.warn('loadLocal failed', e);
  }
}

// ====== 要素生成 ======
const genId = () => Math.random().toString(36).slice(2, 9);

function addBubble(shape = 'round') {
  snapshot();

  // ← 先に取得してからオブジェクトを組み立てる
  const swInput = document.getElementById('strokeWidth');
  const twInput = document.getElementById('tailWidth');

  const el = {
    id: genId(),
    type: 'bubble',
    shape, x: canvas.width / 2, y: canvas.height / 2, w: 150, h: 110,
    hidden: false, locked: false,
    fill: document.getElementById('fillColor').value,
    stroke: document.getElementById('strokeColor').value,
    strokeW: parseInt(swInput?.value ?? DEFAULTS.STROKE_W, 10),
    tail: {
      angle: Math.PI / 6,
      length: 40,
      width: parseInt(twInput?.value ?? DEFAULTS.TAIL_W, 10),
      enabled: true,
      skew: 0
    }
  };

  if (shape === 'burst') el.tail.enabled = false; // 爆発は基本しっぽ無し
  state.elements.push(el);
  state.selectedId = el.id;
  updateUIFromSelection();
  draw();
}

function addText() {
  snapshot();
  const fsInput = document.getElementById('fontSize'); // ← 無いHTMLでもOKに
  state.elements.push({
    id: genId(),
    type: 'text',
    x: 150, y: 150,
    hidden: false, locked: false,
    text: document.getElementById('textInput').value || 'テキスト',
    color: document.getElementById('textColor').value,
    size: parseInt(fsInput?.value ?? 32, 10),  // ← デフォルト32
    font: document.getElementById('fontFamily').value,
    align: 'center',
  });
  draw();
}

function addImage(file) {
  console.log('[addImage] file:', file && file.name, file && file.size);
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    try {
      try { await img.decode?.(); } catch {}
      URL.revokeObjectURL(url);

      snapshot();

      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) { console.error('[addImage] invalid image size'); return; }

      const scale = Math.min(canvas.width / iw, canvas.height / ih);
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));

            state.elements.push({
        id: genId(),
        type: 'image',
        x: canvas.width / 2,
        y: canvas.height / 2,
        w, h, img,
        hidden: false, locked: false
      });

      const btn = document.getElementById('centerUploadBtn');
      if (btn) btn.style.display = 'none';
      draw();
    } catch (err) {
      console.error('[addImage] onload handler error', err);
    }
  };
  img.onerror = (e) => console.error('[addImage] failed to load image', e);
  img.src = url;
}

// ベース画像（最初の image 要素）をキャンバス中央＆フィットに戻す
function resetBaseImage(){
  const imgEl = state.elements.find(el => el.type === 'image');
  if (!imgEl || !imgEl.img) return;

  snapshot();

  const iw = imgEl.img.naturalWidth || imgEl.img.width;
  const ih = imgEl.img.naturalHeight || imgEl.img.height;
  if (!iw || !ih) return;

  const scale = Math.min(canvas.width / iw, canvas.height / ih);
  imgEl.w = Math.max(1, Math.round(iw * scale));
  imgEl.h = Math.max(1, Math.round(ih * scale));
  imgEl.x = canvas.width / 2;
  imgEl.y = canvas.height / 2;

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!bgTransparent) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawBubble(el) {
  const w = el.w, h = el.h;

  // しっぽ座標（画面座標で先に計算）
  let tail = null;
// 爆発はしっぽを持たない
if (el.tail && el.tail.enabled && el.shape !== 'thought' && el.shape !== 'burst') {
    const angle = el.tail.angle;
    const edgeBase = edgePointForShape(el, angle);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const tip = { x: edgeBase.x + el.tail.length * ca, y: edgeBase.y + el.tail.length * sa };
    // --- しっぽ座標（毎回「外周との交点」を基点に再計算：常に接着）---
const nx = -sa, ny = ca;
const halfW = el.tail.width / 2;
const k = Math.max(-0.9, Math.min(0.9, el.tail.skew ?? 0));
const leftW  = halfW * (1 + k);
const rightW = halfW * (1 - k);
const bL = { x: edgeBase.x + nx * leftW,  y: edgeBase.y + ny * leftW  };
const bR = { x: edgeBase.x - nx * rightW, y: edgeBase.y - ny * rightW };

// --- 塗り：白スジ防止（角丸は少し多めに食い込ませる） ---
const EPS_INNER = (el.shape === 'rect') ? 1.2 : 0.5;
const bL_in = { x: bL.x - nx*EPS_INNER, y: bL.y - ny*EPS_INNER };
const bR_in = { x: bR.x + nx*EPS_INNER, y: bR.y + ny*EPS_INNER };

tail = { bL, bR, tip, bL_in, bR_in };
  }

  // === 塗り: 本体 + しっぽを1つのパスとして fill ===
  ctx.save();
  ctx.fillStyle = el.fill;
  ctx.translate(el.x, el.y);

  ctx.beginPath();
if (el.shape === 'rect') {
  roundedRectPath(-w/2, -h/2, w, h, 18);
} else if (el.shape === 'cloud') {
  cloudPath(w, h);
} else if (el.shape === 'thought') {
  thoughtPath(w, h);
} else if (el.shape === 'burst') {
  burstPath(w, h);            // ← 爆発は爆発形のみを描く
} else {
  roundedRectPath(-w/2, -h/2, w, h, Math.min(w, h)/2);
}
ctx.closePath();
ctx.fill();
  ctx.restore();

    // === 線: 本体外周を stroke → しっぽの2辺だけ stroke（基部は描かない） ===
  ctx.save();
ctx.translate(el.x, el.y);
ctx.lineJoin   = 'miter';
ctx.lineCap    = 'round';
ctx.miterLimit = 3;
ctx.strokeStyle = el.stroke;
ctx.lineWidth   = el.strokeW;



  // 本体の外周
  ctx.beginPath();
if (el.shape === 'rect') {
  roundedRectPath(-w/2, -h/2, w, h, 18);
} else if (el.shape === 'cloud') {
  cloudPath(w, h);
} else if (el.shape === 'thought') {
  thoughtPath(w, h);
} else if (el.shape === 'burst') {
  burstPath(w, h);            // ← 爆発の外枠線
} else {
  roundedRectPath(-w/2, -h/2, w, h, Math.min(w, h)/2);
}
ctx.closePath();
ctx.stroke();
ctx.restore();

  // しっぽの塗りを本体へ少し食い込ませて“接着”させる → その後、外側だけ線を引く
  if (tail) {
    const EXT = 0.6;
    const ca = Math.cos(el.tail.angle), sa = Math.sin(el.tail.angle);
    const tipOut = { x: tail.tip.x + ca*EXT, y: tail.tip.y + sa*EXT };

    // ① 未クリップで小三角形を塗る（bL_in / bR_in を使って本体側に1px程度潜り込む）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo((tail.bL_in?.x ?? tail.bL.x), (tail.bL_in?.y ?? tail.bL.y));
    ctx.lineTo(tipOut.x, tipOut.y);
    ctx.lineTo((tail.bR_in?.x ?? tail.bR.x), (tail.bR_in?.y ?? tail.bR.y));
    ctx.closePath();
    ctx.fillStyle = el.fill;
    ctx.fill();
    ctx.restore();

    // ② 外側だけを clip して、2辺だけを stroke（ベース側は描かない）
    ctx.save();

    // --- 外側クリップ（大きな矩形 − 本体形状）---
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(el.x, el.y);
    if (el.shape === 'rect') {
      roundedRectPath(-el.w/2, -el.h/2, el.w, el.h, 18);
    } else if (el.shape === 'cloud') {
      cloudPath(el.w, el.h);
    } else if (el.shape === 'thought') {
      thoughtPath(el.w, el.h);
    } else {
      roundedRectPath(-el.w/2, -el.h/2, el.w, el.h, Math.min(el.w, el.h)/2);
    }
    ctx.closePath();
    ctx.restore();

    ctx.clip('evenodd');

    // 線（2辺のみ）
    ctx.beginPath();
    ctx.moveTo(tail.bL.x, tail.bL.y);
    ctx.lineTo(tipOut.x,  tipOut.y);
    ctx.lineTo(tail.bR.x, tail.bR.y);
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth   = el.strokeW;
    ctx.lineJoin    = 'miter';
    ctx.lineCap     = 'round';
    ctx.miterLimit  = 3;
    ctx.stroke();

    ctx.restore();
  }

} // ← ここで drawBubble が必ず閉じる

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

function drawText(el) {
  ctx.save();
  ctx.fillStyle = el.color; ctx.font = `${el.size}px ${el.font}`; ctx.textAlign = el.align; ctx.textBaseline = 'middle';
  ctx.translate(el.x, el.y);
  wrapText(el.text, 0, 0, 240, el.size * 1.2);
  ctx.restore();
}

function drawGuides(){
  ctx.save();
  ctx.setLineDash([6,6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(92,167,255,0.9)';
  if (guides.x != null) {
    ctx.beginPath();
    ctx.moveTo(guides.x, 0);
    ctx.lineTo(guides.x, canvas.height);
    ctx.stroke();
  }
  if (guides.y != null) {
    ctx.beginPath();
    ctx.moveTo(0, guides.y);
    ctx.lineTo(canvas.width, guides.y);
    ctx.stroke();
  }
  ctx.restore();
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  const lines = [];
  for (let n=0; n<words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n>0) { lines.push(line); line = words[n] + ' '; }
    else { line = testLine; }
  }
  lines.push(line);
  const offsetY = -((lines.length-1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l.trim(), x, y + offsetY + i*lineHeight));
}

// テキスト選択枠の実寸（描画に合わせて折り返し考慮）
function measureTextBlock(el) {
  const maxWidth = 240;                 // 描画と同じ制限幅
  const lineHeight = el.size * 1.2;
  ctx.save();
  ctx.font = `${el.size}px ${el.font}`;

  const words = (el.text || '').split(/\s+/);
  let line = '';
  const lines = [];
  let maxLineW = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const w = ctx.measureText(testLine).width;
    if (w > maxWidth && n > 0) {
      lines.push(line.trimEnd());
      maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line.trimEnd());
  maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  ctx.restore();

  // 少し余白を足す（左右10, 上下8）
  const w = Math.min(maxWidth, Math.ceil(maxLineW)) + 20;
  const h = Math.max(lineHeight, lines.length * lineHeight) + 16;
  return { w, h };
}

function drawImageEl(el) {
  ctx.save();
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

    // 基点（外周上）…オレンジの輪
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ff8a00';
    ctx.fillStyle = 'rgba(255,138,0,0.12)';
    ctx.arc(edgeBase.x, edgeBase.y, 6.5, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // 先端（従来どおりのオレンジ点）
    ctx.beginPath();
    ctx.fillStyle = '#ff8a00';
    ctx.strokeStyle = '#ff8a00';
    ctx.lineWidth = 2;
    ctx.arc(tip.x, tip.y, 7, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function draw() {
  drawBackground();

  // 画像 → 吹き出し → テキスト（hiddenはスキップ）
  for (const el of state.elements) if (!el.hidden && el.type === 'image') drawImageEl(el);
  for (const el of state.elements) if (!el.hidden && el.type === 'bubble') drawBubble(el);
  for (const el of state.elements) if (!el.hidden && el.type === 'text') drawText(el);

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
    const fs = document.getElementById('fontSize');
    if (fs) fs.value = sel.size ?? 32;
    const tc = document.getElementById('textColor');
    if (tc) tc.value = sel.color ?? '#000000';
    const ti = document.getElementById('textInput');
    if (ti) ti.value = sel.text ?? '';
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
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);
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

    // スナップ候補の計算（移動時にのみ使う）
  function snap(val, lines){
    for (const L of lines){
      if (Math.abs(val - L) <= guides.threshold) return L;
    }
    return null;
  }

    // 移動（スナップ＆ガイド）
  if (dragging) {
    let nx = x - dragOffsetX;
    let ny = y - dragOffsetY;

    const sx = snap(nx, snapLinesX);
    const sy = snap(ny, snapLinesY);

    guides.active = false; guides.x = null; guides.y = null;

    if (sx != null) { nx = sx; guides.x = sx; guides.active = true; }
    if (sy != null) { ny = sy; guides.y = sy; guides.active = true; }

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
tabButtons.forEach(btn => btn.addEventListener('click', () => {
  tabButtons.forEach(b => b.classList.remove('is-active'));
  panels.forEach(p => p.classList.remove('is-active'));
  btn.classList.add('is-active');
  document.querySelector(`.panel[data-panel="${btn.dataset.tab}"]`).classList.add('is-active');
}));

Array.from(document.querySelectorAll('[data-action="add-bubble"]')).forEach(b => {
  b.addEventListener('click', () => addBubble(b.dataset.shape));
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
document.getElementById('ftDelete')?.addEventListener('click', deleteSelected);
document.getElementById('ftReset') ?.addEventListener('click', resetBaseImage);

// 画面を完全に初期化する新ボタン（フローティング or サイドどちらでも）
document.getElementById('ftInit') ?.addEventListener('click', () => {
  if (confirm('初期状態に戻しますか？')) resetAll();
});
document.getElementById('resetBtn')?.addEventListener('click', () => {
  if (confirm('初期状態に戻しますか？')) resetAll();
});

// ====== 保存（背景画像サイズにトリミングして出力） ======
const EXPORT_SIZE = 200; // ← 背景画像がない時のフォールバック

function renderPNGDataURL() {
  // 1) 一番下の「背景画像（image要素）」を探す
  const baseImgEl = state.elements.find(e => e.type === 'image' && !e.hidden && e.img);
  if (baseImgEl && (baseImgEl.img.naturalWidth || baseImgEl.img.width)) {
    const iw = baseImgEl.img.naturalWidth || baseImgEl.img.width;
    const ih = baseImgEl.img.naturalHeight || baseImgEl.img.height;

    // キャンバス座標 → 書き出しピクセルの拡大率
    const s = iw / baseImgEl.w; // (= ih / baseImgEl.h と同じ)

    // 出力キャンバスは「背景画像そのものの大きさ」
    const outW = Math.round(baseImgEl.w * s); // = iw
    const outH = Math.round(baseImgEl.h * s); // = ih

    const tmp = document.createElement('canvas');
    tmp.width = outW;
    tmp.height = outH;
    const tctx = tmp.getContext('2d');

    // 背景（白/透過）— ここでは“トリミングされた範囲”だけ塗る
    if (!bgTransparent) {
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, outW, outH);
    }

    // 2) 画面上の「背景画像の左上」が (0,0) に来るよう全体をオフセット
    //    以降は「いつものエクスポート描画」を実行するだけで、
    //    背景画像の範囲でぴったり切り出されます。
    const cropLeft  = (baseImgEl.x - baseImgEl.w / 2) * s;
    const cropTop   = (baseImgEl.y - baseImgEl.h / 2) * s;
    tctx.translate(-cropLeft, -cropTop);

    // ====== ここからは従来の描画処理（s を使う） ======
    // 画像レイヤー
    for (const el of state.elements) {
      if (el.type === 'image' && !el.hidden) {
        tctx.drawImage(
          el.img,
          (el.x - el.w / 2) * s,
          (el.y - el.h / 2) * s,
          el.w * s,
          el.h * s
        );
      }
    }

    // 吹き出しレイヤー（元の export と同じロジックで s を使う）
    for (const el of state.elements) {
      if (el.type !== 'bubble' || el.hidden) continue;

      const w = el.w * s, h = el.h * s;

      // しっぽ計算（爆発/思考の扱いは元のまま）
      let tail = null;
      if (el.tail && el.tail.enabled && el.shape !== 'thought') {
        const ca = Math.cos(el.tail.angle), sa = Math.sin(el.tail.angle);
        let edgeBase;
        if (el.shape === 'rect') {
          // 角丸長方形の外周交点（元コード準拠）
          const r = 18 * s;
          let t0 = 0, t1 = Math.max(el.w, el.h) * s;
          const sdfRR = (px, py, W, H, R) => {
            const qx = Math.abs(px) - (W/2 - R);
            const qy = Math.abs(py) - (H/2 - R);
            const qx2 = Math.max(qx, 0), qy2 = Math.max(qy, 0);
            return Math.hypot(qx2, qy2) + Math.min(Math.max(qx, qy), 0) - R;
          };
          for (let i = 0; i < 22; i++) {
            const tm = (t0 + t1) / 2, px = tm * ca, py = tm * sa;
            const d = sdfRR(px, py, el.w * s, el.h * s, r);
            if (d > 0) t1 = tm; else t0 = tm;
          }
          const t = (t0 + t1) / 2;
          edgeBase = { x: el.x * s + t * ca, y: el.y * s + t * sa };
        } else {
          const rx = (el.w / 2) * s, ry = (el.h / 2) * s;
          const t = 1 / Math.sqrt((ca * ca) / (rx * rx) + (sa * sa) / (ry * ry));
          edgeBase = { x: el.x * s + t * ca, y: el.y * s + t * sa };
        }
        const tip = {
          x: edgeBase.x + (el.tail.length * s) * ca,
          y: edgeBase.y + (el.tail.length * s) * sa
        };
        const nx = -sa, ny = ca;
        const halfW = (el.tail.width * s) / 2;
        const k = Math.max(-0.9, Math.min(0.9, el.tail.skew ?? 0));
        const leftW = halfW * (1 + k);
        const rightW = halfW * (1 - k);
        const bL = { x: edgeBase.x + nx * leftW, y: edgeBase.y + ny * leftW };
        const bR = { x: edgeBase.x - nx * rightW, y: edgeBase.y - ny * rightW };
        tail = { bL, bR, tip };
        const EPS_INNER = (el.shape === 'rect') ? 1.2 * s : 0.5 * s;
const bL_in = { x: bL.x - nx*EPS_INNER, y: bL.y - ny*EPS_INNER };
const bR_in = { x: bR.x + nx*EPS_INNER, y: bR.y + ny*EPS_INNER };

tail = { bL, bR, tip, bL_in, bR_in };

      }

      // 本体塗り
      tctx.save();
      tctx.fillStyle = el.fill;
      tctx.translate(el.x * s, el.y * s);
      tctx.beginPath();
      const drawRR = (W, H, R) => {
        const rr = Math.min(R, Math.min(W, H) / 2);
        tctx.moveTo(-W/2 + rr, -H/2);
        tctx.arcTo(W/2, -H/2,  W/2,  H/2, rr);
        tctx.arcTo(W/2,  H/2, -W/2,  H/2, rr);
        tctx.arcTo(-W/2, H/2, -W/2, -H/2, rr);
        tctx.arcTo(-W/2, -H/2,  W/2, -H/2, rr);
        tctx.closePath();
      };
      if (el.shape === 'rect') drawRR(w, h, 18 * s);
      else if (el.shape === 'burst') {
        const spikes = 12, R = Math.min(w, h) * 0.50, r = R * 0.62;
        const step = (Math.PI * 2) / (spikes * 2);
        tctx.moveTo(R, 0);
        for (let i = 1; i < spikes * 2; i++) {
          const ang = i * step;
          const rad = (i % 2 === 0) ? R : r;
          tctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        tctx.closePath();
      } else {
        drawRR(w, h, Math.min(w, h) / 2);
      }
      tctx.fill();
      tctx.restore();

      // 外枠線
      tctx.save();
      tctx.translate(el.x * s, el.y * s);
      tctx.strokeStyle = el.stroke;
      tctx.lineWidth = el.strokeW * s;
      tctx.lineJoin = 'miter';
      tctx.lineCap = 'round';
      tctx.miterLimit = 3;

      tctx.beginPath();
      if (el.shape === 'rect') {
        drawRR(w, h, 18 * s);
      } else if (el.shape === 'burst') {
        const spikes = 12, R = Math.min(w, h) * 0.50, r = R * 0.62;
        const step = (Math.PI * 2) / (spikes * 2);
        tctx.moveTo(R, 0);
        for (let i = 1; i < spikes * 2; i++) {
          const ang = i * step;
          const rad = (i % 2 === 0) ? R : r;
          tctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        tctx.closePath();
      } else {
        drawRR(w, h, Math.min(w, h) / 2);
      }
      tctx.stroke();
      tctx.restore();

      // しっぽ（基部は描かず、外側2辺のみ表示）
// 先に未クリップで小三角を塗って“接着”→ その後 外側だけ stroke
if (tail) {
  const EXT = 0.6 * s;
  const ca = Math.cos(el.tail.angle), sa = Math.sin(el.tail.angle);
  const tipOut = { x: tail.tip.x + ca*EXT, y: tail.tip.y + sa*EXT };

  // ① 未クリップで小三角を塗る（内側点を使って本体に食い込ませる）
  tctx.beginPath();
  tctx.moveTo(tail.bL_in?.x ?? tail.bL.x, tail.bL_in?.y ?? tail.bL.y);
  tctx.lineTo(tipOut.x, tipOut.y);
  tctx.lineTo(tail.bR_in?.x ?? tail.bR.x, tail.bR_in?.y ?? tail.bR.y);
  tctx.closePath();
  tctx.fillStyle = el.fill;
  tctx.fill();

  // ② 外側だけ clip して2辺を stroke
  const outside = new Path2D();
  outside.rect(0, 0, tmp.width, tmp.height);

  const shape = new Path2D();
  const ox = el.x * s, oy = el.y * s;
  const w2 = el.w * s, h2 = el.h * s;
  const rr2 = Math.min(18 * s, Math.min(w2, h2) / 2);
  shape.moveTo(ox - w2/2 + rr2, oy - h2/2);
  shape.arcTo(ox + w2/2, oy - h2/2,  ox + w2/2,  oy + h2/2, rr2);
  shape.arcTo(ox + w2/2, oy + h2/2,  ox - w2/2,  oy + h2/2, rr2);
  shape.arcTo(ox - w2/2, oy + h2/2,  ox - w2/2,  oy - h2/2, rr2);
  shape.arcTo(ox - w2/2, oy - h2/2,  ox + w2/2,  oy - h2/2, rr2);
  shape.closePath();

  const clipPath = new Path2D();
  clipPath.addPath(outside);
  clipPath.addPath(shape);

  tctx.save();
  tctx.clip(clipPath, 'evenodd');

  tctx.beginPath();
  tctx.moveTo(tail.bL.x, tail.bL.y);
  tctx.lineTo(tipOut.x,  tipOut.y);
  tctx.lineTo(tail.bR.x, tail.bR.y);
  tctx.strokeStyle = el.stroke;
  tctx.lineWidth   = el.strokeW * s;
  tctx.lineJoin    = 'round';
  tctx.lineCap     = 'round';
  tctx.miterLimit  = 2.5;
  tctx.stroke();
  tctx.restore();
}

    }

    // テキスト
    for (const el of state.elements) {
      if (el.type !== 'text' || el.hidden) continue;
      tctx.save();
      tctx.fillStyle   = el.color;
      tctx.textAlign   = 'center';
      tctx.textBaseline= 'middle';
      tctx.font        = `${el.size * s}px ${el.font}`;
      wrapTextHD(tctx, el.text, el.x * s, el.y * s, 240 * s, el.size * 1.2 * s);
      tctx.restore();
    }

    return tmp.toDataURL('image/png');
  }

  // 3) 背景画像が無ければ、従来通りの 300×300 正方形で出力
  const tmp = document.createElement('canvas');
  tmp.width = EXPORT_SIZE;
  tmp.height = EXPORT_SIZE;
  const tctx = tmp.getContext('2d');
  if (!bgTransparent) {
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, tmp.width, tmp.height);
  }
  const s = EXPORT_SIZE / canvas.width;

  // ===== 画像層 =====
  for (const el of state.elements) {
    if (el.type === 'image' && !el.hidden) {
      tctx.drawImage(
        el.img,
        (el.x - el.w / 2) * s,
        (el.y - el.h / 2) * s,
        el.w * s,
        el.h * s
      );
    }
  }

  // ===== 吹き出し層 =====
  for (const el of state.elements) {
    if (el.type !== 'bubble' || el.hidden) continue;

    const w = el.w * s, h = el.h * s;

    // しっぽ計算（思考/爆発は無し）
    let tail = null;
    if (el.tail && el.tail.enabled && el.shape !== 'thought') {
      const ca = Math.cos(el.tail.angle), sa = Math.sin(el.tail.angle);
      let edgeBase;
      if (el.shape === 'rect') {
        const r = RECT_R * s;
        // 角丸のSDFで外周交点をレイマーチ
        let t0 = 0, t1 = Math.max(el.w, el.h) * s;
        const sdfRR = (px, py, w, h, r) => {
          const qx = Math.abs(px) - (w/2 - r);
          const qy = Math.abs(py) - (h/2 - r);
          const qx2 = Math.max(qx, 0), qy2 = Math.max(qy, 0);
          return Math.hypot(qx2, qy2) + Math.min(Math.max(qx, qy), 0) - r;
        };
        for (let i = 0; i < 22; i++) {
          const tm = (t0 + t1) / 2, px = tm * ca, py = tm * sa;
          const d = sdfRR(px, py, el.w * s, el.h * s, r);
          if (d > 0) t1 = tm; else t0 = tm;
        }
        const t = (t0 + t1) / 2;
        edgeBase = { x: el.x * s + t * ca, y: el.y * s + t * sa };
      } else {
        const rx = (el.w / 2) * s, ry = (el.h / 2) * s;
        const t = 1 / Math.sqrt((ca * ca) / (rx * rx) + (sa * sa) / (ry * ry));
        edgeBase = { x: el.x * s + t * ca, y: el.y * s + t * sa };
      }
      const tip = {
        x: edgeBase.x + (el.tail.length * s) * ca,
        y: edgeBase.y + (el.tail.length * s) * sa
      };
      const nx = -sa, ny = ca;
      const halfW = (el.tail.width * s) / 2;
      const k = Math.max(-0.9, Math.min(0.9, el.tail.skew ?? 0));
      const leftW = halfW * (1 + k);
      const rightW = halfW * (1 - k);
      const bL = { x: edgeBase.x + nx * leftW, y: edgeBase.y + ny * leftW };
      const bR = { x: edgeBase.x - nx * rightW, y: edgeBase.y - ny * rightW };
      tail = { bL, bR, tip };
      const EPS_INNER = (el.shape === 'rect') ? 1.2 * s : 0.5 * s;
const bL_in = { x: bL.x - nx*EPS_INNER, y: bL.y - ny*EPS_INNER };
const bR_in = { x: bR.x + nx*EPS_INNER, y: bR.y + ny*EPS_INNER };

tail = { bL, bR, tip, bL_in, bR_in };

    }

    // 本体塗り
    tctx.save();
    tctx.fillStyle = el.fill;
    tctx.translate(el.x * s, el.y * s);
    tctx.beginPath();

    const drawRR = (W, H, R) => {
      const rr = Math.min(R, Math.min(W, H) / 2);
      tctx.moveTo(-W/2 + rr, -H/2);
      tctx.arcTo(W/2, -H/2,  W/2,  H/2, rr);
      tctx.arcTo(W/2,  H/2, -W/2,  H/2, rr);
      tctx.arcTo(-W/2, H/2, -W/2, -H/2, rr);
      tctx.arcTo(-W/2, -H/2,  W/2, -H/2, rr);
      tctx.closePath();
    };

    if (el.shape === 'rect') drawRR(w, h, RECT_R * s);
    else if (el.shape === 'cloud' || el.shape === 'thought') {
      const a = Math.min(w, h) / 2;
      tctx.arc(-w/2 + a*0.8,  -h/2 + a*0.9, a*0.55, 0, Math.PI*2);
      tctx.arc(-w/2 + a*1.2,  -h/2 + a*0.7, a*0.6,  0, Math.PI*2);
      tctx.arc(-w/2 + a*1.6,  -h/2 + a*0.9, a*0.5,  0, Math.PI*2);
      tctx.arc(-w/2 + a*1.2,  -h/2 + a*1.2, a*0.6,  0, Math.PI*2);
      if (el.shape === 'thought') {
        // しっぽは別処理なので本体のみ
      }
    } else if (el.shape === 'burst') {
      // 爆発ギザギザ
      const spikes = 12, R = Math.min(w, h) * 0.50, r = R * 0.62;
      const step = (Math.PI * 2) / (spikes * 2);
      tctx.moveTo(R, 0);
      for (let i = 1; i < spikes * 2; i++) {
        const ang = i * step;
        const rad = (i % 2 === 0) ? R : r;
        tctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      tctx.closePath();
    } else {
      // 丸（最大角丸）
      drawRR(w, h, Math.min(w, h) / 2);
    }

    tctx.fill();
    tctx.restore();

    // 外枠線
    tctx.save();
    tctx.translate(el.x * s, el.y * s);
    tctx.strokeStyle = el.stroke;
    tctx.lineWidth = el.strokeW * s;
    tctx.lineJoin = 'miter';
    tctx.lineCap = 'round';
    tctx.miterLimit = 3;

    tctx.beginPath();
    if (el.shape === 'rect') {
      const rr = Math.min(RECT_R * s, Math.min(w, h)/2);
      tctx.moveTo(-w/2+rr, -h/2);
      tctx.arcTo(w/2, -h/2,  w/2,  h/2, rr);
      tctx.arcTo(w/2,  h/2, -w/2,  h/2, rr);
      tctx.arcTo(-w/2, h/2, -w/2, -h/2, rr);
      tctx.arcTo(-w/2, -h/2,  w/2, -h/2, rr);
      tctx.closePath();
    } else if (el.shape === 'cloud' || el.shape === 'thought') {
      const a = Math.min(w, h) / 2;
      tctx.arc(-w/2 + a*0.8,  -h/2 + a*0.9, a*0.55, 0, Math.PI*2);
      tctx.arc(-w/2 + a*1.2,  -h/2 + a*0.7, a*0.6,  0, Math.PI*2);
      tctx.arc(-w/2 + a*1.6,  -h/2 + a*0.9, a*0.5,  0, Math.PI*2);
      tctx.arc(-w/2 + a*1.2,  -h/2 + a*1.2, a*0.6,  0, Math.PI*2);
    } else if (el.shape === 'burst') {
      const spikes = 12, R = Math.min(w, h) * 0.50, r = R * 0.62;
      const step = (Math.PI * 2) / (spikes * 2);
      tctx.moveTo(R, 0);
      for (let i = 1; i < spikes * 2; i++) {
        const ang = i * step;
        const rad = (i % 2 === 0) ? R : r;
        tctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      tctx.closePath();
    } else {
      const rr = Math.min(w, h)/2;
      tctx.moveTo(-w/2+rr, -h/2);
      tctx.arcTo(w/2, -h/2,  w/2,  h/2, rr);
      tctx.arcTo(w/2,  h/2, -w/2,  h/2, rr);
      tctx.arcTo(-w/2, h/2, -w/2, -h/2, rr);
      tctx.arcTo(-w/2, -h/2,  w/2, -h/2, rr);
      tctx.closePath();
    }
    tctx.stroke();
    tctx.restore();

// しっぽ（基部は描かず、外側2辺のみ表示）
// 先に未クリップで小三角を塗って“接着”→ その後 外側だけ stroke
if (tail) {
  const EXT = 0.6 * s;
  const ca = Math.cos(el.tail.angle), sa = Math.sin(el.tail.angle);
  const tipOut = { x: tail.tip.x + ca*EXT, y: tail.tip.y + sa*EXT };

  // ① 未クリップで小三角を塗る（内側点を使って本体に食い込ませる）
  tctx.beginPath();
  tctx.moveTo(tail.bL_in?.x ?? tail.bL.x, tail.bL_in?.y ?? tail.bL.y);
  tctx.lineTo(tipOut.x, tipOut.y);
  tctx.lineTo(tail.bR_in?.x ?? tail.bR.x, tail.bR_in?.y ?? tail.bR.y);
  tctx.closePath();
  tctx.fillStyle = el.fill;
  tctx.fill();

  // ② 外側だけ clip して2辺を stroke
  const outside = new Path2D();
  outside.rect(0, 0, tmp.width, tmp.height);

  const shape = new Path2D();
  const ox = el.x * s, oy = el.y * s;
  const w2 = el.w * s, h2 = el.h * s;
  const rr2 = Math.min(RECT_R * s, Math.min(w2, h2) / 2);
  shape.moveTo(ox - w2/2 + rr2, oy - h2/2);
  shape.arcTo(ox + w2/2, oy - h2/2,  ox + w2/2,  oy + h2/2, rr2);
  shape.arcTo(ox + w2/2, oy + h2/2,  ox - w2/2,  oy + h2/2, rr2);
  shape.arcTo(ox - w2/2, oy + h2/2,  ox - w2/2,  oy - h2/2, rr2);
  shape.arcTo(ox - w2/2, oy - h2/2,  ox + w2/2,  oy - h2/2, rr2);
  shape.closePath();

  const clipPath = new Path2D();
  clipPath.addPath(outside);
  clipPath.addPath(shape);

  tctx.save();
  tctx.clip(clipPath, 'evenodd');

  tctx.beginPath();
  tctx.moveTo(tail.bL.x, tail.bL.y);
  tctx.lineTo(tipOut.x,  tipOut.y);
  tctx.lineTo(tail.bR.x, tail.bR.y);
  tctx.strokeStyle = el.stroke;
  tctx.lineWidth   = el.strokeW * s;
  tctx.lineJoin    = 'round';
  tctx.lineCap     = 'round';
  tctx.miterLimit  = 2.5;
  tctx.stroke();
  tctx.restore();
}

  }

  // ===== テキスト層 =====
  for (const el of state.elements) {
    if (el.type !== 'text' || el.hidden) continue;
    tctx.save();
    tctx.fillStyle   = el.color;
    tctx.textAlign   = 'center';
    tctx.textBaseline= 'middle';
    tctx.font        = `${el.size * s}px ${el.font}`;
    wrapTextHD(tctx, el.text, el.x * s, el.y * s, 240 * s, el.size * 1.2 * s);
    tctx.restore();
  }

  return tmp.toDataURL('image/png');
}

// 右の丸ボタン「保存」
// 保存ボタン（#ftSave が無いHTMLでも動くようにフォールバック）
const saveBtn =
  document.getElementById('ftSave') ||
  [...document.querySelectorAll('.floating-tools .icon-btn')].find(b =>
    b?.title === '保存' || (b?.textContent || '').includes('💾')
  );

saveBtn?.addEventListener('click', () => {
  const url = renderPNGDataURL();
  const img = document.getElementById('savedImagePreview');
  const modal = document.getElementById('saveModal');
  img.src = url;

  // SNS共有リンクの設定
  const imageUrl = img.src;
  const x = document.getElementById('modalShareX');
  const li = document.getElementById('modalShareLINE');
  const ig = document.getElementById('modalShareInsta');
  if (x)  x.href  = `https://twitter.com/intent/tweet?text=作ったスタンプをシェア！&url=${encodeURIComponent(imageUrl)}`;
  if (li) li.href = `https://line.me/R/msg/text/?${encodeURIComponent(imageUrl)}`;
  if (ig) ig.href = `https://www.instagram.com/`;

  modal?.classList.remove('hidden');
});

// モーダルの操作
document.getElementById('closeModal')?.addEventListener('click', () => {
  document.getElementById('saveModal')?.classList.add('hidden');
});
document.getElementById('savedImagePreview')?.addEventListener('click', (e) => {
  // 画像タップで別タブ表示（長押し保存もしやすい）
  const src = e.currentTarget.src;
  window.open(src, '_blank', 'noopener');
});

// export 用爆発パス（tctx版）
function burstPathExport(tctx, w, h, spikes = 12, innerRatio = 0.42) {
  const rx = w * 0.46, ry = h * 0.46;
  const outer = Math.min(rx, ry);
  const inner = outer * innerRatio;
  const step = Math.PI / spikes;
  let ang = -Math.PI/2;

  tctx.moveTo(Math.cos(ang)*outer, Math.sin(ang)*outer);
  for (let i=0; i<spikes; i++) {
    ang += step; tctx.lineTo(Math.cos(ang)*inner, Math.sin(ang)*inner);
    ang += step; tctx.lineTo(Math.cos(ang)*outer, Math.sin(ang)*outer);
  }
}

function wrapTextHD(c, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = c.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  const offsetY = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => c.fillText(l.trim(), x, y + offsetY + i * lineHeight));
}
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