export function looksLikePdf(value = "") {
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname).toLowerCase();
    return /\.pdf(?:\/|$)/.test(path) ||
      /\/(?:_pdf|pdf|epdf)(?:\/|$)/.test(path) ||
      [...url.searchParams].some(([key, value]) =>
        /^(?:download|format|type|output)$/i.test(key) && /^pdf$/i.test(value)
      );
  } catch {
    return false;
  }
}

export function hasPdfHeader(bytes) {
  // PDF readers allow a small amount of leading data before the header.
  return new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-");
}

export async function downloadPdf(url, { optional = false } = {}) {
  if (!/^(https?:|file:)/i.test(url)) {
    if (optional) return null;
    throw new Error("Hãy mở URL PDF gốc (http/https hoặc file), thay vì URL blob của trình xem PDF.");
  }

  const response = await fetch(url, {
    credentials: "include",
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Không tải được PDF (HTTP ${response.status}). Hãy kiểm tra quyền truy cập hoặc đăng nhập trên trang gốc.`);
  }

  // Read the signature as well as headers: download endpoints may use
  // application/octet-stream, while login pages may be returned with HTTP 200.
  const reader = response.body?.getReader();
  const chunks = [];
  let length = 0;
  if (reader) {
    try {
      let done = false;
      while (!done && length < 1024) {
        const next = await reader.read();
        done = next.done;
        if (next.value) {
          chunks.push(next.value);
          length += next.value.length;
        }
      }
      const prefix = new Uint8Array(Math.min(length, 1024));
      let offset = 0;
      for (const chunk of chunks) {
        const part = chunk.subarray(0, prefix.length - offset);
        prefix.set(part, offset);
        offset += part.length;
        if (offset === prefix.length) break;
      }
      if (!hasPdfHeader(prefix)) {
        await reader.cancel();
        if (optional) return null;
        throw new Error("URL trả về trang HTML hoặc dữ liệu không phải PDF. Hãy mở bản PDF trực tiếp và kiểm tra đăng nhập/quyền truy cập.");
      }
      while (!done) {
        const next = await reader.read();
        done = next.done;
        if (next.value) {
          chunks.push(next.value);
          length += next.value.length;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (!hasPdfHeader(bytes)) {
    if (optional) return null;
    throw new Error("PDF rỗng hoặc không tải được nội dung.");
  }
  return bytes;
}
