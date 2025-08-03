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
  elements.push({
    type: "bubble",
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

document.getElementById("deleteSelected").addEventListener("click", () => {
  if (selectedElement !== null) {
    elements.splice(elements.indexOf(selectedElement), 1);
    selectedElement = null;
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

  // どれも選ばれていなければ画像をドラッグ可能にする
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
  selectedElement.size = Math.max(8, initialFontSize + dy * 0.2); // ← 感度を調整
}

 else if (selectedElement.dragging) {
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

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function getPointerPos(el) {
  const { x, y, w, h, pointerPosition, pointerOffset } = el;
  switch (pointerPosition) {
    case "top": return { x: x + w * pointerOffset, y: y };
    case "bottom": return { x: x + w * pointerOffset, y: y + h };
    case "left": return { x: x, y: y + h * pointerOffset };
    case "right": return { x: x + w, y: y + h * pointerOffset };
  }
}

function drawPointer(el) {
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

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (baseImage) {
    ctx.drawImage(baseImage, imageX, imageY, canvas.width, canvas.height);
  }

  for (const el of elements) {
    if (el.type === "bubble") {
      ctx.fillStyle = el.fill;
      ctx.beginPath();
      ctx.roundRect(el.x, el.y, el.w, el.h, 15);
      ctx.fill();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.stroke();

      drawPointer(el);

      if (el === selectedElement) {
        ctx.fillStyle = "blue";
        ctx.fillRect(el.x + el.w - 5, el.y + el.h - 5, 10, 10);
        const p = getPointerPos(el);
        ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
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

CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
  if (typeof radius === "undefined") radius = 5;
  if (typeof radius === "number") radius = { tl: radius, tr: radius, br: radius, bl: radius };
  this.beginPath();
  this.moveTo(x + radius.tl, y);
  this.lineTo(x + width - radius.tr, y);
  this.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  this.lineTo(x + width, y + height - radius.br);
  this.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  this.lineTo(x + radius.bl, y + height);
  this.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  this.lineTo(x, y + radius.tl);
  this.quadraticCurveTo(x, y, x + radius.tl, y);
  this.closePath();
  return this;
};

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

// ...すでにあるすべての既存コード（中略）...

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
      tempCtx.beginPath();
      tempCtx.roundRect(el.x, el.y, el.w, el.h, 15);
      tempCtx.fill();
      tempCtx.strokeStyle = "black";
      tempCtx.lineWidth = 1;
      tempCtx.stroke();
      drawPointerToContext(tempCtx, el);
    } else if (el.type === "text") {
      tempCtx.font = `${el.size || 24}px ${el.font}`;
      tempCtx.fillStyle = el.color;
      tempCtx.fillText(el.text, el.x, el.y);
    }
  }

  const dataURL = tempCanvas.toDataURL();

  // ✅ 画像を保存（ダウンロード）
  const link = document.createElement("a");
  link.download = "stamp.png";
  link.href = dataURL;
  link.click();

  // ✅ モーダルに画像を表示
  const modalImg = document.getElementById("savedImagePreview");
  modalImg.src = dataURL;

  // ✅ SNSシェアリンク設定
  const encodedUrl = encodeURIComponent(window.location.href);
  const encodedText = encodeURIComponent("スタンプメーカーで画像を作ってみたよ！ #スタンプメーカー");
  const encodedImg = encodeURIComponent(dataURL);

  document.getElementById("modalShareX").href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
  document.getElementById("modalShareLINE").href = `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`;
  document.getElementById("modalShareInsta").href = `https://www.instagram.com`;

  // ✅ モーダルを表示
  document.getElementById("saveModal").style.display = "flex";
});

document.getElementById("closeModal").addEventListener("click", () => {
  document.getElementById("saveModal").style.display = "none";
});

function onTouchStart(e) {
  if (e.touches.length > 1) return;

  e.preventDefault();  // ← 追加（スクロール阻止）

  const now = new Date().getTime();
  const pos = getTouchPos(e);

  // ダブルタップ処理
  if (now - lastTapTime < 300) {
    const dx = pos.x - lastTapPos.x;
    const dy = pos.y - lastTapPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 20) {
      handleDoubleTap(pos);
    }
  }

  // 選択操作も追加（onMouseDown 相当）
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

function handleDoubleTap(pos) {
  selectedElement = null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === "bubble") {
      if (
        pos.x >= el.x &&
        pos.x <= el.x + el.w &&
        pos.y >= el.y &&
        pos.y <= el.y + el.h
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

function convertTouchToMouseEvent(touchEvent) {
  const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
  return {
    clientX: touch.clientX,
    clientY: touch.clientY,
  };
}

// モーダル画像をタップしたら別タブで開く（iPhone長押し対応）
document.getElementById("savedImagePreview").addEventListener("click", () => {
  const dataURL = document.getElementById("savedImagePreview").src;
  const newWindow = window.open();
  if (newWindow) {
    newWindow.document.write(`<img src="${dataURL}" style="width:100%">`);
  } else {
    alert("ポップアップがブロックされました。設定をご確認ください。");
  }
});

// script.js（index.html 起動時に読み取る）
const fromBgRemoval = localStorage.getItem("bgRemovedImage");
if (fromBgRemoval) {
  const img = new Image();
  img.onload = () => {
    baseImage = img;
    drawCanvas(); // キャンバスに描画
  };
  img.src = fromBgRemoval;
  localStorage.removeItem("bgRemovedImage");
}
