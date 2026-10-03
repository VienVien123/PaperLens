import "./styles.css";

import { extractPaper } from "./extraction.js";

import {
  buildPaperExcerpt
} from "./paperProcessing.js";

const $ = (id) =>
  document.getElementById(id);

const els = {
  settingsButton: $("settingsButton"),
  settingsDialog: $("settingsDialog"),
  apiKeyInput: $("apiKeyInput"),
  modelInput: $("modelInput"),
  saveSettingsButton: $("saveSettingsButton"),

  analyzeButton: $("analyzeButton"),
  analyzeButtonText: $("analyzeButtonText"),
  forceAnalyzeButton: $("forceAnalyzeButton"),

  currentPage: $("currentPage"),
  status: $("status"),
  emptyState: $("emptyState"),
  result: $("result"),

  paperTitle: $("paperTitle"),
  paperAuthors: $("paperAuthors"),
  paperField: $("paperField"),

  problem: $("problem"),
  mainIdea: $("mainIdea"),
  methods: $("methods"),
  datasets: $("datasets"),
  resultsList: $("resultsList"),
  limitations: $("limitations"),
  contributions: $("contributions"),
  simpleExplanation: $("simpleExplanation"),

  sourceLink: $("sourceLink"),

  toggleQaButton: $("toggleQaButton"),
  qaPanel: $("qaPanel"),
  qaChevron: $("qaChevron"),
  qaMessages: $("qaMessages"),
  questionInput: $("questionInput"),
  askButton: $("askButton"),
  qaStatus: $("qaStatus")
};

let activeTab = null;
let isWorking = false;
let isAsking = false;

let currentPaperContext = null;
let qaHistory = [];

init().catch((error) => {
  console.error(error);

  showStatus(
    error?.message ||
      "Không thể khởi tạo extension.",
    "error"
  );
});

async function init() {
  activeTab = await getActiveTab();

  if (activeTab?.url) {
    els.currentPage.textContent =
      activeTab.title ||
      activeTab.url;
  } else {
    els.currentPage.textContent =
      "Không đọc được tab hiện tại.";
  }

  const settings =
    await chrome.storage.local.get([
      "geminiApiKey",
      "geminiModel",
      "paperCache"
    ]);

  els.apiKeyInput.value =
    settings.geminiApiKey || "";

  els.modelInput.value =
    settings.geminiModel || "";

  const cached =
    activeTab?.url
      ? settings.paperCache?.[activeTab.url]
      : null;

  if (cached?.analysis) {
    renderAnalysis(
      cached.analysis,
      activeTab.url
    );

    showStatus(
      "Đã tải kết quả được lưu trên máy.",
      "success"
    );

    els.forceAnalyzeButton.classList.remove(
      "hidden"
    );

    els.analyzeButtonText.textContent =
      "Dùng kết quả đã lưu";
  }

  if (cached?.paperContext?.paperText) {
    currentPaperContext =
      cached.paperContext;

    enableQA();
  } else {
    disableQA(
      cached?.analysis
        ? "Kết quả cache này chưa có dữ liệu Q&A. Hãy bấm “Phân tích lại bằng Gemini” một lần."
        : "Hãy phân tích paper trước."
    );
  }

  if (!settings.geminiApiKey) {
    showStatus(
      "Chưa có Gemini API Key. Bấm ⚙️ để nhập API Key."
    );
  }
}


// ============================================================
// SETTINGS
// ============================================================

els.settingsButton.addEventListener(
  "click",
  async () => {
    const settings =
      await chrome.storage.local.get([
        "geminiApiKey",
        "geminiModel"
      ]);

    els.apiKeyInput.value =
      settings.geminiApiKey || "";

    els.modelInput.value =
      settings.geminiModel || "";

    els.settingsDialog.showModal();
  }
);


els.saveSettingsButton.addEventListener(
  "click",
  async (event) => {
    event.preventDefault();

    const apiKey =
      els.apiKeyInput.value.trim();

    const model =
      els.modelInput.value.trim();

    if (!apiKey) {
      showStatus(
        "Bạn chưa nhập Gemini API Key.",
        "error"
      );

      return;
    }

    if (!model) {
      showStatus(
        "Bạn chưa nhập tên Gemini model.",
        "error"
      );

      return;
    }

    await chrome.storage.local.set({
      geminiApiKey: apiKey,
      geminiModel: model
    });

    els.settingsDialog.close();

    showStatus(
      `Đã lưu model ${model}.`,
      "success"
    );
  }
);


// ============================================================
// ANALYZE
// ============================================================

els.analyzeButton.addEventListener(
  "click",
  () => analyzeCurrentPaper(false)
);


els.forceAnalyzeButton.addEventListener(
  "click",
  () => analyzeCurrentPaper(true)
);


async function analyzeCurrentPaper(force) {
  if (isWorking) {
    return;
  }

  activeTab =
    await getActiveTab();

  if (
    !activeTab?.id ||
    !activeTab?.url
  ) {
    showStatus(
      "Không đọc được tab hiện tại.",
      "error"
    );

    return;
  }

  const {
    geminiApiKey,
    geminiModel,
    paperCache
  } =
    await chrome.storage.local.get([
      "geminiApiKey",
      "geminiModel",
      "paperCache"
    ]);

  if (!geminiApiKey) {
    showStatus(
      "Bạn chưa nhập Gemini API Key.",
      "error"
    );

    els.settingsDialog.showModal();
    return;
  }

  if (!geminiModel?.trim()) {
    showStatus(
      "Bạn chưa chọn Gemini model. Mở ⚙️ Settings.",
      "error"
    );

    els.settingsDialog.showModal();
    return;
  }

  // Dùng cache nếu user không yêu cầu phân tích lại.
  if (
    !force &&
    paperCache?.[activeTab.url]?.analysis
  ) {
    const cached =
      paperCache[activeTab.url];

    renderAnalysis(
      cached.analysis,
      activeTab.url
    );

    if (cached?.paperContext?.paperText) {
      currentPaperContext =
        cached.paperContext;

      enableQA();
    }

    showStatus(
      "Đang dùng kết quả đã lưu. Bấm “Phân tích lại bằng Gemini” nếu muốn gọi AI lại.",
      "success"
    );

    return;
  }

  const blockedPrefixes = [
    "chrome://",
    "edge://",
    "about:",
    "chrome-extension://"
  ];

  if (
    blockedPrefixes.some(
      (prefix) =>
        activeTab.url.startsWith(prefix)
    )
  ) {
    showStatus(
      "Extension không thể đọc trang hệ thống của trình duyệt.",
      "error"
    );

    return;
  }

  try {
    setWorking(true);

    showStatus(
      "Đang lấy nội dung paper…"
    );

    const extracted = await extractPaper(
      activeTab,
      (message) => showStatus(message)
    );

    if (
      !extracted?.text ||
      extracted.text.length < 1500
    ) {
      throw new Error(
        "Nội dung lấy được quá ít. Hãy thử mở bản PDF hoặc arXiv HTML."
      );
    }

    // ========================================================
    // SUMMARY CONTEXT
    // Dùng bản đã clean/chọn section như phiên bản ban đầu.
    // ========================================================

    showStatus(
      "Đang chuẩn bị nội dung summary…"
    );

    const excerpt =
      buildPaperExcerpt(
        extracted.text
      );

    const summaryContext = {
      paperText:
        excerpt.text,

      pageTitle:
        extracted.title ||
        activeTab.title ||
        "",

      sourceUrl:
        activeTab.url,

      sourceType:
        extracted.sourceType ||
        "html",

      truncated:
        excerpt.truncated
    };


    // ========================================================
    // Q&A CONTEXT
    // Giữ text paper đầy đủ, không dùng excerpt summary.
    // ========================================================

    currentPaperContext = {
      paperText:
        extracted.text,

      pageTitle:
        extracted.title ||
        activeTab.title ||
        "",

      sourceUrl:
        activeTab.url,

      sourceType:
        extracted.sourceType ||
        "html"
    };

    showStatus(
      excerpt.truncated
        ? "Paper dài. Đang phân tích các phần quan trọng…"
        : "Gemini đang phân tích paper…"
    );

    const response =
      await chrome.runtime.sendMessage({
        type:
          "ANALYZE_PAPER",

        payload:
          summaryContext
      });

    if (!response?.ok) {
      throw new Error(
        response?.error ||
        "Gemini API trả về lỗi."
      );
    }

    const analysis =
      response.analysis;

    renderAnalysis(
      analysis,
      activeTab.url
    );

    await saveToCache(
      activeTab.url,
      analysis,
      currentPaperContext
    );

    // Mỗi lần phân tích lại paper thì reset Q&A.
    qaHistory = [];
    els.qaMessages.replaceChildren();

    enableQA();

    els.forceAnalyzeButton.classList.remove(
      "hidden"
    );

    els.analyzeButtonText.textContent =
      "Dùng kết quả đã lưu";

    showStatus(
      "Phân tích hoàn tất.",
      "success"
    );
  }

  catch (error) {
    console.error(error);

    showStatus(
      error?.message ||
      String(error),
      "error"
    );
  }

  finally {
    setWorking(false);
  }
}


// ============================================================
// Q&A PANEL
// ============================================================

els.toggleQaButton.addEventListener(
  "click",
  () => {
    const isHidden =
      els.qaPanel.classList.contains(
        "hidden"
      );

    if (isHidden) {
      els.qaPanel.classList.remove(
        "hidden"
      );

      els.qaChevron.textContent =
        "⌃";

      setTimeout(() => {
        els.questionInput.focus();
      }, 50);
    } else {
      els.qaPanel.classList.add(
        "hidden"
      );

      els.qaChevron.textContent =
        "⌄";
    }
  }
);


els.askButton.addEventListener(
  "click",
  () => askCurrentPaper()
);


els.questionInput.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      askCurrentPaper();
    }
  }
);


async function askCurrentPaper() {
  if (isAsking) {
    return;
  }

  const question =
    els.questionInput.value.trim();

  if (!question) {
    showQAStatus(
      "Hãy nhập câu hỏi.",
      "error"
    );

    return;
  }

  if (
    !currentPaperContext?.paperText
  ) {
    showQAStatus(
      "Chưa có dữ liệu paper cho Q&A. Hãy phân tích lại paper.",
      "error"
    );

    return;
  }

  const {
    geminiApiKey,
    geminiModel
  } =
    await chrome.storage.local.get([
      "geminiApiKey",
      "geminiModel"
    ]);

  if (
    !geminiApiKey ||
    !geminiModel?.trim()
  ) {
    showQAStatus(
      "Hãy kiểm tra API Key và model trong Settings.",
      "error"
    );

    return;
  }

  // Chỉ gửi vài turn gần nhất để follow-up được,
  // tránh history phình quá lớn.
  const recentHistory =
    qaHistory.slice(-6);

  appendMessage(
    "user",
    question
  );

  qaHistory.push({
    role: "user",
    text: question
  });

  els.questionInput.value = "";

  try {
    setAsking(true);

    showQAStatus(
      "Gemini đang đọc paper để trả lời…"
    );

    const response =
      await chrome.runtime.sendMessage({
        type:
          "ASK_PAPER",

        payload: {
          ...currentPaperContext,
          question,
          history:
            recentHistory
        }
      });

    if (!response?.ok) {
      throw new Error(
        response?.error ||
        "Không nhận được câu trả lời."
      );
    }

    const answer =
      response.answer;

    appendMessage(
      "assistant",
      answer
    );

    qaHistory.push({
      role:
        "assistant",

      text:
        answer
    });

    hideQAStatus();
  }

  catch (error) {
    console.error(error);

    showQAStatus(
      error?.message ||
      "Không thể trả lời.",
      "error"
    );
  }

  finally {
    setAsking(false);
  }
}


// ============================================================
// Q&A UI
// ============================================================

function appendMessage(
  role,
  text
) {
  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    `qa-message ${
      role === "user"
        ? "qa-user"
        : "qa-assistant"
    }`;

  const label =
    document.createElement(
      "div"
    );

  label.className =
    "qa-message-label";

  label.textContent =
    role === "user"
      ? "Bạn"
      : "AI Paper Reader";

  const content =
    document.createElement(
      "div"
    );

  content.className =
    "qa-message-content";

  content.textContent =
    text;

  wrapper.append(
    label,
    content
  );

  els.qaMessages.appendChild(
    wrapper
  );

  els.qaMessages.scrollTop =
    els.qaMessages.scrollHeight;
}


function enableQA() {
  els.questionInput.disabled =
    false;

  els.askButton.disabled =
    false;

  hideQAStatus();
}


function disableQA(message) {
  els.questionInput.disabled =
    true;

  els.askButton.disabled =
    true;

  showQAStatus(
    message
  );
}


function showQAStatus(
  message,
  kind = ""
) {
  els.qaStatus.textContent =
    message;

  els.qaStatus.classList.remove(
    "hidden",
    "error"
  );

  if (kind === "error") {
    els.qaStatus.classList.add(
      "error"
    );
  }
}


function hideQAStatus() {
  els.qaStatus.classList.add(
    "hidden"
  );
}


function setAsking(value) {
  isAsking =
    value;

  els.askButton.disabled =
    value;

  els.questionInput.disabled =
    value;

  els.askButton.textContent =
    value
      ? "Đang trả lời…"
      : "Gửi câu hỏi";
}


// ============================================================
// GENERAL UI
// ============================================================

async function getActiveTab() {
  const tabs =
    await chrome.tabs.query({
      active:
        true,

      currentWindow:
        true
    });

  return tabs?.[0] || null;
}


function setWorking(value) {
  isWorking =
    value;

  els.analyzeButton.disabled =
    value;

  els.forceAnalyzeButton.disabled =
    value;

  if (value) {
    els.analyzeButtonText.textContent =
      "Đang phân tích…";
  } else if (
    !els.result.classList.contains(
      "hidden"
    )
  ) {
    els.analyzeButtonText.textContent =
      "Dùng kết quả đã lưu";
  } else {
    els.analyzeButtonText.textContent =
      "Phân tích paper hiện tại";
  }
}


function showStatus(
  message,
  kind = ""
) {
  els.status.textContent =
    message;

  els.status.classList.remove(
    "hidden",
    "error",
    "success"
  );

  if (kind) {
    els.status.classList.add(
      kind
    );
  }
}


function renderAnalysis(
  data,
  sourceUrl
) {
  els.emptyState.classList.add(
    "hidden"
  );

  els.result.classList.remove(
    "hidden"
  );

  els.paperTitle.textContent =
    data?.title ||
    "Không xác định";

  els.paperAuthors.textContent =
    Array.isArray(data?.authors) &&
    data.authors.length
      ? data.authors.join(", ")
      : "Không tìm thấy";

  els.paperField.textContent =
    data?.field ||
    "Không xác định";

  els.problem.textContent =
    data?.problem ||
    "Không tìm thấy thông tin rõ ràng.";

  els.mainIdea.textContent =
    data?.mainIdea ||
    "Không tìm thấy thông tin rõ ràng.";

  els.simpleExplanation.textContent =
    data?.simpleExplanation ||
    "Không tìm thấy thông tin rõ ràng.";

  renderList(
    els.methods,
    data?.methods
  );

  renderList(
    els.datasets,
    data?.datasets
  );

  renderList(
    els.resultsList,
    data?.results
  );

  renderList(
    els.limitations,
    data?.limitations
  );

  renderList(
    els.contributions,
    data?.contributions
  );

  if (sourceUrl) {
    els.sourceLink.href =
      sourceUrl;

    els.sourceLink.textContent =
      "Mở paper gốc";
  }
}


function renderList(
  container,
  items
) {
  container.replaceChildren();

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    const p =
      document.createElement(
        "p"
      );

    p.className =
      "muted";

    p.textContent =
      "Không tìm thấy thông tin rõ ràng trong paper.";

    container.appendChild(
      p
    );

    return;
  }

  const ul =
    document.createElement(
      "ul"
    );

  ul.className =
    "section-list";

  for (const item of items) {
    if (
      typeof item !== "string" ||
      !item.trim()
    ) {
      continue;
    }

    const li =
      document.createElement(
        "li"
      );

    li.textContent =
      item.trim();

    ul.appendChild(
      li
    );
  }

  if (!ul.children.length) {
    const p =
      document.createElement(
        "p"
      );

    p.className =
      "muted";

    p.textContent =
      "Không tìm thấy thông tin rõ ràng trong paper.";

    container.appendChild(
      p
    );

    return;
  }

  container.appendChild(
    ul
  );
}


// ============================================================
// CACHE
// ============================================================

async function saveToCache(
  url,
  analysis,
  paperContext
) {
  if (!url) {
    return;
  }

  const {
    paperCache = {}
  } =
    await chrome.storage.local.get(
      "paperCache"
    );

  paperCache[url] = {
    analysis,
    paperContext,
    savedAt:
      Date.now()
  };

  // Vì bây giờ cache có cả paper text,
  // chỉ giữ 8 paper gần nhất để tránh storage phình quá lớn.
  const entries =
    Object.entries(
      paperCache
    )
      .sort(
        (a, b) =>
          (b[1]?.savedAt || 0) -
          (a[1]?.savedAt || 0)
      );

  const trimmed =
    Object.fromEntries(
      entries.slice(0, 8)
    );

  await chrome.storage.local.set({
    paperCache:
      trimmed
  });
}
