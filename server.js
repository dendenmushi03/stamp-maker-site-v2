// --- server.js ---
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const path = require("path");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// --- 背景除去APIルート ---
app.post("/api/remove-background", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version:
          "d2e6715d62db8ef8c13864d7c3cfcaa2196e0a6ff1b65cbe8d2f97c1cd3f1fa6",
        input: {
          image: imageUrl,
        },
      }),
    });

    const prediction = await response.json();

    // polling処理（完了まで待つ）
    const poll = async () => {
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: {
            Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
          },
        }
      );
      const result = await pollRes.json();
      if (result.status === "succeeded") {
        return res.json({ imageUrl: result.output });
      } else if (result.status === "failed") {
        return res.status(500).json({ error: "Background removal failed" });
      } else {
        setTimeout(() => poll(), 2000); // 修正：async-await再帰ではなくコールバック式
      }
    };
    poll();
  } catch (error) {
    console.error("Error removing background:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- サーバー起動 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
