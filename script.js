// ====== 基本設定 ======
const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
let bgTransparent = true;     // 背景透過フラグ
let exportSize = 300;         // 出力サイズ

// 論理サイズは 300x300 固定（見た目はCSSで拡大）
canvas.width = 300;
canvas.height = 300;

// ====== 状態管理（要素の配列） ======
const state = {
  elements: [],       // {id, type: 'bubble'|'text'|'image', x,y, w,h, ...}
  selectedId: null,
  history: [],
  future: [],
};

function snapshot() {
  state.history.push(JSON.stringify(state.elements));
  if (state.history.length > 50) state.history.shift();
  state.future = []; // 未来は破棄
}
function undo() {
  if (!state.history.length) return;
  state.future.push(JSON.stringify(state.elements));
  state.elements = JSON.parse(state.history.pop());
  draw();
}
function redo() {
  if (!state.future.length) return;
  state.history.push(JSON.stringify(state.elements));
  state.elements = JSON.parse(state.future.pop());
  draw();
}

// ====== 要素生成 ======
const genId = () => Math.random().toString(36).slice(2, 9);

function addBubble(shape = 'round') {
  snapshot();
  state.elements.push({
    id: genId(),
    type: 'bubble',
    shape, x: 150, y: 150, w: 200, h: 140,
    fill: document.getElementById('fillColor').value,
    stroke: document.getElementById('strokeColor').value,
    strokeW: parseInt(document.getElementById('strokeWidth').value, 10),
  });
  draw();
}

function addText() {
  snapshot();
  state.elements.push({
    id: genId(),
    type: 'text',
    x: 150, y: 150,
    text: document.getElementById('textInput').value || 'テキスト',
    color: document.getElementById('textColor').value,
    size: parseInt(document.getElementById('fontSize').value, 10),
    font: document.getElementById('fontFamily').value,
    align: 'center',
  });
  draw();
}

function addImage(file) {
  const img = new Image();
  img.onload = () => {
    snapshot();
    // 画像はキャンバス中央に収まるようにスケーリング
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    state.elements.push({ id: genId(), type: 'image', x: 150, y: 150, w, h, img });
    draw();
  };
  img.src = URL.createObjectURL(file);
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
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.fillStyle = el.fill; ctx.strokeStyle = el.stroke; ctx.lineWidth = el.strokeW; ctx.lineJoin = 'round';
  const w = el.w, h = el.h; const r = 24;
  ctx.beginPath();
  if (el.shape === 'rect') {
    // 角丸
    roundedRectPath(-w/2, -h/2, w, h, 18);
  } else if (el.shape === 'cloud') {
    cloudPath(w, h);
  } else if (el.shape === 'thought') {
    thoughtPath(w, h);
  } else {
    // 丸
    roundedRectPath(-w/2, -h/2, w, h, Math.min(w, h)/2);
  }
  ctx.fill(); ctx.stroke();
  ctx.restore();
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
  // しっぽ
  ctx.moveTo(w*0.1 - w/2, h*0.4 - h/2);
  ctx.arc(w*0.1 - w/2, h*0.4 - h/2, 8, 0, Math.PI*2);
  ctx.moveTo(w*0.05 - w/2, h*0.55 - h/2);
  ctx.arc(w*0.05 - w/2, h*0.55 - h/2, 5, 0, Math.PI*2);
}

function drawText(el) {
  ctx.save();
  ctx.fillStyle = el.color; ctx.font = `${el.size}px ${el.font}`; ctx.textAlign = el.align; ctx.textBaseline = 'middle';
  ctx.translate(el.x, el.y);
  wrapText(el.text, 0, 0, 240, el.size * 1.2);
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

function drawImageEl(el) {
  ctx.save();
  ctx.drawImage(el.img, el.x - el.w/2, el.y - el.h/2, el.w, el.h);
  ctx.restore();
}

function drawSelection(el) {
  ctx.save();
  ctx.strokeStyle = '#5ca7ff'; ctx.setLineDash([6,4]); ctx.lineWidth = 2;
  if (el.type === 'text') {
    const w = 260, h = el.size*1.6; // ざっくり
    ctx.strokeRect(el.x - w/2, el.y - h/2, w, h);
  } else {
    ctx.strokeRect(el.x - el.w/2, el.y - el.h/2, el.w, el.h);
  }
  ctx.restore();
}

function draw() {
  drawBackground();
  for (const el of state.elements) {
    if (el.type === 'image') drawImageEl(el);
  }
  for (const el of state.elements) {
    if (el.type === 'bubble') drawBubble(el);
  }
  for (const el of state.elements) {
    if (el.type === 'text') drawText(el);
  }
  const sel = state.elements.find(e => e.id === state.selectedId);
  if (sel) drawSelection(sel);
}

// ====== ヒットテスト & ドラッグ ======
function hitTest(x, y) {
  // 上から（見た目の最前面）
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const el = state.elements[i];
    if (el.type === 'text') {
      const w = 260, h = el.size*1.6;
      if (x > el.x - w/2 && x < el.x + w/2 && y > el.y - h/2 && y < el.y + h/2) return el.id;
    } else {
      if (x > el.x - el.w/2 && x < el.x + el.w/2 && y > el.y - el.h/2 && y < el.y + el.h/2) return el.id;
    }
  }
  return null;
}

let dragging = false;
let dragOffsetX = 0, dragOffsetY = 0;

function pointerPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

canvas.addEventListener('pointerdown', (e) => {
  const {x, y} = pointerPos(e);
  const id = hitTest(x, y);
  if (id) {
    state.selectedId = id; dragging = true;
    const sel = state.elements.find(el => el.id === id);
    dragOffsetX = x - sel.x; dragOffsetY = y - sel.y;
    snapshot();
    draw();
  } else { state.selectedId = null; draw(); }
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const {x, y} = pointerPos(e);
  const sel = state.elements.find(el => el.id === state.selectedId);
  if (!sel) return;
  sel.x = x - dragOffsetX; sel.y = y - dragOffsetY;
  draw();
});

canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

// ====== UIイベント ======
const tabButtons = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

tabButtons.forEach(btn => btn.addEventListener('click', () => {
  tabButtons.forEach(b => b.classList.remove('is-active'));
  panels.forEach(p => p.classList.remove('is-active'));
  btn.classList.add('is-active');
  document.querySelector(`.panel[data-panel="${btn.dataset.tab}"]`).classList.add('is-active');
}));

// 追加ボタンたち
Array.from(document.querySelectorAll('[data-action="add-bubble"]')).forEach(b => {
  b.addEventListener('click', () => addBubble(b.dataset.shape));
});

document.getElementById('addTextBtn').addEventListener('click', addText);

document.getElementById('textInput').addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (sel) { sel.text = e.target.value; draw(); }
});

document.getElementById('fontSize').addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (sel) { sel.size = parseInt(e.target.value, 10); draw(); }
});

document.getElementById('fontFamily').addEventListener('change', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'text');
  if (sel) { sel.font = e.target.value; draw(); }
});

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

document.getElementById('strokeWidth').addEventListener('input', (e) => {
  const sel = state.elements.find(el => el.id === state.selectedId && el.type === 'bubble');
  if (sel) { sel.strokeW = parseInt(e.target.value, 10); draw(); }
});

// 背景画像
const addImageBtn = document.getElementById('addImageBtn');
const imageUpload = document.getElementById('imageUpload');
const centerUploadBtn = document.getElementById('centerUploadBtn');
addImageBtn.addEventListener('click', () => imageUpload.click());
centerUploadBtn.addEventListener('click', () => imageUpload.click());
imageUpload.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) {
    addImage(f);
    if (centerUploadBtn) centerUploadBtn.style.display = 'none';
  }
});

// ランダムスタイル
function randomStyle() {
  const pal = ["#ffffff", "#fef7d1", "#e6f7ff", "#fbe3e8", "#e6ffe8"];
  const stroke = ["#000000", "#1a1a1a", "#2d2d2d"];
  const fonts = [
    "Noto Sans JP, system-ui, sans-serif",
    "'Zen Maru Gothic', system-ui, sans-serif",
    "'Shippori Mincho', serif",
    "'RocknRoll One', system-ui, sans-serif"
  ];
  const sel = state.elements.find(el => el.id === state.selectedId);
  if (!sel) return;
  if (sel.type === 'bubble') {
    sel.fill = pal[Math.floor(Math.random()*pal.length)];
    sel.stroke = stroke[Math.floor(Math.random()*stroke.length)];
    sel.strokeW = 4 + Math.floor(Math.random()*10);
  } else if (sel.type === 'text') {
    sel.color = stroke[Math.floor(Math.random()*stroke.length)];
    sel.font = fonts[Math.floor(Math.random()*fonts.length)];
    sel.size = 20 + Math.floor(Math.random()*60);
  }
  draw();
}

document.getElementById('randomBtn').addEventListener('click', randomStyle);

// 背景透過切替
const toggleBgBtn = document.getElementById('toggleBgBtn');
toggleBgBtn.addEventListener('click', () => {
  bgTransparent = !bgTransparent;
  toggleBgBtn.textContent = `背景：${bgTransparent ? '透過' : '白'}`;
  draw();
});

// 保存
const exportSizeRange = document.getElementById('exportSize');
const exportSizeVal = document.getElementById('exportSizeVal');
const saveBtn = document.getElementById('saveBtn');
const saveResult = document.getElementById('saveResult');
const previewImg = document.getElementById('previewImg');
const downloadLink = document.getElementById('downloadLink');

exportSizeRange.addEventListener('input', (e) => {
  exportSize = parseInt(e.target.value, 10);
  exportSizeVal.textContent = `${exportSize}px`;
});

saveBtn.addEventListener('click', () => {
  // 一時キャンバスで高解像度描画
  const tmp = document.createElement('canvas');
  tmp.width = exportSize; tmp.height = exportSize;
  const tctx = tmp.getContext('2d');

  // 背景
  if (!bgTransparent) { tctx.fillStyle = '#ffffff'; tctx.fillRect(0,0,tmp.width,tmp.height); }

  // スケール比
  const s = exportSize / canvas.width;
  // 画像
  for (const el of state.elements) {
    if (el.type === 'image') {
      tctx.drawImage(el.img, (el.x - el.w/2)*s, (el.y - el.h/2)*s, el.w*s, el.h*s);
    }
  }
  // 吹き出し
  for (const el of state.elements) {
    if (el.type === 'bubble') {
      tctx.save();
      tctx.translate(el.x*s, el.y*s);
      tctx.fillStyle = el.fill; tctx.strokeStyle = el.stroke; tctx.lineWidth = el.strokeW*s; tctx.lineJoin = 'round';
      tctx.beginPath();
      // 同じ形状で簡略描画
      const w = el.w*s, h = el.h*s;
      const rr = Math.min(Math.min(w, h)/2, 24*s);
      // 丸・角丸の簡易版
      tctx.moveTo(-w/2+rr, -h/2);
      tctx.arcTo(w/2, -h/2, w/2, h/2, rr);
      tctx.arcTo(w/2, h/2, -w/2, h/2, rr);
      tctx.arcTo(-w/2, h/2, -w/2, -h/2, rr);
      tctx.arcTo(-w/2, -h/2, w/2, -h/2, rr);
      tctx.closePath();
      tctx.fill(); tctx.stroke();
      tctx.restore();
    }
  }
  // テキスト
  for (const el of state.elements) {
    if (el.type === 'text') {
      tctx.save();
      tctx.fillStyle = el.color; tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
      tctx.font = `${el.size*s}px ${el.font}`;
      wrapTextHD(tctx, el.text, el.x*s, el.y*s, 240*s, el.size*1.2*s);
      tctx.restore();
    }
  }

  const url = tmp.toDataURL('image/png');
  previewImg.src = url;
  downloadLink.href = url;
  saveResult.hidden = false;
});

function wrapTextHD(c, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  const lines = [];
  for (let n=0; n<words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = c.measureText(testLine);
    if (metrics.width > maxWidth && n>0) { lines.push(line); line = words[n] + ' '; }
    else { line = testLine; }
  }
  lines.push(line);
  const offsetY = -((lines.length-1) * lineHeight) / 2;
  lines.forEach((l, i) => c.fillText(l.trim(), x, y + offsetY + i*lineHeight));
}

// Undo/Redo
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// 初期描画
draw();