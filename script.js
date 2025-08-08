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
    shape: selectedShape,
    x: 50,
    y: 50,
    w: 150,
    h: 100,
    pointerPosition: "bottom",
    pointerOffset: 0.5,
    fill: "#ffffff",
    dragging: false,
    resizing: false,
    draggingPointer: false,
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

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImage) {
    const drawWidth = backgroundImage.width * imageScale;
    const drawHeight = backgroundImage.height * imageScale;
    ctx.drawImage(backgroundImage, imageX, imageY, drawWidth, drawHeight);
  }
  for (const el of elements) {
    if (el.type === 'bubble') drawBubble(el);
    if (el.type === 'text') drawText(el);
  }
}

function drawBubble(el) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.beginPath();
  if (el.shape === '角丸') {
    const r = 10;
    ctx.moveTo(el.width - r, 0);
    ctx.arcTo(el.width, 0, el.width, r, r);
    ctx.arcTo(el.width, el.height, el.width - r, el.height, r);
    ctx.arcTo(0, el.height, 0, el.height - r, r);
    ctx.arcTo(0, 0, r, 0, r);
  } else if (el.shape === '楕円') {
    ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
  } else if (el.shape === '雲') {
    for (let i = 0; i < 5; i++) {
      ctx.arc(el.width / 5 * i + 15, el.height / 2, 15, 0, Math.PI * 2);
    }
  } else {
    ctx.rect(0, 0, el.width, el.height);
  }
  ctx.closePath();
  ctx.fillStyle = el.color;
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.stroke();

  // ポインタ（ツノ）
  const angle = el.pointerAngle;
  const px = el.width / 2 + Math.cos(angle) * el.width / 2;
  const py = el.height / 2 + Math.sin(angle) * el.height / 2;
  const size = 10;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - size * Math.cos(angle - 0.5), py - size * Math.sin(angle - 0.5));
  ctx.lineTo(px - size * Math.cos(angle + 0.5), py - size * Math.sin(angle + 0.5));
  ctx.closePath();
  ctx.fillStyle = "white";
  ctx.fill();
  ctx.stroke();

  // オレンジハンドル
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fillStyle = "orange";
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawBubbleShape(el, ctx) {
  const { x, y, w, h, shape } = el;
  ctx.beginPath();
  switch (shape) {
    case "oval":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
      break;
    case "rounded":
      ctx.roundRect(x, y, w, h, 15);
      break;
    case "spike1":
      drawSpikeBubble(ctx, x, y, w, h, 10);
      break;
    case "spike2":
      drawSpikeBubble(ctx, x, y, w, h, 16);
      break;
    case "thought1":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
      drawThoughtDots(ctx, x + w, y + h);
      break;
    case "thought2":
      drawCloudBubble(ctx, x, y, w, h);
      drawThoughtDots(ctx, x + w, y + h);
      break;
    default:
      ctx.roundRect(x, y, w, h, 15);
  }
  ctx.closePath();
}

function drawSpikeBubble(ctx, x, y, w, h, spikes) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const outerRadius = Math.min(w, h) / 2;
  const innerRadius = outerRadius * 0.7;
  const step = Math.PI / spikes;
  ctx.moveTo(cx + outerRadius, cy);
  for (let i = 0; i < 2 * spikes; i++) {
    const r = (i % 2 === 0) ? outerRadius : innerRadius;
    const angle = i * step;
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

function drawCloudBubble(ctx, x, y, w, h) {
  const r = 10;
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const cx = x + w / 2 + (w / 2 - r) * Math.cos(angle);
    const cy = y + h / 2 + (h / 2 - r) * Math.sin(angle);
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  }
}

function drawThoughtDots(ctx, x, y) {
  ctx.moveTo(x, y);
  ctx.arc(x + 5, y + 5, 5, 0, 2 * Math.PI);
  ctx.moveTo(x + 15, y + 15);
  ctx.arc(x + 15, y + 15, 3, 0, 2 * Math.PI);
}

// 角丸とツノを一体化した Path2D を作る（rounded 専用）
function buildRoundedWithPointerPath(el) {
  const { x, y, w, h, pointerPosition, pointerOffset } = el;

  // 角丸半径・ツノサイズ（パワポ寄せの比率）
  const r  = Math.min(18, Math.max(6, Math.min(w, h) * 0.12));
  const bw = Math.min(w, h) * 0.16;     // ツノの基部幅
  const bl = bw * 0.90;                 // ツノの長さ

  // ストロークのにじみ防止（0.5px に寄せる）
  const L = Math.round(x) + 0.5;
  const T = Math.round(y) + 0.5;

  const path = new Path2D();
  // 角丸の本体
  if (path.roundRect) {
    path.roundRect(L, T, w, h, r);
  } else {
    // roundRectが無い環境向けの予備（簡略）
    path.moveTo(L + r, T);
    path.lineTo(L + w - r, T);
    path.arc(L + w - r, T + r, r, -Math.PI/2, 0);
    path.lineTo(L + w, T + h - r);
    path.arc(L + w - r, T + h - r, r, 0, Math.PI/2);
    path.lineTo(L + r, T + h);
    path.arc(L + r, T + h - r, r, Math.PI/2, Math.PI);
    path.lineTo(L, T + r);
    path.arc(L + r, T + r, r, Math.PI, Math.PI*1.5);
  }

  // ツノの基準位置（角の丸み分はみ出さないようにクランプ）
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const half  = bw / 2;
  let bx, by, t1x, t1y, t2x, t2y, tipx, tipy;

  switch (pointerPosition) {
    case "top": {
      const base = clamp(x + w * pointerOffset, x + r + half, x + w - r - half);
      bx = Math.round(base) + 0.5; by = T;
      t1x = bx - half; t1y = by;
      t2x = bx + half; t2y = by;
      tipx = bx;       tipy = by - bl;
      break;
    }
    case "bottom": {
      const base = clamp(x + w * pointerOffset, x + r + half, x + w - r - half);
      bx = Math.round(base) + 0.5; by = T + h;
      t1x = bx - half; t1y = by;
      t2x = bx + half; t2y = by;
      tipx = bx;       tipy = by + bl;
      break;
    }
    case "left": {
      const base = clamp(y + h * pointerOffset, y + r + half, y + h - r - half);
      bx = L;          by = Math.round(base) + 0.5;
      t1x = bx;        t1y = by - half;
      t2x = bx;        t2y = by + half;
      tipx = bx - bl;  tipy = by;
      break;
    }
    case "right": {
      const base = clamp(y + h * pointerOffset, y + r + half, y + h - r - half);
      bx = L + w;      by = Math.round(base) + 0.5;
      t1x = bx;        t1y = by - half;
      t2x = bx;        t2y = by + half;
      tipx = bx + bl;  tipy = by;
      break;
    }
  }

  // ツノ（三角形）を同じパスに追加
  path.moveTo(t1x, t1y);
  path.lineTo(tipx, tipy);
  path.lineTo(t2x, t2y);
  path.closePath();

  return { path, strokeW: 1.5, radius: r };
}

// 汎用：rounded のときだけ一体パス、それ以外は null を返す
function buildBubblePath(el) {
  if (el.shape === "rounded") return buildRoundedWithPointerPath(el);
  return null;
}

function drawPointer(el) {
  const { x, y, w, h, pointerPosition, pointerOffset, fill, shape } = el;
  const size = 15;
  ctx.fillStyle = fill;
  ctx.beginPath();

  if (shape === "oval" || shape === "thought2") {
    // 楕円など：外周に吸着
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    let angle = 0;
    switch (pointerPosition) {
      case "top": angle = -Math.PI / 2; break;
      case "bottom": angle = Math.PI / 2; break;
      case "left": angle = Math.PI; break;
      case "right": angle = 0; break;
    }

    const baseX = cx + rx * Math.cos(angle);
    const baseY = cy + ry * Math.sin(angle);
    const angle1 = angle - Math.PI / 12;
    const angle2 = angle + Math.PI / 12;
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(cx + (rx + size) * Math.cos(angle1), cy + (ry + size) * Math.sin(angle1));
    ctx.lineTo(cx + (rx + size) * Math.cos(angle2), cy + (ry + size) * Math.sin(angle2));
  } else {
    // 通常四角・角丸など
    switch (pointerPosition) {
      case "top":
        const px1 = x + w * pointerOffset;
        ctx.moveTo(px1 - size / 2, y);
        ctx.lineTo(px1, y - size);
        ctx.lineTo(px1 + size / 2, y);
        break;
      case "bottom":
        const px2 = x + w * pointerOffset;
        ctx.moveTo(px2 - size / 2, y + h);
        ctx.lineTo(px2, y + h + size);
        ctx.lineTo(px2 + size / 2, y + h);
        break;
      case "left":
        const py1 = y + h * pointerOffset;
        ctx.moveTo(x, py1 - size / 2);
        ctx.lineTo(x - size, py1);
        ctx.lineTo(x, py1 + size / 2);
        break;
      case "right":
        const py2 = y + h * pointerOffset;
        ctx.moveTo(x + w, py2 - size / 2);
        ctx.lineTo(x + w + size, py2);
        ctx.lineTo(x + w, py2 + size / 2);
        break;
    }
  }

  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function getPointerPos(el) {
  const { x, y, w, h, pointerPosition, pointerOffset, shape } = el;
  if (shape === "oval") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    let angle = getPointerAngle(el);
    return {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle)
    };
  } else {
    switch (pointerPosition) {
      case "top": return { x: x + w * pointerOffset, y: y };
      case "bottom": return { x: x + w * pointerOffset, y: y + h };
      case "left": return { x: x, y: y + h * pointerOffset };
      case "right": return { x: x + w, y: y + h * pointerOffset };
    }
  }
}

function getPointerAngle(el) {
  switch (el.pointerPosition) {
    case "top": return -Math.PI / 2;
    case "bottom": return Math.PI / 2;
    case "left": return Math.PI;
    case "right": return 0;
    default: return 0;
  }
}


function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (baseImage) ctx.drawImage(baseImage, imageX, imageY, canvas.width, canvas.height);

  for (const el of elements) {
    if (el.type === "bubble") {
  const built = buildBubblePath(el);
  if (built) {
    // 一体パス（rounded 専用）
    const { path, strokeW } = built;

    // 塗りにだけ影を適用（パワポ風）
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = el.fill;
    ctx.fill(path, "nonzero");
    ctx.restore();

    ctx.strokeStyle = "black";
    ctx.lineWidth = strokeW;
    ctx.stroke(path);
  } else {
    // 既存形状は従来描画
    ctx.fillStyle = el.fill;
    drawBubbleShape(el, ctx);
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();
    drawPointer(el);
  }
}

        if (el === selectedElement && el.type === "bubble") {
      ctx.fillStyle = "blue";
      ctx.fillRect(el.x + el.w - 5, el.y + el.h - 5, 10, 10);
      const p = getPointerPos(el);
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
    }


    if (el.type === "text") {
      ctx.font = `${el.size || 24}px ${el.font}`;
      ctx.fillStyle = el.color;
      ctx.fillText(el.text, el.x, el.y);

          if (el === selectedElement && el.type === "text") {
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
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function onMouseDown(e) {
  const pos = getMousePos(e);
  selectedElement = null;

  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === "bubble") {
      const pointerPos = getPointerPos(el);
      if (Math.abs(pos.x - pointerPos.x) < 10 && Math.abs(pos.y - pointerPos.y) < 10) {
        el.draggingPointer = true;
        selectedElement = el;
        return;
      }
      if (
        Math.abs(pos.x - (el.x + el.w)) < 10 &&
        Math.abs(pos.y - (el.y + el.h)) < 10
      ) {
        el.resizing = true;
        selectedElement = el;
        return;
      }
      if (
        pos.x >= el.x &&
        pos.x <= el.x + el.w &&
        pos.y >= el.y &&
        pos.y <= el.y + el.h
      ) {
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

  if (baseImage) {
    imageDragging = true;
    imageOffsetX = pos.x - imageX;
    imageOffsetY = pos.y - imageY;
  }
}

function onMouseMove(e) {
  const pos = getMousePos(e);

  if (selectedElement) {
    if (selectedElement.type === "bubble") {
      if (selectedElement.resizing) {
        selectedElement.w = pos.x - selectedElement.x;
        selectedElement.h = pos.y - selectedElement.y;
      } else if (selectedElement.draggingPointer) {
        const el = selectedElement;
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
      } else if (selectedElement.dragging) {
        selectedElement.x = pos.x - offsetX;
        selectedElement.y = pos.y - offsetY;
      }
    } else if (selectedElement.type === "text") {
      if (selectedElement.resizing) {
        const dy = pos.y - resizeStartY;
        selectedElement.size = Math.max(8, initialFontSize + dy * 0.2);
      } else if (selectedElement.dragging) {
        selectedElement.x = pos.x - offsetX;
        selectedElement.y = pos.y - offsetY;
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
  }
  imageDragging = false;
  resizeStartY = null;
  initialFontSize = null;
}

function getElementAt(x, y) {
  return elements.find(el => {
    return (
      x > el.x &&
      y > el.y &&
      x < el.x + el.width &&
      y < el.y + el.height
    );
  });
}

function getPointerPos(el) {
  const { x, y, w, h, pointerPosition, pointerOffset, shape } = el;
  if (shape === "oval") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    let angle = 0;
    switch (pointerPosition) {
      case "top": angle = -Math.PI / 2; break;
      case "bottom": angle = Math.PI / 2; break;
      case "left": angle = Math.PI; break;
      case "right": angle = 0; break;
    }
    return {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle)
    };
  } else {
    switch (pointerPosition) {
      case "top": return { x: x + w * pointerOffset, y: y };
      case "bottom": return { x: x + w * pointerOffset, y: y + h };
      case "left": return { x: x, y: y + h * pointerOffset };
      case "right": return { x: x + w, y: y + h * pointerOffset };
    }
  }
}

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
  const built = buildBubblePath(el);
  if (built) {
    const { path, strokeW } = built;
    // 影も書き出したい場合は fill 前に shadow を設定
    tempCtx.save();
    tempCtx.shadowColor = "rgba(0,0,0,0.18)";
    tempCtx.shadowBlur = 6;
    tempCtx.shadowOffsetY = 1;
    tempCtx.fillStyle = el.fill;
    tempCtx.fill(path, "nonzero");
    tempCtx.restore();

    tempCtx.strokeStyle = "black";
    tempCtx.lineWidth = strokeW;
    tempCtx.stroke(path);
  } else {
    tempCtx.fillStyle = el.fill;
    drawBubbleShape(el, tempCtx);
    tempCtx.fill();
    tempCtx.strokeStyle = "black";
    tempCtx.lineWidth = 1;
    tempCtx.stroke();
    drawPointerToContext(tempCtx, el);
  }

  // ←（テキストをここで描くならこの後に）
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

function drawText(el) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.font = `${el.size}px ${el.font}`;
  ctx.fillStyle = el.color;
  ctx.fillText(el.text, 0, el.size);
  ctx.restore();
}

function drawPointerToContext(ctx, el) {
  const { x, y, w, h, pointerPosition, pointerOffset } = el;
  const size = 15;
  ctx.fillStyle = el.fill;
  ctx.beginPath();
  switch (pointerPosition) {
    case "top":
      const px1 = x + w * pointerOffset;
      ctx.moveTo(px1 - size / 2, y);
      ctx.lineTo(px1, y - size);
      ctx.lineTo(px1 + size / 2, y);
      break;
    case "bottom":
      const px2 = x + w * pointerOffset;
      ctx.moveTo(px2 - size / 2, y + h);
      ctx.lineTo(px2, y + h + size);
      ctx.lineTo(px2 + size / 2, y + h);
      break;
    case "left":
      const py1 = y + h * pointerOffset;
      ctx.moveTo(x, py1 - size / 2);
      ctx.lineTo(x - size, py1);
      ctx.lineTo(x, py1 + size / 2);
      break;
    case "right":
      const py2 = y + h * pointerOffset;
      ctx.moveTo(x + w, py2 - size / 2);
      ctx.lineTo(x + w + size, py2);
      ctx.lineTo(x + w, py2 + size / 2);
      break;
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

document.getElementById("closeModal").addEventListener("click", () => {
  document.getElementById("saveModal").style.display = "none";
});

function onTouchStart(e) {
  if (e.touches.length > 1) return;

  e.preventDefault();
  const now = new Date().getTime();
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
  return {
    x: e.touches[0].clientX - rect.left,
    y: e.touches[0].clientY - rect.top,
  };
}

function convertTouchToMouseEvent(touchEvent) {
  const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
  return {
    clientX: touch.clientX,
    clientY: touch.clientY,
  };
}

function handleDoubleTap(pos) {
  selectedElement = null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === "bubble") {
      if (
        pos.x >= el.x && pos.x <= el.x + el.w &&
        pos.y >= el.y && pos.y <= el.y + el.h
      ) {
        selectedElement = el;
        break;
      }
    } else if (el.type === "text") {
      const fontSize = el.size || 24;
      ctx.font = `${fontSize}px ${el.font}`;
      const textWidth = ctx.measureText(el.text).width;
      const textHeight = fontSize;
      if (
        pos.x >= el.x &&
        pos.x <= el.x + textWidth &&
        pos.y >= el.y - textHeight &&
        pos.y <= el.y
      ) {
        selectedElement = el;
        break;
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
