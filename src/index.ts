import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
    CORS_HEADERS,
    BLACKLIST_HEADERS,
    MEDIA_CACHE_CONTROL,
} from "./constants";
import { generateHeadersOriginal } from "./headers";
import { buildProxyQuery, extractManifestDebug, processM3u8Line, resolveUrl } from "./processor";
import { handleDashboard, handleStatsFragment, handleStatusBadge } from "./dashboard";

const app = new Hono();

// Global performance tracker
let requestCount = 0;
let totalResponseTime = 0;
const start_time = Date.now();
const logs: string[] = [];

// Global performance logger & metrics collector
app.use("*", async (c, next) => {
    const start = performance.now();
    await next();
    const end = performance.now();
    requestCount++;
    totalResponseTime += (end - start);

    // Track last few proxy requests for the dashboard
    const url = c.req.query("url");
    if (url) {
        const timestamp = new Date().toLocaleTimeString();
        logs.unshift(`[${timestamp}] Proxied: ${url.substring(0, 50)}...`);
        if (logs.length > 5) logs.pop();
    }
});

// ─── Help & Info Endpoints (HTMX Enhanced) ────────────────────────────────────

// Dashboard and help handled within the main route to avoid shadowing proxy requests
app.get("/help", handleDashboard);

app.get("/api/logs", (c) => {
    const logHtml = logs.length > 0
        ? logs.map(l => `<div style="padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: #a5a5cc;">${l}</div>`).join("")
        : `<div style="color: #666; font-style: italic;">No recent activity...</div>`;
    return c.html(logHtml);
});

app.get("/api/stats", (c) => {
    const uptimeSeconds = Math.floor((Date.now() - start_time) / 1000);
    const avgLatency = requestCount > 0 ? (totalResponseTime / requestCount).toFixed(2) : "0";

    return c.html(handleStatsFragment({
        uptime: `${uptimeSeconds}s`,
        requests: requestCount,
        latency: `${avgLatency}ms`
    }));
});

app.get("/api/status", (c) => {
    const isJson = c.req.header("Accept")?.includes("application/json");
    if (isJson) {
        return c.json({
            status: "Online",
            uptime: `${Math.floor((Date.now() - start_time) / 1000)}s`,
            latency: requestCount > 0 ? (totalResponseTime / requestCount).toFixed(2) + "ms" : "N/A",
            message: "FAST ASF"
        }, 200, CORS_HEADERS);
    }
    return c.html(handleStatusBadge("FAST ASF"));
});

app.get("/api/info", (c) => {
    const uptimeSeconds = Math.floor((Date.now() - start_time) / 1000);
    const avgLatency = requestCount > 0 ? (totalResponseTime / requestCount).toFixed(2) : "0";

    return c.json({
        name: "Anime Proxy",
        version: "1.2.0",
        description: "Industrial-grade unified proxy for Railway/Bun.",
        uptime: `${uptimeSeconds}s`,
        requests: requestCount,
        avg_latency: `${avgLatency}ms`,
        runtime: "Bun",
        status: "Online",
        performance: "Extreme",
        endpoints: {
            proxy: {
                path: "/*",
                method: "ALL",
                description: "Main proxy route. Expects 'url' parameter.",
                status: "Operational"
            },
            help: {
                path: "/help",
                method: "GET",
                description: "Interactive dashboard and statistics dashboard.",
                status: "Operational"
            },
            watch_order: {
                path: "/api/watch-order",
                method: "GET",
                description: "Scrape watch order from chiaki.site using AniList ID.",
                status: "Operational"
            },
            debug_manifest: {
                path: "/api/debug-manifest",
                method: "GET",
                description: "Analyse M3U8 manifest structure and debug segments.",
                status: "Operational"
            },
            stats: {
                path: "/api/stats",
                method: "GET",
                description: "Real-time performance metrics (HTMX fragment).",
                status: "Operational"
            },
            logs: {
                path: "/api/logs",
                method: "GET",
                description: "Recent proxy request logs (HTMX fragment).",
                status: "Operational"
            },
            status: {
                path: "/api/status",
                method: "GET",
                description: "Live status badge generation.",
                status: "Operational"
            }
        }
    }, 200, CORS_HEADERS);
});

// ─── Options Preflight ────────────────────────────────────────────────────────

app.options("*", (c) => c.body(null, 204, CORS_HEADERS));

// ─── Watch Order Logic ────────────────────────────────────────────────────────

async function getMalIdFromAnilistId(anilistId: number): Promise<number | null> {
    const query = `query ($id: Int) { Media (id: $id, type: ANIME) { idMal } }`;
    try {
        const response = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query, variables: { id: anilistId } }),
        });
        const data = await response.json();
        return data?.data?.Media?.idMal || null;
    } catch (err) {
        console.error("AniList API error:", err);
        return null;
    }
}

async function scrapeWatchOrder(malId: number) {
    const url = `https://chiaki.site/?/tools/watch_order/id/${malId}`;
    try {
        const response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        });
        if (!response.ok) return null;
        const html = await response.text();
        const entries: any[] = [];
        const trRegex = /<tr[^>]+data-id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g;
        let match;

        while ((match = trRegex.exec(html)) !== null) {
            const trTag = match[0];
            const content = match[2];
            const idAttr = trTag.match(/data-id="(\d+)"/);
            const typeAttr = trTag.match(/data-type="(\d+)"/);
            const epsAttr = trTag.match(/data-eps="(\d+)"/);
            const anilistIdAttr = trTag.match(/data-anilist-id="(\d*)"/);

            if (!idAttr || !typeAttr) continue;
            const type = parseInt(typeAttr[1]);
            if (type !== 1 && type !== 3) continue;

            const titleMatch = content.match(/<span class="wo_title">([\s\S]*?)<\/span>/);
            const secondaryTitleMatch = content.match(/<span class="uk-text-small">([\s\S]*?)<\/span>/);
            const imageMatch = content.match(/style="background-image:url\('([^']+)'\)"/);
            const metaMatch = content.match(/<span class="wo_meta">([\s\S]*?)<\/span>/);
            const ratingMatch = content.match(/<span class="wo_rating">([\s\S]*?)<\/span>/);

            const metaRaw = metaMatch ? metaMatch[1].replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim() : "";
            const parts = metaRaw.split('|').map(p => p.trim()).filter(p => p && !p.includes('★'));

            let episodesCount = null, duration = null;
            const epInfo = parts[2] || "";
            if (epInfo.includes('×')) { [episodesCount, duration] = epInfo.split('×').map(s => s.trim()); }
            else if (epInfo) { duration = epInfo; }

            entries.push({
                malId: parseInt(idAttr[1]),
                anilistId: anilistIdAttr && anilistIdAttr[1] ? parseInt(anilistIdAttr[1]) : null,
                title: titleMatch ? titleMatch[1].trim() : "Unknown",
                secondaryTitle: secondaryTitleMatch ? secondaryTitleMatch[1].trim() : null,
                type: type === 1 ? "TV" : "Movie",
                episodes: epsAttr ? parseInt(epsAttr[1]) : 0,
                image: imageMatch ? `https://chiaki.site/${imageMatch[1]}` : null,
                metadata: { date: parts[0] || null, type: parts[1] || null, episodes: episodesCount, duration: duration },
                rating: ratingMatch ? ratingMatch[1].trim() : null
            });
        }
        return entries;
    } catch (err) {
        console.error("Scraping error:", err);
        return null;
    }
}

app.get("/api/watch-order", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "Missing anilistId" }, 400, CORS_HEADERS);
    const malId = await getMalIdFromAnilistId(parseInt(id));
    if (!malId) return c.json({ error: "MAL ID not found" }, 404, CORS_HEADERS);
    const data = await scrapeWatchOrder(malId);
    if (!data) return c.json({ error: "Scraping failed" }, 502, CORS_HEADERS);
    return c.json(data, 200, { ...CORS_HEADERS, "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" });
});

app.get("/api/debug-manifest", async (c) => {
    const targetUrlRaw = c.req.query("url");
    if (!targetUrlRaw) {
        return c.json({ error: "Missing url parameter" }, 400, CORS_HEADERS);
    }

    let targetUrl: URL;
    try {
        targetUrl = new URL(targetUrlRaw);
    } catch {
        return c.json({ error: "Invalid url parameter" }, 400, CORS_HEADERS);
    }

    const originParam = c.req.query("origin");
    const upstreamHeaders = generateHeadersOriginal(targetUrl, originParam);

    try {
        const upstream = await fetch(targetUrl.href, {
            headers: upstreamHeaders,
            redirect: "manual",
            // @ts-ignore
            tls: { rejectUnauthorized: false },
        });
        const contentType = upstream.headers.get("content-type") ?? "";
        const textBody = await upstream.text();

        return c.json({
            upstreamUrl: targetUrl.href,
            origin: originParam ?? null,
            contentType,
            status: upstream.status,
            ...extractManifestDebug(textBody),
        }, 200, CORS_HEADERS);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return c.json({ error: errorMsg }, 502, CORS_HEADERS);
    }
});

// ─── Unified Proxy Routine ────────────────────────────────────────────────────

app.all("*", async (c) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "POST") return c.text("Method not allowed", 405, CORS_HEADERS);

    const path = c.req.path;
    const targetUrlRaw = c.req.query("url");
    const dashboardParam = c.req.query("dashboard");
    const debugEnabled = c.req.query("debug") === "1";

    // Explicit dashboard request
    if (dashboardParam === "true" || dashboardParam === "1") {
        return handleDashboard(c);
    }

    // Handle dashboard / info at root
    if (!targetUrlRaw) {
        if (path === "/" || path === "/api" || path === "/api/") {
            return handleDashboard(c);
        }

        // Relative redirection recovery
        const lastHost = getCookie(c, "_last_requested");
        if (lastHost) {
            const remainingPath = path.startsWith("/api") ? path.slice(4) : path;
            const redirectTarget = new URL(lastHost + (remainingPath.startsWith("/") ? "" : "/") + remainingPath);
            const redirectUrl = `/?${buildProxyQuery(redirectTarget, undefined, debugEnabled)}`;
            return c.redirect(redirectUrl);
        }
        return c.text("Missing URL parameter. Usage: /?url=<ENCODED_URL>", 400, CORS_HEADERS);
    }

    let targetUrl: URL;
    try { targetUrl = new URL(targetUrlRaw); } catch { return c.text(`Invalid URL: ${targetUrlRaw}`, 400, CORS_HEADERS); }

    const originParam = c.req.query("origin");
    const headersParam = c.req.query("headers");
    const jsonParam = c.req.query("json");

    const upstreamHeaders = generateHeadersOriginal(targetUrl, originParam);

    // Forward Range and standard headers
    const clientHeaders = c.req.raw.headers;
    for (const h of ["range", "if-range", "if-none-match", "if-modified-since", "content-type"]) {
        const val = clientHeaders.get(h);
        if (val) upstreamHeaders[h] = val;
    }

    if (headersParam) {
        try {
            const parsed = JSON.parse(headersParam);
            for (const [k, v] of Object.entries(parsed)) { upstreamHeaders[k.toLowerCase()] = String(v); }
        } catch { /* ignore */ }
    }

    let body: any = null;
    if (method === "POST") {
        body = jsonParam ? jsonParam : await c.req.arrayBuffer();
        if (jsonParam) upstreamHeaders["content-type"] = "application/json";
    }

    let upstream: Response;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        upstream = await fetch(targetUrl.href, {
            method,
            headers: upstreamHeaders,
            body,
            redirect: "manual",
            // @ts-ignore
            tls: { rejectUnauthorized: false },
            signal: controller.signal,
        });
        clearTimeout(timeout);
    } catch (err) {
        console.error(`[Proxy Error] Failed to fetch ${targetUrl.href}:`, err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        return c.text(`Target Fetch Failed: ${errorMsg}`, 502, CORS_HEADERS);
    }

    // Set cookie for relative redirection recovery
    const urlBase = `${targetUrl.protocol}//${targetUrl.host}${targetUrl.pathname.substring(0, targetUrl.pathname.lastIndexOf("/"))}`;
    setCookie(c, "_last_requested", urlBase, { maxAge: 3600, httpOnly: true, path: "/", sameSite: "Lax" });

    // Handle 3xx Redirects
    if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("location");
        if (location) {
            const resolvedLocation = resolveUrl(location, targetUrl);
            return c.redirect(`/?${buildProxyQuery(resolvedLocation, originParam, debugEnabled)}`, upstream.status as any);
        }
    }

    const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
    for (const [name, value] of upstream.headers.entries()) {
        if (!BLACKLIST_HEADERS.includes(name.toLowerCase())) { responseHeaders[name] = value; }
    }

    // High Performance Caching for Segments
    responseHeaders["Cache-Control"] = MEDIA_CACHE_CONTROL;

    const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    const isM3u8 = contentType.includes("mpegurl") || targetUrl.pathname.toLowerCase().endsWith(".m3u8");

    if (isM3u8) {
        try {
            const textBody = await upstream.text();
            if (!textBody || textBody.length === 0) {
                return c.body(null, upstream.status as ContentfulStatusCode, responseHeaders);
            }

            if (textBody.trimStart().startsWith("#EXTM3U")) {
                const debugInfo = extractManifestDebug(textBody);
                const rewritten = textBody
                    .split("\n")
                    .map((line) => processM3u8Line(line.replace(/\r$/, ""), targetUrl, originParam, debugEnabled))
                    .join("\n");

                if (debugEnabled) {
                    responseHeaders["X-Proxy-Debug-Upstream"] = targetUrl.href.slice(0, 200);
                    responseHeaders["X-Proxy-Debug-Variants"] = String(debugInfo.variantCount);
                    responseHeaders["X-Proxy-Debug-Codecs"] = debugInfo.codecs.join(" | ").slice(0, 200);
                }
                return c.body(rewritten, upstream.status as ContentfulStatusCode, { ...responseHeaders, "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-cache, no-store, must-revalidate" });
            }
            // If it claimed to be m3u8 but isn't, return as is
            return c.body(textBody, upstream.status as ContentfulStatusCode, responseHeaders);
        } catch (err) {
            console.error(`[Proxy Error] M3U8 split/process failed:`, err);
            return c.text("Manifest processing error", 500, CORS_HEADERS);
        }
    }

    return c.body(upstream.body as ReadableStream, upstream.status as ContentfulStatusCode, responseHeaders);
});

const port = parseInt(process.env.PORT || "8080", 10);
console.log(`🚀 Proxy alive on http://0.0.0.0:${port}`);

export default {
    port,
    hostname: "0.0.0.0",
    fetch: app.fetch,
};
