import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Extract text from a PDF buffer.
 * Specifically optimized for Vercel Serverless environments.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  console.log(`[PDF] Starting extraction. Buffer size: ${buffer.length} bytes`);

  // Strategy 1: pdf-parse (Pure JS, most compatible with Vercel)
  try {
    console.log("[PDF] Attempting Strategy 1: pdf-parse...");
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const data = await pdfParse(buffer);
    
    if (data && data.text && data.text.trim().length > 50) {
      console.log("[PDF] Strategy 1 SUCCESS: pdf-parse extracted text.");
      return data.text;
    }
    console.warn("[PDF] Strategy 1 failed: Text too short or missing.");
  } catch (e: any) {
    console.error("[PDF] Strategy 1 ERROR:", e.message);
  }

  // Strategy 2: pdfjs-dist (The heavy lifter)
  try {
    console.log("[PDF] Attempting Strategy 2: pdfjs-dist...");
    // Use the legacy build for better Vercel compatibility
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    
    // Disable worker for serverless environments
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = false;
    }

    const loadingTask = pdfjsLib.getDocument({ 
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false 
    });
    
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
    
    if (fullText.trim().length > 50) {
      console.log("[PDF] Strategy 2 SUCCESS: pdfjs-dist extracted text.");
      return fullText;
    }
    console.warn("[PDF] Strategy 2 failed: Text too short or missing.");
  } catch (e: any) {
    console.error("[PDF] Strategy 2 ERROR:", e.message);
  }

  // Strategy 3: Raw Buffer Scan (The "Hail Mary" - finds plain text strings in binary)
  try {
    console.log("[PDF] Attempting Strategy 3: Raw Buffer Scan...");
    const text = buffer.toString("utf8");
    const cleaned = text.replace(/[^\x20-\x7E\n\r\t]/g, " ");
    if (cleaned.trim().length > 500) {
      console.log("[PDF] Strategy 3 SUCCESS: Raw scan extracted text.");
      return cleaned;
    }
  } catch (e: any) {
    console.error("[PDF] Strategy 3 ERROR:", e.message);
  }

  console.error("[PDF] All extraction strategies failed.");
  throw new Error(
    "Could not extract text from PDF. The file might be scanned (an image) or encrypted. Try saving as .txt or pasting the contract text directly."
  );
}
