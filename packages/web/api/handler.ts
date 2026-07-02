
import app from "../src/index.js";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    
    // DEBUG ENDPOINT: Only active for this troubleshooting phase
    if (url.pathname === "/api/debug-env") {
      const debugInfo = {
        database_url_start: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 15) + "..." : "MISSING",
        auth_token_start: process.env.DATABASE_AUTH_TOKEN ? process.env.DATABASE_AUTH_TOKEN.substring(0, 15) + "..." : "MISSING",
        better_auth_url: process.env.BETTER_AUTH_URL || "MISSING",
        env: process.env.NODE_ENV
      };
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(debugInfo, null, 2));
    }

    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
      });
    }

    const webRequest = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: body,
    });

    const response = await app.fetch(webRequest);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const text = await response.text();
    res.end(text);
  } catch (e) {
    console.error("HANDLER ERROR:", e);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Internal Server Error", details: e.message }));
  }
}
