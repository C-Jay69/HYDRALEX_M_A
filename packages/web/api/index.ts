export default async function handler(request) {
  return new Response(JSON.stringify({ 
    message: "THE BRIDGE IS WORKING!", 
    timestamp: new Date().toISOString(),
    status: "SUCCESS" 
  }), {
    headers: { "Content-Type": "application/json" },
  });
}
