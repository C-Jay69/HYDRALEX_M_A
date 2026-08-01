import pdfParse from "pdf-parse";

/**
 * Extract text from a PDF buffer
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} - Extracted text
 */
export async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error("PDF extraction error:", error);
    // Check for common PDF parsing errors
    if (error.message?.includes("Invalid PDF") || 
        error.message?.includes("Unable to parse") ||
        error.message?.includes("No PDF part found")) {
      throw new Error("PDF_UNREADABLE");
    }
    throw new Error(`Failed to extract PDF text: ${error.message}`);
  }
}

export default { extractPdfText };
