const MAX_INPUT_CHARS = 110_000;

function normalizeText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00ad/g, "")
    .replace(/([a-zA-Z])-\n([a-zA-Z])/g, "$1$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function removeReferencesTail(text) {
  const patterns = [
    /\n\s*(?:\d+(?:\.\d+)*)?\s*references\s*\n/i,
    /\n\s*(?:\d+(?:\.\d+)*)?\s*bibliography\s*\n/i
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match.index > text.length * 0.45) {
      return text.slice(0, match.index).trim();
    }
  }

  return text;
}

function sampleAcrossDocument(text, maxChars) {
  const introSize = Math.floor(maxChars * 0.24);
  const endSize = Math.floor(maxChars * 0.18);
  const middleBudget = maxChars - introSize - endSize;

  const chunks = 4;
  const each = Math.floor(middleBudget / chunks);

  const parts = [
    text.slice(0, introSize),
    "\n\n[... phần giữa paper được lấy mẫu ...]\n\n"
  ];

  const usableStart = introSize;
  const usableEnd = Math.max(usableStart + 1, text.length - endSize);
  const usableLength = usableEnd - usableStart;

  for (let i = 0; i < chunks; i += 1) {
    const center = usableStart + Math.floor(((i + 0.5) / chunks) * usableLength);
    const start = Math.max(usableStart, center - Math.floor(each / 2));
    parts.push(text.slice(start, start + each));
    parts.push("\n\n--- DOCUMENT SAMPLE ---\n\n");
  }

  parts.push(text.slice(-endSize));

  return parts.join("").slice(0, maxChars);
}

function trySectionAwareExcerpt(text, maxChars) {
  const lines = text.split("\n");
  const headings = [];

  const headingRegex =
    /^\s*(?:\d+(?:\.\d+)*[\s.:)-]*)?(abstract|introduction|background|related work|method|methods|methodology|approach|model|architecture|proposed method|experiments?|experimental setup|evaluation|results?|discussion|limitations?|conclusion|conclusions|future work)\s*[:.]?\s*$/i;

  let cursor = 0;

  for (const line of lines) {
    const start = cursor;
    const match = line.trim().match(headingRegex);

    if (match) {
      headings.push({
        label: match[1].toLowerCase(),
        start
      });
    }

    cursor += line.length + 1;
  }

  if (headings.length < 3) return null;

  const groups = {
    abstract: 11_000,
    introduction: 14_000,
    background: 8_000,
    "related work": 6_000,
    method: 24_000,
    methods: 24_000,
    methodology: 24_000,
    approach: 24_000,
    model: 22_000,
    architecture: 22_000,
    "proposed method": 24_000,
    experiment: 19_000,
    experiments: 19_000,
    "experimental setup": 18_000,
    evaluation: 18_000,
    result: 20_000,
    results: 20_000,
    discussion: 14_000,
    limitation: 9_000,
    limitations: 9_000,
    conclusion: 11_000,
    conclusions: 11_000,
    "future work": 7_000
  };

  const picked = [];
  const seenFamilies = new Set();

  picked.push(text.slice(0, 7_000));

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    const nextStart = headings[i + 1]?.start ?? text.length;
    const segment = text.slice(current.start, nextStart).trim();

    let family = current.label;

    if (["method", "methods", "methodology", "approach", "model", "architecture", "proposed method"].includes(family)) {
      family = "method-family";
    } else if (["experiment", "experiments", "experimental setup", "evaluation"].includes(family)) {
      family = "experiment-family";
    } else if (["result", "results", "discussion"].includes(family)) {
      family = "results-family";
    } else if (["conclusion", "conclusions", "future work"].includes(family)) {
      family = "conclusion-family";
    }

    const limit = groups[current.label] || 10_000;

    if (seenFamilies.has(family) && segment.length > limit / 2) {
      picked.push(segment.slice(0, Math.floor(limit / 2)));
    } else {
      picked.push(segment.slice(0, limit));
      seenFamilies.add(family);
    }
  }

  const combined = picked.join("\n\n--- SECTION ---\n\n");

  if (combined.length < Math.min(35_000, text.length * 0.35)) {
    return null;
  }

  return combined.slice(0, maxChars);
}

export function buildPaperExcerpt(rawText) {
  let text = normalizeText(rawText);
  text = removeReferencesTail(text);

  if (text.length <= MAX_INPUT_CHARS) {
    return {
      text,
      originalChars: rawText.length,
      sentChars: text.length,
      truncated: false
    };
  }

  const sectionAware = trySectionAwareExcerpt(text, MAX_INPUT_CHARS);
  const excerpt = sectionAware || sampleAcrossDocument(text, MAX_INPUT_CHARS);

  return {
    text: excerpt,
    originalChars: rawText.length,
    sentChars: excerpt.length,
    truncated: true
  };
}
