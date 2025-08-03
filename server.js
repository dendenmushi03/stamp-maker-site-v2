const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// remove-bg.htmlへのルートも対応
app.get('/remove-bg.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'remove-bg.html'));
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
