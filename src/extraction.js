import { extractHtmlText } from "./page.js";
import { downloadPdf, looksLikePdf } from "./pdfSource.js";

const parsePdf = async (bytes, onProgress) => {
  const { extractPdfText } = await import("./pdf.js");
  return extractPdfText(bytes, onProgress);
};

export async function extractPaper(tab, onProgress = () => {}, {
  readHtml = extractHtmlText,
  readPdf = parsePdf,
  download = downloadPdf
} = {}) {
  if (/scholar\.google\./i.test(new URL(tab.url).hostname)) {
    throw new Error("Bạn đang ở trang kết quả Google Scholar. Hãy mở paper hoặc link PDF trước.");
  }

  const readPdfUrl = async (url, optional = false) => {
    onProgress("Đang tải PDF…");
    const bytes = await download(url, { optional });
    return bytes ? readPdf(bytes, onProgress) : null;
  };

  const pdfUrlHint = looksLikePdf(tab.url);
  if (pdfUrlHint) {
    // Some /pdf and /epdf endpoints serve an HTML viewer containing the
    // actual PDF URL. Only bypass that viewer when the bytes are really PDF.
    const pdf = await readPdfUrl(tab.url, true);
    if (pdf) return pdf;
  }

  let html;
  let htmlError;
  try {
    html = await readHtml(tab.id);
  } catch (error) {
    // Browser PDF viewers can refuse script injection even for public PDFs.
    htmlError = error;
  }

  if (html?.contentType?.toLowerCase().startsWith("application/pdf")) {
    return readPdfUrl(tab.url);
  }
  if (html?.text?.length >= 1500) return html;

  let pdfError = pdfUrlHint
    ? new Error("URL trả về trang HTML thay vì PDF và không tìm thấy bản PDF nhúng đọc được. Hãy mở PDF trực tiếp hoặc kiểm tra đăng nhập/quyền truy cập.")
    : null;
  for (const url of new Set([...(html?.pdfUrls || []), tab.url])) {
    if (pdfUrlHint && url === tab.url) continue;
    try {
      const pdf = await readPdfUrl(url, url === tab.url);
      if (pdf) return pdf;
    } catch (error) {
      pdfError = error;
    }
  }
  if (pdfError) throw pdfError;
  if (htmlError) throw htmlError;
  throw new Error("Nội dung lấy được quá ít và không tìm thấy bản PDF đọc được. Hãy mở bản toàn văn/PDF trực tiếp hoặc kiểm tra quyền truy cập trên trang gốc.");
}
