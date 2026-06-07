import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

function App() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/shorten`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to shorten URL");
      }

      setResult(data);
      setUrl("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <p className="badge">Home Kubernetes DevOps Platform</p>
        <h1>URL Shortener</h1>
        <p className="description">
          K3s 기반 Homelab Kubernetes 환경에서 운영할 테스트 서비스입니다.
        </p>

        <form onSubmit={handleSubmit} className="form">
          <input
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
          <button type="submit">Shorten</button>
        </form>

        {error && <p className="error">{error}</p>}

        {result && (
          <div className="result">
            <p>Original URL</p>
            <code>{result.originalUrl}</code>

            <p>Short URL</p>
            <a href={result.shortUrl} target="_blank" rel="noreferrer">
              {result.shortUrl}
            </a>
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
