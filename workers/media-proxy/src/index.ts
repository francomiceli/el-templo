interface Env {
  BUCKET: R2Bucket;
}

const CACHE_TTL = 60 * 60 * 24 * 7; // 1 week

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // "exercises/42.mp4"

    if (!key) {
      return new Response("Not found", { status: 404 });
    }

    // Check edge cache first
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    // Fetch from R2
    const object = await env.BUCKET.get(key);
    if (!object) {
      return new Response("Not found", { status: 404 });
    }

    const contentType =
      object.httpMetadata?.contentType ??
      (key.endsWith(".mp4") ? "video/mp4" : "application/octet-stream");

    const response = new Response(object.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${CACHE_TTL}`,
        "Access-Control-Allow-Origin": "*",
      },
    });

    // Store in edge cache (non-blocking)
    request.method === "GET" &&
      cache.put(request, response.clone()).catch(() => {});

    return response;
  },
};
