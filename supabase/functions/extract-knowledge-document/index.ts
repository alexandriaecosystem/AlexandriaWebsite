import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "knowledge-base";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const jsonHeaders = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

function findEndOfCentralDir(bytes: Uint8Array): number {
  const sig = 0x06054b50;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === (sig & 0xff) && bytes[i + 1] === ((sig >> 8) & 0xff) && bytes[i + 2] === ((sig >> 16) & 0xff) && bytes[i + 3] === ((sig >>> 24) & 0xff)) return i;
  }
  throw new Error("not_a_valid_zip_eocd_not_found");
}

async function extractZipEntryText(bytes: Uint8Array, targetName: string): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDir(bytes);
  const cdEntryCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  let ptr = cdOffset;
  for (let i = 0; i < cdEntryCount; i++) {
    const sig = view.getUint32(ptr, true);
    if (sig !== 0x02014b50) throw new Error("bad_central_directory_entry");
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    if (name === targetName) {
      const lhView = new DataView(bytes.buffer, bytes.byteOffset + localHeaderOffset, 30);
      if (lhView.getUint32(0, true) !== 0x04034b50) throw new Error("bad_local_file_header");
      const lhNameLen = lhView.getUint16(26, true);
      const lhExtraLen = lhView.getUint16(28, true);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const compressed = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return new TextDecoder("utf-8").decode(compressed);
      if (method === 8) {
        const ds = new DecompressionStream("deflate-raw");
        const xmlBytes = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(ds)).arrayBuffer());
        return new TextDecoder("utf-8").decode(xmlBytes);
      }
      throw new Error(`unsupported_zip_compression_method_${method}`);
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`zip_entry_not_found: ${targetName}`);
}

function docxXmlToText(xml: string): string {
  let out = xml.replace(/<w:p[ >]/g, "\n$&").replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>/g, "\n");
  out = out.replace(/<[^>]+>/g, "");
  return out.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await callerIsAllowed(req))) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json_body" }, 400); }
  const documentId = body.document_id;
  const force = body.force === true;
  if (!documentId || typeof documentId !== "string") return json({ error: "document_id_required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: doc, error: fetchErr } = await supabase.from("knowledge_documents").select("id, storage_path, content").eq("id", documentId).single();
  if (fetchErr || !doc) return json({ error: "document_not_found", detail: fetchErr?.message ?? null }, 404);
  if (!doc.storage_path) return json({ error: "no_storage_path", document_id: documentId }, 422);
  if (doc.content && String(doc.content).trim().length > 0 && !force) return json({ ok: true, skipped: true, reason: "content_already_present", document_id: documentId });

  try {
    const { data: fileBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(doc.storage_path);
    if (dlErr || !fileBlob) throw new Error(`storage_download_failed: ${dlErr?.message ?? "unknown"}`);
    if (fileBlob.size > MAX_FILE_BYTES) throw new Error("file_too_large_max_20mb");

    const lowerPath = doc.storage_path.toLowerCase();
    let text = "";
    if (lowerPath.endsWith(".docx")) text = docxXmlToText(await extractZipEntryText(new Uint8Array(await fileBlob.arrayBuffer()), "word/document.xml"));
    else if (lowerPath.endsWith(".txt") || lowerPath.endsWith(".md")) text = (await fileBlob.text()).trim();
    else throw new Error(`unsupported_file_type: ${doc.storage_path}`);
    if (!text) throw new Error("extracted_text_empty");

    const { error: updateErr } = await supabase.from("knowledge_documents").update({ content: text, processing_status: "PROCESSING", processing_error: null, updated_at: new Date().toISOString() }).eq("id", documentId);
    if (updateErr) throw new Error(`db_update_failed: ${updateErr.message}`);
    return json({ ok: true, document_id: documentId, content_length: text.length, processing_status: "PROCESSING" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("knowledge_documents").update({ processing_status: "FAILED", processing_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", documentId);
    return json({ ok: false, document_id: documentId, error: message }, 500);
  }
});
