import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractLinks, extractText, getDocumentProxy, getMeta } from "npm:unpdf@1.8.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_FETCH_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 250;
const MAX_EXTRACTED_CHARS = 2_000_000;
const MAX_DISCOVERED_URLS = 250;
const MAX_REDIRECTS = 5;
const ALLOWED_HOSTS = new Set(["alexandriaecosystem.com", "www.alexandriaecosystem.com"]);
const PRIVATE_PATH = /^\/(?:login|signin|account|admin)(?:\/|$)/i;
const BLOCKED_BINARY = /\.(?:jpe?g|png|gif|webp|svg|zip|mp4|mp3|woff2?|ttf)(?:$|\?)/i;

const headers = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

function allowedUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname.toLowerCase()) && !PRIVATE_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

function normalizeOfficialUrl(value: string, base?: string): string | null {
  try {
    const u = new URL(value, base);
    if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;
    if (PRIVATE_PATH.test(u.pathname) || BLOCKED_BINARY.test(u.pathname)) return null;
    u.protocol = "https:";
    u.hostname = "www.alexandriaecosystem.com";
    u.search = "";
    u.hash = "";
    u.pathname = u.pathname.replace(/\/{2,}/g, "/");
    return u.toString();
  } catch {
    return null;
  }
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const out = parts.map((part) => Number(part));
  if (out.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return out;
}

function ipv6ToBytes(value: string): number[] | null {
  let input = value.toLowerCase().split("%")[0];
  if (!input.includes(":")) return null;

  const ipv4Match = input.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match) {
    const ipv4 = parseIpv4(ipv4Match[1]);
    if (!ipv4) return null;
    const replacement = `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
    input = input.slice(0, input.length - ipv4Match[1].length) + replacement;
  }

  const parts = input.split("::");
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const parseHextet = (part: string) => /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : NaN;
  const leftValues = left.map(parseHextet);
  const rightValues = right.map(parseHextet);
  if ([...leftValues, ...rightValues].some((part) => !Number.isFinite(part))) return null;

  let hextets: number[];
  if (parts.length === 1) {
    if (leftValues.length !== 8) return null;
    hextets = leftValues;
  } else {
    const missing = 8 - leftValues.length - rightValues.length;
    if (missing < 1) return null;
    hextets = [...leftValues, ...Array(missing).fill(0), ...rightValues];
  }
  if (hextets.length !== 8) return null;
  return hextets.flatMap((part) => [(part >> 8) & 0xff, part & 0xff]);
}

function isPublicIpv4(value: string): boolean {
  const ip = parseIpv4(value);
  if (!ip) return false;
  const [a, b, c] = ip;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(value: string): boolean {
  const bytes = ipv6ToBytes(value);
  if (!bytes) return false;
  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  if (allZero || loopback) return false;

  const firstTenZero = bytes.slice(0, 10).every((byte) => byte === 0);
  const mapped = firstTenZero && bytes[10] === 0xff && bytes[11] === 0xff;
  const compatible = bytes.slice(0, 12).every((byte) => byte === 0);
  if (mapped || compatible) return isPublicIpv4(bytes.slice(12).join("."));

  if ((bytes[0] & 0xfe) === 0xfc) return false;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false;
  if (bytes[0] === 0xff) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return false;
  return true;
}

function isPublicIp(value: string): boolean {
  return value.includes(":") ? isPublicIpv6(value) : isPublicIpv4(value);
}

async function assertPublicOfficialHost(urlValue: string): Promise<void> {
  const url = new URL(urlValue);
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) throw new Error("official_source_url_not_allowed");
  if (typeof Deno.resolveDns !== "function") throw new Error("dns_public_ip_validation_unavailable");

  const [aResult, aaaaResult] = await Promise.allSettled([
    Deno.resolveDns(host, "A"),
    Deno.resolveDns(host, "AAAA"),
  ]);
  const addresses = [
    ...(aResult.status === "fulfilled" ? aResult.value : []),
    ...(aaaaResult.status === "fulfilled" ? aaaaResult.value : []),
  ];
  if (!addresses.length) throw new Error("official_source_dns_resolution_failed");
  if (addresses.some((address) => !isPublicIp(address))) throw new Error("official_source_resolved_to_non_public_ip");
}

async function callerIsAllowed(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  if (!bearer) return false;
  if (bearer === SERVICE_ROLE_KEY) return true;
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await caller.rpc("admin_get_session");
  if (error || !data) return false;
  const record = Array.isArray(data) ? data[0] : data;
  return record?.is_admin === true && record?.is_active !== false;
}

async function fetchAllowlisted(startUrl: string): Promise<{ response: Response; finalUrl: string }> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!allowedUrl(current)) throw new Error("official_source_url_not_allowed");
    await assertPublicOfficialHost(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": "AlexandriaOfficialIndexer/1.0 (+https://www.alexandriaecosystem.com)",
        "Accept": "text/html,application/xhtml+xml,application/xml,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document;q=0.9,*/*;q=0.1",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("redirect_without_location");
      const next = normalizeOfficialUrl(location, current);
      if (!next) throw new Error("redirect_outside_official_domain");
      current = next;
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error("too_many_redirects");
}

async function readLimited(response: Response, maxBytes = MAX_FETCH_BYTES): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("official_source_exceeds_15mb_limit");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("size_limit");
      throw new Error("official_source_exceeds_15mb_limit");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

function findEndOfCentralDir(bytes: Uint8Array): number {
  const sig = 0x06054b50;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === (sig & 0xff) && bytes[i + 1] === ((sig >> 8) & 0xff) && bytes[i + 2] === ((sig >> 16) & 0xff) && bytes[i + 3] === ((sig >>> 24) & 0xff)) return i;
  }
  throw new Error("not_a_valid_docx_zip");
}

async function extractZipEntryText(bytes: Uint8Array, targetName: string): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDir(bytes);
  const cdEntryCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  let ptr = cdOffset;
  for (let i = 0; i < cdEntryCount; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("bad_docx_central_directory");
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    if (name === targetName) {
      const lh = new DataView(bytes.buffer, bytes.byteOffset + localHeaderOffset, 30);
      if (lh.getUint32(0, true) !== 0x04034b50) throw new Error("bad_docx_local_header");
      const lhNameLen = lh.getUint16(26, true);
      const lhExtraLen = lh.getUint16(28, true);
      const start = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const compressed = bytes.subarray(start, start + compSize);
      if (method === 0) return new TextDecoder().decode(compressed);
      if (method === 8) {
        const ds = new DecompressionStream("deflate-raw");
        return await new Response(new Blob([compressed]).stream().pipeThrough(ds)).text();
      }
      throw new Error(`unsupported_docx_compression_${method}`);
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("docx_document_xml_not_found");
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  let xml = await extractZipEntryText(bytes, "word/document.xml");
  xml = xml.replace(/<w:p[ >]/g, "\n$&").replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>/g, "\n");
  return decodeEntities(xml.replace(/<[^>]+>/g, " "));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => { try { return String.fromCodePoint(Number(n)); } catch { return " "; } })
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } });
}

function neutralizeInstructionLikeLines(value: string): string {
  const suspicious = /\b(?:ignore (?:all |any )?(?:previous|prior) instructions|system prompt|developer message|assistant message|tool call|execute workflow|reveal (?:secrets?|api keys?)|override (?:policy|instructions)|send (?:the )?(?:secret|token|key))\b/i;
  return value
    .split(/\r?\n/)
    .map((line) => suspicious.test(line) ? "[UNTRUSTED INSTRUCTION-LIKE TEXT REMOVED]" : line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToEvidence(raw: string): { text: string; title: string | null; language: string | null; links: string[] } {
  const links: string[] = [];
  for (const match of raw.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) links.push(match[1]);
  for (const match of raw.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi)) links.push(decodeEntities(match[1].trim()));
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const langMatch = raw.match(/<html[^>]*\blang=["']?([a-zA-Z-]{2,16})/i);
  let text = raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|form|button|input|textarea|select)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|li|h[1-6]|tr|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = neutralizeInstructionLikeLines(decodeEntities(text));
  const title = titleMatch ? neutralizeInstructionLikeLines(decodeEntities(titleMatch[1].replace(/<[^>]+>/g, " "))).slice(0, 500) : null;
  const language = langMatch ? langMatch[1].toLowerCase().split("-")[0] : null;
  return { text, title, language, links };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await callerIsAllowed(req))) return json({ error: "forbidden" }, 403);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json_body" }, 400); }
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId)) return json({ error: "source_id_required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: source, error: sourceErr } = await supabase.from("official_sources")
    .select("id,canonical_url,page_title,language,source_type,authority_code,is_active,linked_from_source_id")
    .eq("id", sourceId).single();
  if (sourceErr || !source) return json({ error: "official_source_not_found", detail: sourceErr?.message ?? null }, 404);
  if (source.is_active !== true || !allowedUrl(String(source.canonical_url || ""))) return json({ error: "official_source_not_allowed" }, 422);

  const baseResult = {
    source_id: source.id,
    page_title: source.page_title ?? null,
    language: String(source.language || "en").toLowerCase(),
    content: "",
    content_hash: "",
    http_status: null as number | null,
    mime_type: null as string | null,
    extraction_status: "FAILED",
    crawl_error: null as string | null,
    etag: null as string | null,
    last_modified: null as string | null,
    discovered_urls: [] as string[],
    metadata: { authority_code: source.authority_code, source_type: source.source_type, linked_from_source_id: source.linked_from_source_id, final_url: source.canonical_url, content_truncated: false, page_count: null as number | null },
  };

  try {
    const { response, finalUrl } = await fetchAllowlisted(String(source.canonical_url));
    const status = response.status;
    const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const result = { ...baseResult, http_status: status, mime_type: mime || null, etag: response.headers.get("etag"), last_modified: response.headers.get("last-modified"), metadata: { ...baseResult.metadata, final_url: finalUrl } };
    if (status === 404 || status === 410) return json({ ...result, extraction_status: "REMOVED", crawl_error: null });
    if (status === 401 || status === 403) return json({ ...result, extraction_status: "BLOCKED", crawl_error: `HTTP ${status}` });
    if (status < 200 || status >= 400) return json({ ...result, extraction_status: "FAILED", crawl_error: `HTTP ${status}` });

    const bytes = await readLimited(response);
    const path = new URL(finalUrl).pathname.toLowerCase();
    const sourceType = String(source.source_type || "WEB_PAGE").toUpperCase();
    const isPdf = sourceType === "PDF" || path.endsWith(".pdf") || mime === "application/pdf";
    const isDocx = path.endsWith(".docx") || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isText = sourceType === "DOCUMENT" || path.endsWith(".txt") || path.endsWith(".md") || path.endsWith(".xml") || /^text\//.test(mime) || /(?:html|xml|json|markdown)/i.test(mime);

    let text = "";
    let title = source.page_title ?? null;
    let language = String(source.language || "en").toLowerCase();
    let rawLinks: string[] = [];
    let pageCount: number | null = null;

    if (isPdf) {
      const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
      pageCount = Number(pdf.numPages || 0);
      if (pageCount > MAX_PDF_PAGES) return json({ ...result, extraction_status: "UNSUPPORTED", crawl_error: `PDF exceeds ${MAX_PDF_PAGES} page limit`, metadata: { ...result.metadata, page_count: pageCount } });
      const extracted = await Promise.race([
        extractText(pdf, { mergePages: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("pdf_text_extraction_timeout")), 20_000)),
      ]);
      text = typeof extracted.text === "string" ? extracted.text : extracted.text.join("\n\n");
      try {
        const links = await extractLinks(pdf);
        rawLinks = Array.isArray(links.links) ? links.links : [];
      } catch { rawLinks = []; }
      try {
        const meta = await getMeta(pdf);
        const candidate = String(meta?.info?.Title || meta?.metadata?.title || "").trim();
        if (candidate) title = candidate.slice(0, 500);
      } catch { /* metadata is optional */ }
    } else if (isDocx) {
      text = await extractDocx(bytes);
    } else if (isText) {
      const raw = new TextDecoder("utf-8").decode(bytes);
      if (/html|xml/i.test(mime) || /<(?:html|body|main|article|loc)\b/i.test(raw)) {
        const parsed = htmlToEvidence(raw);
        text = parsed.text;
        if (parsed.title) title = parsed.title;
        if (parsed.language) language = parsed.language;
        rawLinks = parsed.links;
      } else {
        text = neutralizeInstructionLikeLines(raw);
      }
    } else {
      return json({ ...result, extraction_status: "UNSUPPORTED", crawl_error: `Unsupported official source type: ${mime || sourceType}` });
    }

    text = neutralizeInstructionLikeLines(text).trim();
    if (!text) return json({ ...result, extraction_status: "FAILED", crawl_error: "extracted_text_empty", metadata: { ...result.metadata, page_count: pageCount } });
    let truncated = false;
    if (text.length > MAX_EXTRACTED_CHARS) { text = text.slice(0, MAX_EXTRACTED_CHARS); truncated = true; }

    const discovered = [...new Set(rawLinks.map((link) => normalizeOfficialUrl(String(link), finalUrl)).filter((v): v is string => Boolean(v)))].slice(0, MAX_DISCOVERED_URLS);
    const contentHash = await sha256Hex(text);
    return json({
      ...result,
      page_title: title || source.page_title || new URL(finalUrl).pathname || "Official Alexandria source",
      language,
      content: text,
      content_hash: contentHash,
      extraction_status: "READY",
      crawl_error: null,
      discovered_urls: discovered,
      metadata: { ...result.metadata, content_truncated: truncated, page_count: pageCount },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const unsupported = /(?:15mb_limit|250 page limit|unsupported)/i.test(message);
    return json({ ...baseResult, extraction_status: unsupported ? "UNSUPPORTED" : "FAILED", crawl_error: message.slice(0, 4000) });
  }
});
