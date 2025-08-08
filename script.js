// ====== setup ======
const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d");

let elements = [];            // bubble と text の配列（B案でも単独textは残しておく）
let selectedElement = null;

let baseImage = null;
let imageX = 0, imageY = 0;
let imageDragging = false;
let imageOffsetX = 0, imageOffsetY = 0;

let resizeStartY = null;
let initialFontSize = null;

let offsetX = 0, offsetY = 0;

let lastTapTime = 0;
let lastTapPos = { x: 0, y: 0 };

const bubbleShapeSelect = document.getElementById("bubbleShape");
const bubbleColorPicker = document.getElementById("bubbleColor");

// ID発番（単独text用にも使う）
let __nextId = 1;
const genId = () => __nextId++;

// ====== image upload ======
document.getElementById("imageUpload").addEventListener("change", (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      imageX = 0;
      imageY = 0;
      renderCanvas();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById("resetImagePosition").addEventListener("click", () => {
  if (baseImage) {
    imageX = 0;
    imageY = 0;
    renderCanvas();
  }
});

// ====== add bubble (B案: テキスト込みオブジェクト) ======
document.getElementById("addBubble").addEventListener("click", () => {
  const selectedShape = bubbleShapeSelect?.value || "rounded";
  const fill = bubbleColorPicker?.value || "#ffffff";

  elements.push({
    id: genId(),
    type: "bubble",
    shape: selectedShape,    // "rounded" | "oval" | "spike1" | "spike2" | "thought1" | "thought2"
    x: 50, y: 50, w: 180, h: 120,
    fill,
    pointerPosition: "bottom",   // "top" | "bottom" | "left" | "right"
    pointerOffset: 0.5,          // 0..1 （四角・角丸の時）
    // —— テキストも内包 ——
    text: "",
    font: document.getElementById("fontSelect").value || "sans-serif",
    color: document.getElementById("textColor").value || "#000000",
    size: 28,
    // 操作フラグ
    dragging: false, resizing: false, draggingPointer: false,
    resizingText: false,
  });
  renderCanvas();
});

// ====== add / set text ======
// 選択中が bubble なら “そのバブルのテキスト” として反映。
// 何も選んでない場合だけ単独 text 要素を作る（互換維持）。
document.getElementById("addText").addEventListener("click", () => {
  const text = document.getElementById("textInput").value;
  const font = document.getElementById("fontSelect").value;
  const color = document.getElementById("textColor").value;
  if (!text) return;

  if (selectedElement && selectedElement.type === "bubble") {
    selectedElement.text = text;
    selectedElement.font = font;
    selectedElement.color = color;
    renderCanvas();
    return;
  }

  // 未選択なら単独テキストも作れるままにしておく（従来互換）
  elements.push({
    id: genId(),
    type: "text",
    text,
    font,
    color,
    x: 50,
    y: 200,
    size: 24,
    dragging: false,
    resizing: false,
  });
  renderCanvas();
});

// ====== delete selected ======
document.getElementById("deleteSelected").addEventListener("click", () => {
  if (!selectedElement) return;
  elements.splice(elements.indexOf(selectedElement), 1);
  selectedElement = null;
  renderCanvas();
});

// ====== drawing primitives ======
function drawBubbleShape(el, g) {
  const { x, y, w, h, shape } = el;
  g.beginPath();
  switch (shape) {
    case "oval":
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
      break;
    case "rounded":
      g.roundRect(x, y, w, h, 16);
      break;
    case "spike1":
      drawSpikeBubble(g, x, y, w, h, 10); // ギザギザ枠（外形）
      break;
    case "spike2":
      drawSpikeBubble(g, x, y, w, h, 16);
      break;
    case "thought1":
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
      drawThoughtDots(g, x + w, y + h);
      break;
    case "thought2":
      drawCloudBubble(g, x, y, w, h);
      drawThoughtDots(g, x + w, y + h);
      break;
    default:
      g.roundRect(x, y, w, h, 16);
  }
  g.closePath();
}

function drawSpikeBubble(g, x, y, w, h, spikes) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const R = Math.min(w, h) / 2;
  const r = R * 0.72;
  const step = Math.PI / spikes;
  g.moveTo(cx + R, cy);
  for (let i = 0; i < 2 * spikes; i++) {
    const rad = (i % 2 === 0) ? R : r;
    const ang = i * step;
    g.lineTo(cx + rad * Math.cos(ang), cy + rad * Math.sin(ang));
  }
}

function drawCloudBubble(g, x, y, w, h) {
  const r = 10, steps = 12;
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    const cx = x + w / 2 + (w / 2 - r) * Math.cos(ang);
    const cy = y + h / 2 + (h / 2 - r) * Math.sin(ang);
    g.moveTo(cx + r, cy);
    g.arc(cx, cy, r, 0, Math.PI * 2);
  }
}

function drawThoughtDots(g, x, y) {
  g.moveTo(x, y);
  g.arc(x + 5, y + 5, 5, 0, Math.PI * 2);
  g.moveTo(x + 15, y + 15);
  g.arc(x + 15, y + 15, 3, 0, Math.PI * 2);
}

// === “歪みのない普通のツノ”：中心線に対称な二等辺三角形を外側へ ===
function drawPointer(el, g) {
  const { x, y, w, h, pointerPosition, pointerOffset, fill, shape } = el;
  const size = 18; // ツノの長さ
  g.fillStyle = fill;
  g.beginPath();

  // 接点を計算
  const base = getPointerPos(el);

  // 法線方向（外向き）
  let nx = 0, ny = 0;
  if (shape === "oval") {
    // 楕円は接点の極角から外向きベクトル
    const cx = x + w / 2, cy = y + h / 2;
    const rx = w / 2, ry = h / 2;
    const t = Math.atan2(base.y - cy, base.x - cx);
    // 楕円の法線はおおむね (cos t / rx, sin t / ry) 方向
    nx = (Math.cos(t) / rx);
    ny = (Math.sin(t) / ry);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
  } else {
    // 四角/角丸は面の外側へ
    switch (pointerPosition) {
      case "top":    nx = 0;  ny = -1; break;
      case "bottom": nx = 0;  ny = 1;  break;
      case "left":   nx = -1; ny = 0;  break;
      case "right":  nx = 1;  ny = 0;  break;
    }
  }

  // 接線方向（見た目の幅）
  const tx = -ny, ty = nx;

  // ツノ基部の中心から、接線方向に左右へ半分ずらす
  const half = Math.max(8, size * 0.45);
  const p1x = base.x + tx * half;
  const p1y = base.y + ty * half;
  const p2x = base.x - tx * half;
  const p2y = base.y - ty * half;

  // 先端は法線方向へ
  const tipx = base.x + nx * size;
  const tipy = base.y + ny * size;

  g.moveTo(p1x, p1y);
  g.lineTo(tipx, tipy);
  g.lineTo(p2x, p2y);
  g.closePath();
  g.fill();
  g.stroke();
}

// 接点（バブル外周上の1点）
function getPointerPos(el) {
  const { x, y, w, h, pointerPosition, pointerOffset, shape } = el;
  if (shape === "oval") {
    const cx = x + w / 2, cy = y + h / 2;
    const rx = w / 2, ry = h / 2;
    let ang = 0;
    switch (pointerPosition) {
      case "top": ang = -Math.PI / 2; break;
      case "bottom": ang =  Math.PI / 2; break;
      case "left": ang = Math.PI; break;
      case "right": ang = 0; break;
    }
    return { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) };
  } else {
    switch (pointerPosition) {
      case "top":    return { x: x + w * pointerOffset, y: y };
      case "bottom": return { x: x + w * pointerOffset, y: y + h };
      case "left":   return { x: x, y: y + h * pointerOffset };
      case "right":  return { x: x + w, y: y + h * pointerOffset };
    }
  }
}

// ====== render ======
function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (baseImage) ctx.drawImage(baseImage, imageX, imageY, canvas.width, canvas.height);

  for (const el of elements) {
    if (el.type === "bubble") {
      // 本体
      ctx.fillStyle = el.fill;
      drawBubbleShape(el, ctx);
      ctx.fill();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.stroke();

      // ツノ
      drawPointer(el, ctx);

      // テキスト描画（内側余白）
      const padX = 16, padY = 14;
      ctx.font = `${el.size || 24}px ${el.font}`;
      ctx.fillStyle = el.color;
      // 左上余白 + ベースライン
      const baselineY = el.y + padY + (el.size || 24);
      ctx.fillText(el.text || "", el.x + padX, baselineY);

      // 選択中表示（サイズ・ツノ・テキスト）
      if (el === selectedElement) {
        // バブルのリサイズハンドル
        ctx.fillStyle = "blue";
        ctx.fillRect(el.x + el.w - 5, el.y + el.h - 5, 10, 10);
        // ツノハンドル（接点）
        const p = getPointerPos(el);
        ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
        // テキストのガイド
        const w = ctx.measureText(el.text || "").width;
        const h = el.size || 24;
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = "black";
        ctx.strokeRect(el.x + padX, baselineY - h + 4, w, h);
        ctx.setLineDash([]);
        ctx.fillRect(el.x + padX + w - 5, baselineY - h - 5, 10, 10);
      }
    }

    if (el.type === "text") {
      // 互換：単独テキスト
      ctx.font = `${el.size || 24}px ${el.font}`;
      ctx.fillStyle = el.color;
      ctx.fillText(el.text, el.x, el.y);

      if (el === selectedElement) {
        const w = ctx.measureText(el.text).width;
        const h = el.size || 24;
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = "black";
        ctx.strokeRect(el.x, el.y - h + 4, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = "blue";
        ctx.fillRect(el.x + w - 5, el.y - h - 5, 10, 10);
      }
    }
  }
}

// ====== events ======
canvas.addEventListener("mousedown", onMouseDown);
canvas.addEventListener("mousemove", onMouseMove);
canvas.addEventListener("mouseup", onMouseUp);
canvas.addEventListener("touchstart", onTouchStart);
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  onMouseMove(convertTouchToMouseEvent(e));
});
canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  onMouseUp();
});

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onMouseDown(e) {
  const pos = getMousePos(e);
  selectedElement = null;

  // 上にあるもの優先でヒットテスト
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];

    if (el.type === "bubble") {
      // ツノハンドル
      const pointerPos = getPointerPos(el);
      if (Math.abs(pos.x - pointerPos.x) < 10 && Math.abs(pos.y - pointerPos.y) < 10) {
        el.draggingPointer = true;
        selectedElement = el;
        return;
      }
      // テキストリサイズハンドル
      const padX = 16, padY = 14;
      ctx.font = `${el.size || 24}px ${el.font}`;
      const baselineY = el.y + padY + (el.size || 24);
      const textW = ctx.measureText(el.text || "").width;
      const textH = el.size || 24;
      const rx = el.x + padX + textW, ry = baselineY - textH;
      if (pos.x >= rx - 5 && pos.x <= rx + 5 && pos.y >= ry - 5 && pos.y <= ry + 5) {
        el.resizingText = true;
        selectedElement = el;
        resizeStartY = pos.y;
        initialFontSize = el.size || 24;
        return;
      }
      // バブルのリサイズ
      if (Math.abs(pos.x - (el.x + el.w)) < 10 && Math.abs(pos.y - (el.y + el.h)) < 10) {
        el.resizing = true;
        selectedElement = el;
        return;
      }
      // バブル内ヒット（ドラッグ）
      if (pos.x >= el.x && pos.x <= el.x + el.w && pos.y >= el.y && pos.y <= el.y + el.h) {
        el.dragging = true;
        offsetX = pos.x - el.x;
        offsetY = pos.y - el.y;
        selectedElement = el;
        return;
      }
    }

    if (el.type === "text") {
      const fontSize = el.size || 24;
      ctx.font = `${fontSize}px ${el.font}`;
      const w = ctx.measureText(el.text).width;
      const h = fontSize;
      // テキストリサイズ
      if (pos.x >= el.x + w - 5 && pos.x <= el.x + w + 5 && pos.y >= el.y - h - 5 && pos.y <= el.y - h + 5) {
        el.resizing = true;
        selectedElement = el;
        resizeStartY = pos.y;
        initialFontSize = fontSize;
        return;
      }
      // テキストドラッグ
      if (pos.x >= el.x && pos.x <= el.x + w && pos.y >= el.y - h && pos.y <= el.y) {
        el.dragging = true;
        offsetX = pos.x - el.x;
        offsetY = pos.y - el.y;
        selectedElement = el;
        return;
      }
    }
  }

  // 背景画像ドラッグ
  if (baseImage) {
    imageDragging = true;
    imageOffsetX = pos.x - imageX;
    imageOffsetY = pos.y - imageY;
  }
}

function onMouseMove(e) {
  const pos = getMousePos(e);
  if (selectedElement) {
    const el = selectedElement;
    if (el.type === "bubble") {
      if (el.resizing) {
        el.w = Math.max(40, pos.x - el.x);
        el.h = Math.max(40, pos.y - el.y);
      } else if (el.resizingText) {
        const dy = pos.y - resizeStartY;
        el.size = Math.max(8, initialFontSize + dy * 0.25);
      } else if (el.draggingPointer) {
        // ツノの位置を面に応じて切替＆オフセット更新
        const relX = (pos.x - el.x) / el.w;
        const relY = (pos.y - el.y) / el.h;
        if (relY < 0) {
          el.pointerPosition = "top";
          el.pointerOffset = Math.min(Math.max(relX, 0), 1);
        } else if (relY > 1) {
          el.pointerPosition = "bottom";
          el.pointerOffset = Math.min(Math.max(relX, 0), 1);
        } else if (relX < 0) {
          el.pointerPosition = "left";
          el.pointerOffset = Math.min(Math.max(relY, 0), 1);
        } else if (relX > 1) {
          el.pointerPosition = "right";
          el.pointerOffset = Math.min(Math.max(relY, 0), 1);
        }
      } else if (el.dragging) {
        el.x = pos.x - offsetX;
        el.y = pos.y - offsetY;
      }
    } else if (el.type === "text") {
      if (el.resizing) {
        const dy = pos.y - resizeStartY;
        el.size = Math.max(8, initialFontSize + dy * 0.25);
      } else if (el.dragging) {
        el.x = pos.x - offsetX;
        el.y = pos.y - offsetY;
      }
    }
  } else if (imageDragging) {
    imageX = pos.x - imageOffsetX;
    imageY = pos.y - imageOffsetY;
  }
  renderCanvas();
}

function onMouseUp() {
  if (selectedElement) {
    selectedElement.dragging = false;
    selectedElement.resizing = false;
    selectedElement.draggingPointer = false;
    selectedElement.resizingText = false;
  }
  imageDragging = false;
  resizeStartY = null;
  initialFontSize = null;
}

// ====== touch helpers ======
function onTouchStart(e) {
  if (e.touches.length > 1) return;
  e.preventDefault();
  const now = Date.now();
  const pos = getTouchPos(e);

  if (now - lastTapTime < 300) {
    const dx = pos.x - lastTapPos.x;
    const dy = pos.y - lastTapPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 20) handleDoubleTap(pos);
  }

  onMouseDown(convertTouchToMouseEvent(e));
  lastTapTime = now;
  lastTapPos = pos;
}

function getTouchPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
}

function convertTouchToMouseEvent(touchEvent) {
  const t = touchEvent.touches[0] || touchEvent.changedTouches[0];
  return { clientX: t.clientX, clientY: t.clientY };
}

function handleDoubleTap(pos) {
  selectedElement = null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === "bubble") {
      if (pos.x >= el.x && pos.x <= el.x + el.w && pos.y >= el.y && pos.y <= el.y + el.h) {
        selectedElement = el; break;
      }
    } else if (el.type === "text") {
      const fs = el.size || 24;
      ctx.font = `${fs}px ${el.font}`;
      const w = ctx.measureText(el.text).width;
      const h = fs;
      if (pos.x >= el.x && pos.x <= el.x + w && pos.y >= el.y - h && pos.y <= el.y) {
        selectedElement = el; break;
      }
    }
  }
  renderCanvas();
}

// ====== save image (一体型対応) ======
document.getElementById("saveImage").addEventListener("click", () => {
  const tempCanvas = document.createElement("canvas");
  const g = tempCanvas.getContext("2d");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  if (baseImage) g.drawImage(baseImage, imageX, imageY, canvas.width, canvas.height);

  for (const el of elements) {
    if (el.type === "bubble") {
      g.fillStyle = el.fill;
      drawBubbleShape(el, g);
      g.fill();
      g.strokeStyle = "black";
      g.lineWidth = 1;
      g.stroke();
      drawPointer(el, g);

      // text
      const padX = 16, padY = 14;
      g.font = `${el.size || 24}px ${el.font}`;
      g.fillStyle = el.color;
      const baselineY = el.y + padY + (el.size || 24);
      g.fillText(el.text || "", el.x + padX, baselineY);
    } else if (el.type === "text") {
      g.font = `${el.size || 24}px ${el.font}`;
      g.fillStyle = el.color;
      g.fillText(el.text, el.x, el.y);
    }
  }

  const dataURL = tempCanvas.toDataURL();
  // ダウンロード
  const link = document.createElement("a");
  link.download = "stamp.png";
  link.href = dataURL;
  link.click();

  // モーダル更新
  const modalImg = document.getElementById("savedImagePreview");
  modalImg.src = dataURL;

  const encodedUrl = encodeURIComponent(window.location.href);
  const encodedText = encodeURIComponent("スタンプメーカーで画像を作ってみたよ！ #スタンプメーカー");
  document.getElementById("modalShareX").href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
  document.getElementById("modalShareLINE").href = `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`;
  document.getElementById("modalShareInsta").href = `https://www.instagram.com`;

  document.getElementById("saveModal").style.display = "flex";
});

document.getElementById("closeModal").addEventListener("click", () => {
  document.getElementById("saveModal").style.display = "none";
});
