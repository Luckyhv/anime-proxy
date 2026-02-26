import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { handle } from "hono/vercel";

export const config = {
    runtime: "edge",
};

// ─── Default headers for upstream requests ────────────────────────────────────
const DEFAULT_HEADERS: Record<string, string> = {
    "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
    accept: "*/*",
    "accept-language": "en-US,en;q=0.5",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
};

interface DomainGroup {
    patterns: RegExp[];
    origin: string;
    referer: string;
    customHeaders?: Record<string, string>;
}

const DOMAIN_GROUPS: DomainGroup[] = [
    {
        patterns: [/\.padorupado\.ru$/i, /\.kwikie\.ru$/i],
        origin: "https://kwik.si",
        referer: "https://kwik.si/",
        customHeaders: { "cache-control": "no-cache", pragma: "no-cache" },
    },
    {
        patterns: [/\.streamtape\.to$/i],
        origin: "https://streamtape.to",
        referer: "https://streamtape.to/",
    },
    {
        patterns: [/vidcache\.net$/i],
        origin: "https://www.animegg.org",
        referer: "https://www.animegg.org/",
    },
    {
        patterns: [
            /krussdomi\.com$/i,
            /revolutionizingtheweb\.xyz$/i,
            /nextgentechnologytrends\.xyz$/i,
            /smartinvestmentstrategies\.xyz$/i,
            /creativedesignstudioxyz\.xyz$/i,
            /breakingdigitalboundaries\.xyz$/i,
            /ultimatetechinnovation\.xyz$/i,
        ],
        origin: "https://krussdomi.com",
        referer: "https://krussdomi.com/",
    },
    {
        patterns: [/\.akamaized\.net$/i],
        origin: "https://players.akamai.com",
        referer: "https://players.akamai.com/",
    },
    {
        patterns: [
            /(?:^|\.)shadowlandschronicles\./i,
            /digitalshinecollective\.xyz$/i,
            /thrivequesthub\.xyz$/i,
            /novaedgelabs\.xyz$/i,
        ],
        origin: "https://cloudnestra.com",
        referer: "https://cloudnestra.com/",
    },
    {
        patterns: [/(?:^|\.)viddsn\./i, /\.anilike\.cyou$/i],
        origin: "https://vidwish.live/",
        referer: "https://vidwish.live/",
    },
    {
        patterns: [/(?:^|\.)dotstream\./i, /(?:^|\.)playcloud1\./i],
        origin: "https://megaplay.buzz/",
        referer: "https://megaplay.buzz/",
    },
    {
        patterns: [/\.cloudfront\.net$/i],
        origin: "https://d2zihajmogu5jn.cloudfront.net",
        referer: "https://d2zihajmogu5jn.cloudfront.net/",
    },
    {
        patterns: [/\.ttvnw\.net$/i],
        origin: "https://www.twitch.tv",
        referer: "https://www.twitch.tv/",
    },
    {
        patterns: [/\.xx\.fbcdn\.net$/i],
        origin: "https://www.facebook.com",
        referer: "https://www.facebook.com/",
    },
    {
        patterns: [/\.anih1\.top$/i, /\.xyk3\.top$/i],
        origin: "https://ee.anih1.top",
        referer: "https://ee.anih1.top/",
    },
    {
        patterns: [/\.premilkyway\.com$/i],
        origin: "https://uqloads.xyz",
        referer: "https://uqloads.xyz/",
    },
    {
        patterns: [/\.streamcdn\.com$/i],
        origin: "https://anime.uniquestream.net",
        referer: "https://anime.uniquestream.net/",
    },
    {
        patterns: [
            /\.raffaellocdn\.net$/i,
            /\.feetcdn\.com$/i,
            /clearskydrift45\.site$/i,
        ],
        origin: "https://kerolaunochan.online",
        referer: "https://kerolaunochan.online/",
    },
    {
        patterns: [
            /dewbreeze84\.online$/i,
            /cloudydrift38\.site$/i,
            /sunshinerays93\.live$/i,
            /clearbluesky72\.wiki$/i,
            /breezygale56\.online$/i,
            /frostbite27\.pro$/i,
            /frostywinds57\.live$/i,
            /icyhailstorm64\.wiki$/i,
            /icyhailstorm29\.online$/i,
            /windflash93\.xyz$/i,
            /stormdrift27\.site$/i,
            /tempestcloud61\.wiki$/i,
            /sunburst66\.pro$/i,
            /douvid\.xyz$/i,
        ],
        origin: "https://megacloud.blog",
        referer: "https://megacloud.blog/",
        customHeaders: { "cache-control": "no-cache", pragma: "no-cache" },
    },
    {
        patterns: [/\.echovideo\.to$/i],
        origin: "https://aniwave.se",
        referer: "https://aniwave.se/",
    },
    {
        patterns: [/\.vid-cdn\.xyz$/i],
        origin: "https://anizone.to/",
        referer: "https://anizone.to/",
    },
    {
        patterns: [/\.1stkmgv1\.com$/i],
        origin: "https://animeyy.com",
        referer: "https://animeyy.com/",
    },
    {
        patterns: [
            /lightningspark77\.pro$/i,
            /thunderwave48\.xyz$/i,
            /stormwatch95\.site$/i,
            /windyrays29\.online$/i,
            /thunderstrike77\.online$/i,
            /lightningflash39\.live$/i,
            /cloudburst82\.xyz$/i,
            /drizzleshower19\.site$/i,
            /rainstorm92\.xyz$/i,
        ],
        origin: "https://megacloud.club",
        referer: "https://megacloud.club/",
    },
    {
        patterns: [
            /cloudburst99\.xyz$/i,
            /frostywinds73\.pro$/i,
            /stormwatch39\.live$/i,
            /sunnybreeze16\.live$/i,
            /mistydawn62\.pro$/i,
            /lightningbolt21\.live$/i,
            /gentlebreeze85\.xyz$/i,
        ],
        origin: "https://videostr.net",
        referer: "https://videostr.net/",
    },
    {
        patterns: [/vmeas\.cloud$/i],
        origin: "https://vidmoly.to",
        referer: "https://vidmoly.to/",
    },
    {
        patterns: [/nextwaveinitiative\.xyz$/i],
        origin: "https://edgedeliverynetwork.org",
        referer: "https://edgedeliverynetwork.org/",
    },
    {
        patterns: [
            /lightningbolts\.ru$/i,
            /lightningbolt\.site$/i,
            /vyebzzqlojvrl\.top$/i,
        ],
        origin: "https://vidsrc.cc",
        referer: "https://vidsrc.cc/",
    },
    {
        patterns: [/vidlvod\.store$/i],
        origin: "https://vidlink.pro",
        referer: "https://vidlink.pro/",
    },
    {
        patterns: [/sunnybreeze16\.live$/i],
        origin: "https://megacloud.store",
        referer: "https://megacloud.store/",
    },
    {
        patterns: [
            /heatwave90\.pro$/i,
            /humidmist27\.wiki$/i,
            /frozenbreeze65\.live$/i,
            /drizzlerain73\.online$/i,
            /sunrays81\.xyz$/i,
        ],
        origin: "https://kerolaunochan.live",
        referer: "https://kerolaunochan.live/",
    },
    {
        patterns: [/\.vkcdn5\.com$/i],
        origin: "https://vkspeed.com",
        referer: "https://vkspeed.com/",
    },
    {
        patterns: [/embed\.su$/i, /usbigcdn\.cc$/i, /\.congacdn\.cc$/i],
        origin: "https://embed.su",
        referer: "https://embed.su/",
    },
];

function generateHeadersForUrl(
    url: URL,
    customOrigin?: string
): Record<string, string> {
    const headers: Record<string, string> = { ...DEFAULT_HEADERS };

    if (customOrigin) {
        headers["origin"] = customOrigin;
        headers["referer"] = customOrigin.endsWith("/")
            ? customOrigin
            : `${customOrigin}/`;
        return headers;
    }

    const hostname = url.hostname;
    const group = DOMAIN_GROUPS.find((g) =>
        g.patterns.some((re) => re.test(hostname))
    );

    if (group) {
        headers["origin"] = group.origin;
        headers["referer"] = group.referer;
        if (group.customHeaders) {
            Object.assign(headers, group.customHeaders);
        }
    } else {
        const origin = url.origin;
        headers["origin"] = origin;
        headers["referer"] = `${origin}/`;
    }

    return headers;
}

// ─── CORS constants ───────────────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
    "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Range, X-Requested-With, Origin, Referer, Accept, Accept-Encoding, Accept-Language, Cache-Control, Pragma, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, Sec-Ch-Ua, Sec-Ch-Ua-Mobile, Sec-Ch-Ua-Platform, Connection",
    "Access-Control-Expose-Headers":
        "Content-Length, Content-Range, Accept-Ranges, Content-Type, Cache-Control, Expires, Vary, ETag, Last-Modified",
    "Access-Control-Max-Age": "86400",
    "Cross-Origin-Resource-Policy": "cross-origin",
    Vary: "Origin",
};

const PASSTHROUGH_HEADERS = new Set([
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "expires",
    "last-modified",
    "etag",
    "vary",
]);

// Headers to remove from the upstream response before sending to client
const BLACKLIST_HEADERS = [
    "vary",
    "content-encoding",
    "transfer-encoding",
    "content-length",
    "connection",
    "server",
];

function resolveUrl(line: string, base: URL): URL {
    try {
        return new URL(line);
    } catch {
        return new URL(line, base);
    }
}

function processM3u8Line(
    line: string,
    scrapeUrl: URL,
    originParam?: string
): string {
    if (line.length === 0) return "";

    if (line[0] === "#") {
        if (line.startsWith("#EXT-X-KEY")) {
            const uriStart = line.indexOf('URI="');
            if (uriStart !== -1) {
                const keyUriStart = uriStart + 5;
                const quotePos = line.indexOf('"', keyUriStart);
                if (quotePos !== -1) {
                    const keyUri = line.slice(keyUriStart, quotePos);
                    const resolved = resolveUrl(keyUri, scrapeUrl);
                    let q = `url=${encodeURIComponent(resolved.href)}`;
                    if (originParam) q += `&origin=${originParam}`;
                    return `${line.slice(0, keyUriStart)}/?${q}${line.slice(quotePos)}`;
                }
            }
            return line;
        }

        if (line.startsWith('#EXT-X-MAP:URI="')) {
            const innerUrl = line.slice(16, line.length - 1);
            const resolved = resolveUrl(innerUrl, scrapeUrl);
            let q = `url=${encodeURIComponent(resolved.href)}`;
            if (originParam) q += `&origin=${originParam}`;
            return `#EXT-X-MAP:URI="/?${q}"`;
        }

        if (line.length > 20 && (line.includes("URI=") || line.includes("URL="))) {
            const colonPos = line.indexOf(":");
            if (colonPos !== -1) {
                const prefix = line.slice(0, colonPos + 1);
                const attrs = line.slice(colonPos + 1);
                const rewrittenAttrs = attrs.split(",").map((attr) => {
                    const eqPos = attr.indexOf("=");
                    if (eqPos === -1) return attr;
                    const key = attr.slice(0, eqPos).trim();
                    const value = attr
                        .slice(eqPos + 1)
                        .trim()
                        .replace(/^"|"$/g, "");
                    if (key === "URI" || key === "URL") {
                        const resolved = resolveUrl(value, scrapeUrl);
                        let q = `url=${encodeURIComponent(resolved.href)}`;
                        if (originParam) q += `&origin=${originParam}`;
                        return `${key}="/?${q}"`;
                    }
                    return attr;
                });
                return prefix + rewrittenAttrs.join(",");
            }
        }

        return line;
    }

    const resolved = resolveUrl(line, scrapeUrl);
    let q = `url=${encodeURIComponent(resolved.href)}`;
    if (originParam) q += `&origin=${encodeURIComponent(originParam)}`;
    return `/?${q}`;
}

// ─── Hono app ─────────────────────────────────────────────────────────────────
const app = new Hono();

// Forward options to handle preflights
app.options("*", (c) => c.body(null, 204, CORS_HEADERS));

function handleInfo(c: any) {
    return c.json({
        name: "Anime Proxy",
        version: "1.1.0",
        description: "High-performance M3U8 and binary proxy for anime streaming.",
        usage: "/api/?url=<encoded_url>",
        features: ["M3U8 rewriting", "Relative path redirection", "CORS enabled"],
        cors: "Enabled for all origins (*)",
    }, 200, CORS_HEADERS);
}

app.get("/api/info", handleInfo);
app.get("/info", handleInfo);

// Main handler for both GET and POST
app.all("*", async (c) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "POST") {
        return c.text("Method not allowed", 405, CORS_HEADERS);
    }

    const path = c.req.path;
    const targetUrlRaw = c.req.query("url");

    // ── Handle requests without 'url' param ────────────────────────────
    if (!targetUrlRaw) {
        if (path === "/" || path === "/api" || path === "/api/") {
            return handleInfo(c);
        }

        // Attempt relative redirection using the last host cookie
        const lastHost = getCookie(c, "_last_requested");
        if (lastHost) {
            const remainingPath = path.startsWith("/api") ? path.slice(4) : path;
            const separator = remainingPath.startsWith("/") ? "" : "/";
            const search = c.req.url.split("?")[1];
            const redirectUrl = `/?url=${encodeURIComponent(lastHost + separator + remainingPath)}${search ? "&" + search : ""
                }`;
            return c.redirect(redirectUrl);
        }

        return c.text("Missing URL parameter", 400, CORS_HEADERS);
    }

    // ── Validate target URL ─────────────────────────────────────────────
    let targetUrl: URL;
    try {
        targetUrl = new URL(targetUrlRaw);
    } catch {
        return c.text(`Invalid URL: ${targetUrlRaw}`, 400, CORS_HEADERS);
    }

    const originParam = c.req.query("origin");
    const headersParam = c.req.query("headers");
    const jsonParam = c.req.query("json");

    // ── Build upstream request ──────────────────────────────────────────
    const upstreamHeaders = generateHeadersForUrl(targetUrl, originParam);

    // Forward client headers (Range, etc.)
    const clientHeaders = c.req.raw.headers;
    for (const h of ["range", "if-range", "if-none-match", "if-modified-since"]) {
        const val = clientHeaders.get(h);
        if (val) upstreamHeaders[h] = val;
    }

    // Add custom headers from query
    if (headersParam) {
        try {
            const parsed = JSON.parse(headersParam);
            for (const [k, v] of Object.entries(parsed)) {
                upstreamHeaders[k.toLowerCase()] = String(v);
            }
        } catch { /* ignore */ }
    }

    // Handle POST data
    let body: any = null;
    if (method === "POST") {
        if (jsonParam) {
            body = jsonParam;
            upstreamHeaders["content-type"] = "application/json";
        } else {
            body = await c.req.arrayBuffer();
        }
    }

    // ── Fetch upstream ──────────────────────────────────────────────────
    let upstream: Response;
    try {
        upstream = await fetch(targetUrl.href, {
            method,
            headers: upstreamHeaders,
            body,
            redirect: "manual", // Handle redirects manually for Location rewriting
        });
    } catch (err) {
        console.error(`Failed to fetch ${targetUrl.href}:`, err);
        return c.text("Failed to fetch target URL", 502, CORS_HEADERS);
    }

    // Store the base URL in a cookie to help with subsequent relative requests
    const urlBase = `${targetUrl.protocol}//${targetUrl.host}${targetUrl.pathname.substring(0, targetUrl.pathname.lastIndexOf("/"))}`;
    setCookie(c, "_last_requested", urlBase, {
        maxAge: 3600,
        httpOnly: true,
        path: "/",
        sameSite: "Lax",
    });

    // ── Handle Redirects ────────────────────────────────────────────────
    if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("location");
        if (location) {
            const resolvedLocation = resolveUrl(location, targetUrl);
            const proxiedLocation = `/?url=${encodeURIComponent(resolvedLocation.href)}`;
            return c.redirect(proxiedLocation, upstream.status as any);
        }
    }

    // ── Build Response Headers ──────────────────────────────────────────
    const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
    for (const [name, value] of upstream.headers.entries()) {
        const lowerName = name.toLowerCase();
        if (!BLACKLIST_HEADERS.includes(lowerName)) {
            responseHeaders[name] = value;
        }
    }

    const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    const isM3u8ByContentType =
        contentType.includes("mpegurl") ||
        contentType.includes("application/vnd.apple.mpegurl") ||
        contentType.includes("application/x-mpegurl");
    const isM3u8ByUrl = targetUrl.pathname.toLowerCase().endsWith(".m3u8");

    // ── M3U8 rewriting path ─────────────────────────────────────────────
    if (isM3u8ByContentType || isM3u8ByUrl) {
        const textBody = await upstream.text();
        const looksLikeM3u8 = textBody.trimStart().startsWith("#EXTM3U");

        if (isM3u8ByContentType || looksLikeM3u8) {
            const rewritten = textBody
                .split("\n")
                .map((line) => processM3u8Line(line.replace(/\r$/, ""), targetUrl, originParam))
                .join("\n");

            return c.body(rewritten, upstream.status as ContentfulStatusCode, {
                ...responseHeaders,
                "Content-Type": "application/vnd.apple.mpegurl",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            });
        }
        return c.body(textBody, upstream.status as ContentfulStatusCode, responseHeaders);
    }

    // ── Passthrough (binary segments, etc.) ─────────────────────────────
    return c.body(upstream.body as ReadableStream, upstream.status as ContentfulStatusCode, responseHeaders);
});

export default handle(app);
