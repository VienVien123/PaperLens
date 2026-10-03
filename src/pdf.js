import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { downloadPdf } from "./pdfSource.js";
export { looksLikePdf } from "./pdfSource.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractPdfText(source, onProgress = () => {}) {
  onProgress("Đang tải PDF…");
  const bytes = typeof source === "string" ? await downloadPdf(source) : source;

  onProgress("Đang đọc nội dung PDF…");

  const loadingTask = pdfjsLib.getDocument({
    data: bytes
  });

  try {
    const pdf = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Đang đọc PDF: trang ${pageNumber}/${pdf.numPages}…`);

      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();

      let pageText = "";

      for (const item of textContent.items) {
        if (!("str" in item)) continue;

        pageText += item.str;

        if (item.hasEOL) {
          pageText += "\n";
        } else {
          pageText += " ";
        }
      }

      pages.push(`\n--- PAGE ${pageNumber} ---\n${pageText.trim()}`);
      page.cleanup();
    }

    const text = pages.join("\n");

    if (text.replace(/\s/g, "").length < 500) {
      throw new Error(
        "PDF gần như không có text layer. Có thể đây là PDF scan/image; bản MVP này chưa có OCR."
      );
    }

    return {
      title: "",
      text,
      pageCount: pdf.numPages,
      sourceType: "pdf"
    };
  } finally {
    await loadingTask.destroy();
  }
}
