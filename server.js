const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ルートアクセス時に index.html を返す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 例：APIの代替として、ローカルで処理したいルート
app.post('/api/local-process', (req, res) => {
  const input = req.body.text;
  // 仮の処理：受け取った文字列を大文字にして返す
  res.json({ result: input.toUpperCase() });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
