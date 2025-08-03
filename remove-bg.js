const upload = document.getElementById('upload');
const originalImage = document.getElementById('originalImage');
const outputImage = document.getElementById('outputImage');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let net = null;

async function loadModel() {
  net = await bodyPix.load();
  console.log("モデル読み込み完了");
}

upload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !net) return;

  const img = new Image();
  img.onload = async () => {
    originalImage.src = img.src;

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const segmentation = await net.segmentPerson(img);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length / 4; i++) {
      if (segmentation.data[i] === 0) {
        pixels[i * 4 + 3] = 0; // 背景部分を透明に
      }
    }

    ctx.putImageData(imageData, 0, 0);
    outputImage.src = canvas.toDataURL('image/png');
  };

  img.src = URL.createObjectURL(file);
});

loadModel();
