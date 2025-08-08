// === script.js (ステップ1：オレンジハンドル＋外周吸着・角度ドラッグ対応) ===
const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d");
let elements = [];
let selectedElement = null;

let resizeStartY = null;
let initialFontSize = null;
let baseImage = null;
let imageX = 0, imageY = 0;
let imageDragging = false;
let imageOffsetX = 0, imageOffsetY = 0;

let lastTapTime = 0;
let lastTapPos = { x: 0, y: 0 };

const bubbleShapeSelect = document.getElementById("bubbleShape");

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

document.getElementById("addBubble").addEventListener("click", () => {
  const selectedShape = bubbleShapeSelect?.value || "rounded";
  elements.push({
    type: "bubble",
    shape: selectedShape,      // "rounded" | "oval" | "spike1" | "spike2" | "thought1" | "thought2"
    x: 50,
    y: 50,
    w: 150,
    h: 100,
    fill: "#ffffff",
    // PowerPoint風ツノ制御（角度で吸着）
    pointerAngle: -Math.PI / 2,   // 初期は上向き
    handleDragging: false,
    // 既存フラグ（互換維持）
    dragging: false,
    resizing: false,
  });
  renderCanvas();
});

document.getElementById("addText").addEventListener("click", () => {
  const text = document.getElementById("textInput").value;
  const font = document.getElementById("fontSelect").value;
  const color = document.getElementById("textColor").value;
  if (text) {
    elements.push({
      type: "text",
      text,
      font,
      color,
      x: 50,
      y: 150,
      size: 24,
      dragging: false,
      resizing: false,
    });
    renderCanvas();
  }
});

document.getElementById("resetImagePosition").addEventListener("click", () => {
  if (baseImage) {
    imageX = 0;
    imageY = 0;
    renderCanvas();
  }
});

document.getElementById("deleteSelected").addEventListener("click", () => {
  if (selectedElement !== null) {
    elements.splice(elements.indexOf(selectedElement), 1);
    selectedElement = null;
    renderCanvas();
  }
});

// ===== 図形描画 =====
function drawBubbleShape(el, ctx2) {
  const { x, y, w, h, shape } = el;
  ctx2.beginPath();
  switch (shape) {
    case "oval":
      ctx2.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
      break;
    case "rounded":
      ctx2.roundRect ? ctx2.roundRect(x, y, w, h, 15) : roundedRectPath(ctx2, x, y, w, h, 15);
      break;
    case "spike1":
      cloudOrSpikeApprox(ctx2, x, y, w, h, 10); // まずは近似（外周吸着は角度で処理）
      break;
    case "spike2":
      cloudOrSpikeApprox(ctx2, x, y, w, h, 16);
      break;
    case "thought1":
      ctx2.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
      drawThoughtDots(ctx2, x + w, y + h);
      break;
    case "thought2":
      drawCloudBubble(ctx2, x, y, w, h);
      drawThoughtDots(ctx2, x + w, y + h);
      break;
    default:
      ctx2.roundRect ? ctx2.roundRect(x, y, w, h, 15) : roundedRectPath(ctx2, x, y, w, h, 15);
  }
  ctx2.closePath();
}

function roundedRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr);
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr);
  c.quadraticCurveTo(x, y, x + rr, y);
}

function cloudOrSpikeApprox(ctx2, x, y, w, h, spikes) {
  // 見た目用の近似形。吸着自体は angle ベースなのでOK
  const cx = x + w / 2;
  const cy = y + h / 2;
  const R = Math.min(w, h) / 2;
  const r = R * 0.7;
  const step = Math.PI / spikes;
  ctx2.moveTo(cx + R, cy);
  for (let i = 0; i < 2 * spikes; i++) {
    const rad = (i % 2 === 0) ? R : r;
    const ang = i * step;
    ctx2.lineTo(cx + rad * Math.cos(ang), cy + rad * Math.sin(ang));
  }
}

function drawCloudBubble(ctx2, x, y, w, h) {
  const r = 10, steps = 12;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const cx = x + w / 2 + (w / 2 - r) * Math.cos(angle);
    const cy = y + h / 2 + (h / 2 - r) * Math.sin(angle);
    ctx2.moveTo(cx + r, cy);
    ctx2.arc(cx, cy, r, 0, 2 * Math.PI);
  }
}
function drawThoughtDots(ctx2, x, y) {
  ctx2.moveTo(x, y);
  ctx2.arc(x + 5, y + 5, 5, 0, 2 * Math.PI);
  ctx2.moveTo(x + 15, y + 15);
  ctx2.arc(x + 15, y + 15, 3, 0, 2 * Math.PI);
}

// ===== ツノ（PowerPoint風：角度で外周吸着） =====
function getAnchorPoint(el) {
  const { x, y, w, h, shape, pointerAngle } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (shape === "oval" || shape === "thought1") {
    // 楕円の外周上：角度に対するパラメトリック
    const rx = w / 2, ry = h / 2;
    return { x: cx + rx * Math.cos(pointerAngle), y: cy + ry * Math.sin(pointerAngle) };
  }

  // 角丸やその他はまず矩形として側を選ぶ（ステップ2で角丸補正予定）
  const dx = Math.cos(pointerAngle);
  const dy = Math.sin(pointerAngle);

  // 中心からのレイと各辺の交点を取る（AABB）
  // 交点までのt(>0)を計算して最小の正のtを採用
  const eps = 1e-6;
  const tList = [];

  // 左辺 x = x
  if (Math.abs(dx) > eps) {
    const t = (x - cx) / dx;
    const yy = cy + t * dy;
    if (t > 0 && yy >= y && yy <= y + h) tList.push({ t, px: x, py: yy });
  }
  // 右辺 x = x + w
  if (Math.abs(dx) > eps) {
    const t = (x + w - cx) / dx;
    const yy = cy + t * dy;
    if (t > 0 && yy >= y && yy <= y + h) tList.push({ t, px: x + w, py: yy });
  }
  // 上辺 y = y
  if (Math.abs(dy) > eps) {
    const t = (y - cy) / dy;
    const xx = cx + t * dx;
    if (t > 0 && xx >= x && xx <= x + w) tList.push({ t, px: xx, py: y });
  }
  // 下辺 y = y + h
  if (Math.abs(dy) > eps) {
    const t = (y + h - cy) / dy;
    const xx = cx + t * dx;
    if (t > 0 && xx >= x && xx <= x + w) tList.push({ t, px: xx, py: y + h });
  }

  if (tList.length === 0) return { x: cx, y: cy }; // 念のため
  tList.sort((a, b) => a.t - b.t);
  return { x: tList[0].px, y: tList[0].py };
}

function drawPointerGeneric(ctx2, el) {
  // 三角（等腰）を anchor 上に配置し、pointerAngle 方向に突き出す
  const base = getAnchorPoint(el);
  const size = 15;
  const spread = Math.PI / 12; // 開き角
  const ang = el.pointerAngle;
  const tip = {
    x: base.x + (size + 10) * Math.cos(ang),
    y: base.y + (size + 10) * Math.sin(ang),
  };
  const left = {
    x: base.x + size * Math.cos(ang - spread),
    y: base.y + size * Math.sin(ang - spread),
  };
  const right = {
    x: base.x + size * Math.cos(ang + spread),
    y: base.y + size * Math.sin(ang + spread),
  };

  ctx2.fillStyle = el.fill;
  ctx2.beginPath();
  ctx2.moveTo(base.x, base.y);
  ctx2.lineTo(left.x, left.y);
  ctx2.lineTo(tip.x, tip.y);
  ctx2.lineTo(right.x, right.y);
  ctx2.closePath();
  ctx2.fill();
  ctx2.strokeStyle = "black";
  ctx2.lineWidth = 1;
  ctx2.stroke();

  // オレンジの操作ハンドル（先端）
  ctx2.beginPath();
  ctx2.fillStyle = "#ff7a00";
  ctx2.arc(tip.x, tip.y, 6, 0, 2 * Math.PI);
  ctx2.fill();
  ctx2.strokeStyle = "#b85600";
  ctx2.stroke();
}

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (baseImage) ctx.drawImage(baseImage, imageX, imageY, canvas.width, canvas.height);

  for (const el of elements) {
    if (el.type === "bubble") {
      ctx.fillStyle = el.fill;
      drawBubbleShape(el, ctx);
      ctx.fill();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.stroke();
      drawPointerGeneric(ctx, el);

      // 選択インジケータ（従来の青ハンドル）
      if (el === selectedElement) {
        ctx.fillStyle = "blue";
        ctx.fillRect(el.x + el.w - 5, el.y + el.h - 5, 10, 10);
      }
    }

    if (el.type === "text") {
      ctx.font = `${el.size || 24}px ${el.font}`;
      ctx.fillStyle = el.color;
      ctx.fillText(el.text, el.x, el.y);

      if (el === selectedElement) {
        const width = ctx.measureText(el.text).width;
        const height = el.size || 24;
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = "black";
        ctx.strokeRect(el.x, el.y - height + 4, width, height);
        ctx.setLineDash([]);
        ctx.fillStyle = "blue";
        ctx.fillRect(el.x + width - 5, el.y - height - 5, 10, 10);
      }
    }
  }
}

// ===== 入力系 =====
let offsetX, offsetY;

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

  // まずはハンドル優先クリック判定
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type !== "bubble") continue;
    const tip = getPointerTip(el);
    if (distance(pos, tip) <= 10) {
      el.handleDragging = true;
      selectedElement = el;
      renderCanvas();
      return;
    }
  }

  // 通常の選択・ドラッグ
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];

    if (el.type === "bubble") {
      if (pointInRect(pos, el)) {
        el.dragging = true;
        offsetX = pos.x - el.x;
        offsetY = pos.y - el.y;
        selectedElement = el;
        return;
      }
    } else if (el.type === "text") {
      const fontSize = el.size || 24;
      ctx.font = `${fontSize}px ${el.font}`;
      const textWidth = ctx.measureText(el.text).width;
      const textHeight = fontSize;

      // 右上リサイズ点
      if (
        pos.x >= el.x + textWidth - 5 &&
        pos.x <= el.x + textWidth + 5 &&
        pos.y >= el.y - textHeight - 5 &&
        pos.y <= el.y - textHeight + 5
      ) {
        el.resizing = true;
        selectedElement = el;
        resizeStartY = pos.y;
        initialFontSize = el.size || 24;
        return;
      }

      // 本体ヒット
      if (
        pos.x >= el.x &&
        pos.x <= el.x + textWidth &&
        pos.y >= el.y - textHeight &&
        pos.y <= el.y
      ) {
        el.dragging = true;
        offsetX = pos.x - el.x;
        offsetY = pos.y - el.y;
        selectedElement = el;
        return;
      }
    }
  }

  // どれも選ばれてない→背景画像ドラッグ
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
      if (el.handleDragging) {
        // 中心に対する角度を更新
        const cx = el.x + el.w / 2;
        const cy = el.y + el.h / 2;
        el.pointerAngle = Math.atan2(pos.y - cy, pos.x - cx);
      } else if (el.dragging) {
        el.x = pos.x - offsetX;
        el.y = pos.y - offsetY;
      }
    } else if (el.type === "text") {
      if (el.resizing) {
        const dy = pos.y - resizeStartY;
        el.size = Math.max(8, initialFontSize + dy * 0.2);
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
    selectedElement.handleDragging = false;
  }
  imageDragging = false;
  resizeStartY = null;
  initialFontSize = null;
}

// ユーティリティ
function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
function getPointerTip(el) {
  // drawPointerGeneric と同じ tip 算出
  const base = getAnchorPoint(el);
  const ang = el.pointerAngle;
  return {
    x: base.x + (15 + 10) * Math.cos(ang),
    y: base.y + (15 + 10) * Math.sin(ang),
  };
}

// ===== 保存処理 =====
document.getElementById("saveImage").addEventListener("click", () => {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  if (baseImage) {
    tempCtx.drawImage(baseImage, imageX, imageY, canvas.width, canvas.height);
  }

  for (const el of elements) {
    if (el.type === "bubble") {
      tempCtx.fillStyle = el.fill;
      drawBubbleShape(el, tempCtx);
      tempCtx.fill();
      tempCtx.strokeStyle = "black";
      tempCtx.lineWidth = 1;
      tempCtx.stroke();
      drawPointerGeneric(tempCtx, el);
    } else if (el.type === "text") {
      tempCtx.font = `${el.size || 24}px ${el.font}`;
      tempCtx.fillStyle = el.color;
      tempCtx.fillText(el.text, el.x, el.y);
    }
  }

  const dataURL = tempCanvas.toDataURL();
  const link = document.createElement("a");
  link.download = "stamp.png";
  link.href = dataURL;
  link.click();

  const modalImg = document.getElementById("savedImagePreview");
  modalImg.src = dataURL;

  const encodedUrl = encodeURIComponent(window.location.href);
  const encodedText = encodeURIComponent("スタンプメーカーで画像を作ってみたよ！ #スタンプメーカー");
  document.getElementById("modalShareX").href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
  document.getElementById("modalShareLINE").href = `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`;
  document.getElementById("modalShareInsta").href = `https://www.instagram.com`;

  document.getElementById("saveModal").style.display = "flex";
});

// ===== タッチ対応（既存互換） =====
function onTouchStart(e) {
  if (e.touches.length > 1) return;
  e.preventDefault();
  const now = Date.now();
  const pos = getTouchPos(e);

  if (now - lastTapTime < 300) {
    const dx = pos.x - lastTapPos.x;
    const dy = pos.y - lastTapPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 20) {
      handleDoubleTap(pos);
    }
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
      if (pointInRect(pos, el)) { selectedElement = el; break; }
    } else if (el.type === "text") {
      const fontSize = el.size || 24;
      ctx.font = `${fontSize}px ${el.font}`;
      const textWidth = ctx.measureText(el.text).width;
      const textHeight = fontSize;
      if (pos.x >= el.x && pos.x <= el.x + textWidth && pos.y >= el.y - textHeight && pos.y <= el.y) {
        selectedElement = el; break;
      }
    }
  }
  renderCanvas();
}

document.getElementById("savedImagePreview").addEventListener("click", () => {
  const dataURL = document.getElementById("savedImagePreview").src;
  const newWindow = window.open();
  if (newWindow) {
    newWindow.document.write(`<img src="${dataURL}" style="width:100%">`);
  } else {
    alert("ポップアップがブロックされました。設定をご確認ください。");
  }
});
