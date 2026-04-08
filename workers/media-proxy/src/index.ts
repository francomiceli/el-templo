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

    const rangeHeader = request.headers.get("Range");

    // Fetch from R2 (with optional range)
    const object = await env.BUCKET.get(key, {
      range: rangeHeader
        ? { suffix: undefined, ...parseRange(rangeHeader) }
        : undefined,
    });
    if (!object) {
      return new Response("Not found", { status: 404 });
    }

    const contentType =
      object.httpMetadata?.contentType ??
      (key.endsWith(".mp4") ? "video/mp4" : "application/octet-stream");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${CACHE_TTL}`,
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes",
      "Content-Length": String(object.size),
    };

    // Range response
    if (rangeHeader && "range" in object) {
      const r = object.range as { offset: number; length: number };
      headers["Content-Range"] =
        `bytes ${r.offset}-${r.offset + r.length - 1}/${object.size}`;
      headers["Content-Length"] = String(r.length);

      const response = new Response(object.body, { status: 206, headers });
      return response;
    }

    const response = new Response(object.body, { status: 200, headers });

    // Store full responses in edge cache (non-blocking)
    request.method === "GET" &&
      cache.put(request, response.clone()).catch(() => {});

    return response;
  },
};

/** Parse a Range header like "bytes=0-1023" into R2 range options */
function parseRange(
  header: string,
): { offset: number; length?: number } | undefined {
  const match = header.match(/bytes=(\d+)-(\d*)/);
  if (!match) return undefined;

  const offset = parseInt(match[1], 10);
  if (match[2]) {
    const end = parseInt(match[2], 10);
    return { offset, length: end - offset + 1 };
  }
  return { offset };
}
