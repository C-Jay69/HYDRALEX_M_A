import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Extract text from a PDF buffer using multiple strategies:
 * 1. pdftotext (poppler-utils) — most reliable
 * 2. pdf-parse npm package — fallback
 * 3. Raw text extraction — last resort
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Strategy 1: pdftotext (poppler)
  try {
    const tmpIn = join(tmpdir(), `ma-pdf-${Date.now()}.pdf`);
    const tmpOut = join(tmpdir(), `ma-pdf-${Date.now()}.txt`);
    writeFileSync(tmpIn, buffer);

    const result = spawnSync("pdftotext", ["-enc", "UTF-8", tmpIn, tmpOut], {
      timeout: 30000,
    });

    if (result.status === 0 && existsSync(tmpOut)) {
      const text = readFileSync(tmpOut, "utf-8");
      try { unlinkSync(tmpIn); } catch {}
      try { unlinkSync(tmpOut); } catch {}
      if (text.trim().length > 50) {
        return text;
      }
    }
    try { unlinkSync(tmpIn); } catch {}
    try { unlinkSync(tmpOut); } catch {}
  } catch (e) {
    console.warn("pdftotext failed:", e);
  }

  // Strategy 2: pdf-parse
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer, {
      // Don't try to load test files
      max: 0,
    });
    if (data.text && data.text.trim().length > 50) {
      return data.text;
    }
  } catch (e) {
    console.warn("pdf-parse failed:", e);
  }

  // Strategy 3: pdfjs-dist
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as any);
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ");
      fullText += pageText + "\n";
    }
    if (fullText.trim().length > 50) return fullText;
  } catch (e) {
    console.warn("pdfjs-dist failed:", e);
  }

  throw new Error(
    "Could not extract text from PDF. Try saving as .txt or pasting the contract text directly."
  );
}
