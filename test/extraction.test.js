import test from "node:test";
import assert from "node:assert/strict";
import { looksLikePdf, downloadPdf } from "../src/pdfSource.js";
import { extractPaper } from "../src/extraction.js";
import { extractHtmlText } from "../src/page.js";

const jstage = "https://www.jstage.jst.go.jp/article/transinf/E106.D/10/E106.D_2023EDP7017/_pdf";
const pdfBytes = new TextEncoder().encode("%PDF-1.7\n" + "data".repeat(400));
const pdfText = { text: "paper content ".repeat(200), sourceType: "pdf" };

test("recognizes publisher endpoints, PDF fragments and query formats", () => {
  for (const url of [jstage, jstage + "#page=2", jstage + "/?download=1",
    "https://arxiv.org/pdf/1706.03762", "https://example.org/paper.PDF#page=2",
    "https://example.org/doi/epdf/10.1234/paper", "https://example.org/get?id=1&format=pdf",
    "file:///C:/papers/paper.pdf"]) {
    assert.equal(looksLikePdf(url), true, url);
  }
  for (const url of ["https://example.org/paper", "https://example.org/pdf-tools",
    "https://example.org/?next=paper.pdf", "invalid", ""]) {
    assert.equal(looksLikePdf(url), false, url);
  }
});

test("J-STAGE PDF bypasses HTML extraction", async () => {
  const result = await extractPaper({ id: 1, url: jstage }, () => {}, {
    readHtml: () => assert.fail("must not inspect browser PDF viewer as HTML"),
    download: async (url) => { assert.equal(url, jstage); return pdfBytes; },
    readPdf: async (bytes) => { assert.equal(bytes, pdfBytes); return pdfText; }
  });
  assert.equal(result, pdfText);
});

test("normal HTML papers do not trigger an extra download", async () => {
  const html = { text: "HTML paper ".repeat(200), sourceType: "html" };
  assert.equal(await extractPaper({ id: 1, url: "https://example.org/article" }, () => {}, {
    readHtml: async () => html,
    download: () => assert.fail("unnecessary fetch")
  }), html);
});

test("PDF-looking URLs serving HTML viewers resolve their embedded PDF", async () => {
  const viewer = "https://example.org/doi/epdf/10.1234/paper";
  const visited = [];
  assert.equal(await extractPaper({ id: 1, url: viewer }, () => {}, {
    readHtml: async () => ({ text: "PDF viewer", pdfUrls: [jstage] }),
    download: async (url) => { visited.push(url); return url === viewer ? null : pdfBytes; },
    readPdf: async () => pdfText
  }), pdfText);
  assert.deepEqual(visited, [viewer, jstage]);
});

test("uses the actual PDF MIME type even when the viewer contains lots of UI text", async () => {
  assert.equal(await extractPaper({ id: 1, url: "https://example.org/download?id=1" }, () => {}, {
    readHtml: async () => ({ text: "viewer toolbar ".repeat(200), contentType: "application/pdf" }),
    download: async () => pdfBytes,
    readPdf: async () => pdfText
  }), pdfText);
});

test("falls back to document bytes when injection into a PDF viewer is denied", async () => {
  assert.equal(await extractPaper({ id: 1, url: "https://example.org/download?id=1" }, () => {}, {
    readHtml: async () => { throw new Error("Cannot access contents of the page"); },
    download: async (_url, options) => { assert.equal(options.optional, true); return pdfBytes; },
    readPdf: async () => pdfText
  }), pdfText);
});

test("tries metadata/embedded PDF alternatives before reporting short content", async () => {
  const visited = [];
  assert.equal(await extractPaper({ id: 1, url: "https://example.org/article" }, () => {}, {
    readHtml: async () => ({ text: "Abstract", pdfUrls: ["https://example.org/old.pdf", jstage, jstage] }),
    download: async (url) => {
      visited.push(url);
      if (url.endsWith("old.pdf")) throw new Error("HTTP 404");
      return pdfBytes;
    },
    readPdf: async () => pdfText
  }), pdfText);
  assert.deepEqual(visited, ["https://example.org/old.pdf", jstage]);
});

test("retains a useful PDF error when linked files cannot be read", async () => {
  await assert.rejects(extractPaper({ id: 1, url: "https://example.org/article" }, () => {}, {
    readHtml: async () => ({ text: "Abstract", pdfUrls: [jstage] }),
    download: async (url) => url === jstage ? pdfBytes : null,
    readPdf: async () => { throw new Error("PDF scan/image; chưa có OCR"); }
  }), /OCR/);
});

test("short HTML without a PDF still fails instead of analyzing empty content", async () => {
  await assert.rejects(extractPaper({ id: 1, url: "https://example.org/article" }, () => {}, {
    readHtml: async () => ({ text: "Abstract" }), download: async () => null
  }), /Nội dung lấy được quá ít/);
});

test("accepts a PDF signature with generic download headers and preserves bytes", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.credentials, "include");
    return new Response(pdfBytes, { headers: { "Content-Type": "application/octet-stream" } });
  });
  assert.deepEqual(await downloadPdf(jstage), pdfBytes);
});

test("handles a PDF header split across streamed chunks", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(pdfBytes.slice(0, 3));
      controller.enqueue(pdfBytes.slice(3, 1100));
      controller.enqueue(pdfBytes.slice(1100));
      controller.close();
    }
  })));
  assert.deepEqual(await downloadPdf(jstage), pdfBytes);
});

test("rejects HTTP 200 login HTML even when server claims it is PDF", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Log in</html>", {
    headers: { "Content-Type": "application/pdf" }
  }));
  await assert.rejects(downloadPdf(jstage), /không phải PDF/);
  assert.equal(await downloadPdf(jstage, { optional: true }), null);
});

test("cancels non-PDF streams without downloading the entire HTML page", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("<html>" + "x".repeat(1024))); },
    cancel() { cancelled = true; }
  })));
  assert.equal(await downloadPdf(jstage, { optional: true }), null);
  assert.equal(cancelled, true);
});

test("preserves publisher HTTP failures", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("Forbidden", { status: 403 }));
  await assert.rejects(downloadPdf(jstage), /HTTP 403/);
});

test("rejects unsupported blob URLs with actionable feedback", async () => {
  await assert.rejects(downloadPdf("blob:https://example.org/123"), /URL PDF gốc/);
});

test("HTML extraction exposes PDF metadata even when there is no body text", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => {
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else delete globalThis.chrome;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
  });
  globalThis.chrome = { scripting: { executeScript: async ({ func }) => [{ result: func() }] } };
  globalThis.document = {
    baseURI: "https://example.org/article/123", title: "Paper", contentType: "text/html",
    querySelector: () => null,
    querySelectorAll: (selector) => selector.startsWith("meta[") ? [{ content: "/download/123" }] : [],
    body: { cloneNode: () => ({ textContent: "", querySelectorAll: () => [] }) }
  };
  const result = await extractHtmlText(1);
  assert.equal(result.text, "");
  assert.deepEqual(result.pdfUrls, ["https://example.org/download/123"]);
});
