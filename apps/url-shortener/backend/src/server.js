import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

app.use(cors());
app.use(express.json());

const urlStore = new Map();

function generateCode(length = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";

  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

app.get("/healthz", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "url-shortener-backend"
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "URL Shortener API is running"
  });
});

app.post("/api/shorten", (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      error: "url is required"
    });
  }

  let code = generateCode();

  while (urlStore.has(code)) {
    code = generateCode();
  }

  urlStore.set(code, {
    originalUrl: url,
    createdAt: new Date().toISOString(),
    clicks: 0
  });

  res.status(201).json({
    code,
    originalUrl: url,
    shortUrl: `${baseUrl}/${code}`
  });
});

app.get("/api/urls", (req, res) => {
  const urls = Array.from(urlStore.entries()).map(([code, data]) => ({
    code,
    ...data
  }));

  res.status(200).json(urls);
});

app.get("/:code", (req, res) => {
  const { code } = req.params;
  const data = urlStore.get(code);

  if (!data) {
    return res.status(404).json({
      error: "short url not found"
    });
  }

  data.clicks += 1;
  urlStore.set(code, data);

  res.redirect(data.originalUrl);
});

app.listen(port, () => {
  console.log(`URL Shortener backend is running on port ${port}`);
});
