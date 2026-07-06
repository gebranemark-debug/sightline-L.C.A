/**
 * Fast page-count sniff without a full PDF parser. Counts distinct
 * `/Type /Page` objects (excluding the `/Type /Pages` tree root) in the raw
 * byte stream — accurate for well-formed PDFs, and null on decode failure so
 * the chip degrades gracefully to just filename · size. The backend is still
 * the authoritative gate (100-page cap enforced there via pypdf).
 */
export async function countPdfPages(file: File): Promise<number | null> {
  try {
    const buf = await file.arrayBuffer();
    const raw = new TextDecoder("latin1", { fatal: false }).decode(buf);
    const matches = raw.match(/\/Type\s*\/Page(?![s\w])/g);
    return matches?.length ?? null;
  } catch {
    return null;
  }
}
