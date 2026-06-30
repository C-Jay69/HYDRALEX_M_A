
export default async function handler(request) {
  try {
    // Use dynamic import with the explicit .js extension
    const { default: app } = await import("../src/index.js");
    return app.fetch(request);
  } catch (e) {
    console.error("BRIDGE ERROR:", e);
    return new Response(JSON.stringify({ error: "Bridge failed", details: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
