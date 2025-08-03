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

function drawPointer(el) {
  const { x, y, w, h, pointerPosition, pointerOffset, fill } = el;
  const size = 15;
  ctx.fillStyle = fill;
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
  if (baseImage) ctx.drawImage(baseImage, imageX, imageY, canvas.width, canvas.height);

  for (const el of elements) {
    if (el.type === "bubble") {
      ctx.fillStyle = el.fill;
      drawBubbleShape(el, ctx);
      ctx.fill();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.stroke();
      drawPointer(el);
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

function getPointerPos(el) {
  const { x, y, w, h, pointerPosition, pointerOffset } = el;
  switch (pointerPosition) {
    case "top": return { x: x + w * pointerOffset, y: y };
    case "bottom": return { x: x + w * pointerOffset, y: y + h };
    case "left": return { x: x, y: y + h * pointerOffset };
    case "right": return { x: x + w, y: y + h * pointerOffset };
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
      tempCtx.fillStyle = el.fill;
      drawBubbleShape(el, tempCtx);
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
