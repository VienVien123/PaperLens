export async function extractHtmlText(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const pdfUrls = [];
      const addPdfUrl = (value) => {
        if (!value) return;
        try {
          const url = new URL(value, document.baseURI);
          if (["http:", "https:", "file:"].includes(url.protocol)) {
            pdfUrls.push(url.href);
          }
        } catch { /* Ignore invalid publisher metadata. */ }
      };
      document.querySelectorAll('meta[name="citation_pdf_url"], meta[name="wkhealth_pdf_url"]').forEach((node) => addPdfUrl(node.content));
      document.querySelectorAll('link[type="application/pdf"], a[type="application/pdf"]').forEach((node) => addPdfUrl(node.href));
      document.querySelectorAll("embed, object, iframe").forEach((node) => {
        const src = node.getAttribute("src") || node.getAttribute("data");
        if (node.type === "application/pdf" || /(?:\.pdf(?:$|[?#])|\/(?:_pdf|pdf|epdf)(?:$|[/?#]))/i.test(src || "")) {
          addPdfUrl(src);
        }
      });
      const removeSelectors = [
        "script",
        "style",
        "noscript",
        "nav",
        "header",
        "footer",
        "aside",
        "form",
        "button",
        "[role='navigation']",
        "[aria-hidden='true']",
        ".sidebar",
        ".navigation",
        ".nav",
        ".cookie",
        ".cookies",
        ".advertisement",
        ".ads"
      ];

      const preferredSelectors = [
        "article",
        "main",
        ".ltx_document",
        "#content",
        ".article",
        ".paper",
        ".document"
      ];

      let root = null;

      for (const selector of preferredSelectors) {
        const candidate = document.querySelector(selector);
        if (candidate && candidate.innerText && candidate.innerText.length > 2000) {
          root = candidate;
          break;
        }
      }

      if (!root) root = document.body || document.documentElement;

      const clone = root.cloneNode(true);

      for (const selector of removeSelectors) {
        clone.querySelectorAll?.(selector).forEach((node) => node.remove());
      }

      const text = (clone.innerText || clone.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();

      const metaTitle =
        document.querySelector('meta[name="citation_title"]')?.content ||
        document.querySelector('meta[property="og:title"]')?.content ||
        "";

      return {
        title: metaTitle || document.title || "",
        text,
        contentType: document.contentType || "",
        pdfUrls: [...new Set(pdfUrls)],
        sourceType: "html"
      };
    }
  });

  const value = results?.[0]?.result;

  if (!value) {
    throw new Error("Không lấy được nội dung text từ trang hiện tại.");
  }

  return value;
}
