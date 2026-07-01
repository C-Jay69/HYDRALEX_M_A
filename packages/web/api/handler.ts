import app from "../src/index.js";

export default async function handler(req, res) {
  try {
    // 1. Convert Vercel's Node.js request to a Web Standard Request object
    const url = new URL(req.url, `https://${req.headers.host}`);
    
    // We need to handle the body for POST/PUT requests
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

    // 2. Pass the Web Request to the Hono app
    const response = await app.fetch(webRequest);

    // 3. Convert the Web Response back to a Node.js response
    res.statusCode = response.status;
    
    // Copy headers
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
