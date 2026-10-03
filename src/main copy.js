// ============================================================
// AI PAPER READER
// src/main.js
// ============================================================

import "./styles.css";

import {
  extractPdfText,
  looksLikePdf
} from "./pdf.js";

import {
  extractHtmlText
} from "./page.js";

import {
  buildPaperExcerpt
} from "./paperProcessing.js";


// ============================================================
// HELPER
// ============================================================

const $ = (id) =>
  document.getElementById(id);


// ============================================================
// DOM
// ============================================================

const els = {
  settingsButton:
    $("settingsButton"),

  settingsDialog:
    $("settingsDialog"),

  apiKeyInput:
    $("apiKeyInput"),

  modelInput:
    $("modelInput"),

  saveSettingsButton:
    $("saveSettingsButton"),

  analyzeButton:
    $("analyzeButton"),

  analyzeButtonText:
    $("analyzeButtonText"),

  forceAnalyzeButton:
    $("forceAnalyzeButton"),

  currentPage:
    $("currentPage"),

  status:
    $("status"),

  emptyState:
    $("emptyState"),

  result:
    $("result"),

  paperTitle:
    $("paperTitle"),

  paperAuthors:
    $("paperAuthors"),

  paperField:
    $("paperField"),

  problem:
    $("problem"),

  mainIdea:
    $("mainIdea"),

  methods:
    $("methods"),

  datasets:
    $("datasets"),

  resultsList:
    $("resultsList"),

  limitations:
    $("limitations"),

  contributions:
    $("contributions"),

  simpleExplanation:
    $("simpleExplanation"),

  sourceLink:
    $("sourceLink")
};


// ============================================================
// STATE
// ============================================================

let activeTab = null;

let isWorking = false;


// ============================================================
// INIT
// ============================================================

init().catch((error) => {
  console.error(error);

  showStatus(
    error?.message ||
      "Không thể khởi tạo extension.",
    "error"
  );
});


async function init() {
  // ----------------------------------------------------------
  // Active tab
  // ----------------------------------------------------------

  activeTab =
    await getActiveTab();


  // ----------------------------------------------------------
  // Show page
  // ----------------------------------------------------------

  if (activeTab?.url) {
    els.currentPage.textContent =
      activeTab.title ||
      activeTab.url;
  } else {
    els.currentPage.textContent =
      "Không đọc được tab hiện tại.";
  }


  // ----------------------------------------------------------
  // Storage
  // ----------------------------------------------------------

  const settings =
    await chrome.storage.local.get([
      "geminiApiKey",
      "geminiModel",
      "paperCache"
    ]);


  // ----------------------------------------------------------
  // Settings UI
  // ----------------------------------------------------------

  els.apiKeyInput.value =
    settings.geminiApiKey || "";

  els.modelInput.value =
    settings.geminiModel ||
    "gemini-3.1-pro-preview";


  // ----------------------------------------------------------
  // Cache
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // API key warning
  // ----------------------------------------------------------

  if (!settings.geminiApiKey) {
    showStatus(
      "Chưa có Gemini API Key. Bấm ⚙️ để nhập API Key."
    );
  }
}


// ============================================================
// SETTINGS BUTTON
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
      settings.geminiModel ||
      "gemini-3.1-pro-preview";


    els.settingsDialog.showModal();
  }
);


// ============================================================
// SAVE SETTINGS
// ============================================================

els.saveSettingsButton.addEventListener(
  "click",
  async (event) => {

    event.preventDefault();


    // --------------------------------------------------------
    // API key
    // --------------------------------------------------------

    const apiKey =
      els.apiKeyInput.value.trim();


    // --------------------------------------------------------
    // Model
    // --------------------------------------------------------

    const model =
      els.modelInput.value.trim() ||
      "gemini-3.1-pro-preview";


    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (!apiKey) {
      showStatus(
        "Bạn chưa nhập Gemini API Key.",
        "error"
      );

      return;
    }


    // --------------------------------------------------------
    // Save
    // --------------------------------------------------------

    await chrome.storage.local.set({
      geminiApiKey: apiKey,
      geminiModel: model
    });


    // --------------------------------------------------------
    // Close
    // --------------------------------------------------------

    els.settingsDialog.close();


    showStatus(
      `Đã lưu Gemini API Key và model ${model}.`,
      "success"
    );
  }
);


// ============================================================
// ANALYZE BUTTON
// ============================================================

els.analyzeButton.addEventListener(
  "click",
  () => {
    analyzeCurrentPaper(false);
  }
);


// ============================================================
// FORCE ANALYZE
// ============================================================

els.forceAnalyzeButton.addEventListener(
  "click",
  () => {
    analyzeCurrentPaper(true);
  }
);


// ============================================================
// ANALYZE PAPER
// ============================================================

async function analyzeCurrentPaper(force) {
  if (isWorking) {
    return;
  }


  // ----------------------------------------------------------
  // Refresh active tab
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // Settings + cache
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // Check API key
  // ----------------------------------------------------------

  if (!geminiApiKey) {
    showStatus(
      "Bạn chưa nhập Gemini API Key. Bấm ⚙️ để cài đặt.",
      "error"
    );

    els.settingsDialog.showModal();

    return;
  }


  // ----------------------------------------------------------
  // Cache
  // ----------------------------------------------------------

  if (
    !force &&
    paperCache?.[activeTab.url]?.analysis
  ) {
    renderAnalysis(
      paperCache[activeTab.url].analysis,
      activeTab.url
    );


    showStatus(
      "Đang dùng kết quả đã lưu. Nếu muốn gọi Gemini lại, bấm “Phân tích lại bằng Gemini”.",
      "success"
    );

    return;
  }


  // ----------------------------------------------------------
  // Restricted browser pages
  // ----------------------------------------------------------

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


  // ==========================================================
  // START
  // ==========================================================

  try {
    setWorking(true);


    showStatus(
      "Đang lấy nội dung paper…"
    );


    let extracted;


    // ========================================================
    // PDF
    // ========================================================

    if (looksLikePdf(activeTab.url)) {
      extracted =
        await extractPdfText(
          activeTab.url,

          (message) => {
            showStatus(message);
          }
        );
    }


    // ========================================================
    // HTML
    // ========================================================

    else {
      // ------------------------------------------------------
      // Google Scholar search page
      // ------------------------------------------------------

      if (
        /scholar\.google\./i.test(
          activeTab.url
        )
      ) {
        throw new Error(
          "Bạn đang ở trang tìm kiếm Google Scholar.\n\nHãy click vào tên paper hoặc link [PDF] để mở paper trước, sau đó mới bấm Analyze."
        );
      }


      try {
        extracted =
          await extractHtmlText(
            activeTab.id
          );
      }

      catch (htmlError) {
        console.error(
          "HTML extraction error:",
          htmlError
        );


        if (
          looksLikePdf(activeTab.url)
        ) {
          extracted =
            await extractPdfText(
              activeTab.url,

              (message) => {
                showStatus(message);
              }
            );
        }

        else {
          throw htmlError;
        }
      }
    }


    // ========================================================
    // VALIDATE TEXT
    // ========================================================

    if (
      !extracted?.text ||
      extracted.text.length < 1500
    ) {
      throw new Error(
        "Extension lấy được quá ít nội dung để phân tích.\n\nHãy thử mở bản PDF hoặc arXiv HTML của paper."
      );
    }


    // ========================================================
    // PREPARE PAPER
    // ========================================================

    showStatus(
      "Đang xử lý nội dung paper…"
    );


    const excerpt =
      buildPaperExcerpt(
        extracted.text
      );


    // ========================================================
    // INFO
    // ========================================================

    if (excerpt.truncated) {
      showStatus(
        "Paper khá dài. Extension đang chọn Abstract, Method, Experiments, Results, Conclusion…"
      );
    } else {
      showStatus(
        "Đang gửi paper tới Gemini để phân tích…"
      );
    }


    // ========================================================
    // CALL SERVICE WORKER
    // ========================================================

    const response =
      await chrome.runtime.sendMessage({
        type: "ANALYZE_PAPER",

        payload: {
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
            excerpt.truncated,

          model:
            geminiModel ||
            "gemini-3.1-pro-preview"
        }
      });


    // ========================================================
    // ERROR
    // ========================================================

    if (!response?.ok) {
      throw new Error(
        response?.error ||
        "Gemini API trả về lỗi không xác định."
      );
    }


    // ========================================================
    // RESULT
    // ========================================================

    const analysis =
      response.analysis;


    renderAnalysis(
      analysis,
      activeTab.url
    );


    // ========================================================
    // CACHE
    // ========================================================

    await saveToCache(
      activeTab.url,
      analysis
    );


    // ========================================================
    // SUCCESS
    // ========================================================

    if (excerpt.truncated) {
      showStatus(
        "Phân tích hoàn tất. Vì paper dài, extension đã ưu tiên các phần quan trọng.",
        "success"
      );
    }

    else {
      showStatus(
        "Gemini đã phân tích paper xong.",
        "success"
      );
    }


    els.forceAnalyzeButton.classList.remove(
      "hidden"
    );


    els.analyzeButtonText.textContent =
      "Dùng kết quả đã lưu";
  }


  // ==========================================================
  // ERROR
  // ==========================================================

  catch (error) {
    console.error(
      "Analyze error:",
      error
    );


    showStatus(
      error?.message ||
      String(error),
      "error"
    );
  }


  // ==========================================================
  // FINALLY
  // ==========================================================

  finally {
    setWorking(false);
  }
}


// ============================================================
// GET ACTIVE TAB
// ============================================================

async function getActiveTab() {
  const tabs =
    await chrome.tabs.query({
      active: true,
      currentWindow: true
    });


  return tabs?.[0] || null;
}


// ============================================================
// WORKING STATE
// ============================================================

function setWorking(value) {
  isWorking = value;


  els.analyzeButton.disabled =
    value;


  els.forceAnalyzeButton.disabled =
    value;


  if (value) {
    els.analyzeButtonText.textContent =
      "Gemini đang phân tích…";

    return;
  }


  if (
    !els.result.classList.contains(
      "hidden"
    )
  ) {
    els.analyzeButtonText.textContent =
      "Dùng kết quả đã lưu";
  }

  else {
    els.analyzeButtonText.textContent =
      "Phân tích paper hiện tại";
  }
}


// ============================================================
// STATUS
// ============================================================

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


// ============================================================
// RENDER RESULT
// ============================================================

function renderAnalysis(
  data,
  sourceUrl
) {
  // ----------------------------------------------------------
  // Show result
  // ----------------------------------------------------------

  els.emptyState.classList.add(
    "hidden"
  );


  els.result.classList.remove(
    "hidden"
  );


  // ----------------------------------------------------------
  // Paper title
  // ----------------------------------------------------------

  els.paperTitle.textContent =
    data?.title ||
    "Không xác định";


  // ----------------------------------------------------------
  // Authors
  // ----------------------------------------------------------

  if (
    Array.isArray(data?.authors) &&
    data.authors.length > 0
  ) {
    els.paperAuthors.textContent =
      data.authors.join(", ");
  }

  else {
    els.paperAuthors.textContent =
      "Không tìm thấy";
  }


  // ----------------------------------------------------------
  // Field
  // ----------------------------------------------------------

  els.paperField.textContent =
    data?.field ||
    "Không xác định";


  // ----------------------------------------------------------
  // Problem
  // ----------------------------------------------------------

  els.problem.textContent =
    data?.problem ||
    "Không tìm thấy thông tin rõ ràng.";


  // ----------------------------------------------------------
  // Main idea
  // ----------------------------------------------------------

  els.mainIdea.textContent =
    data?.mainIdea ||
    "Không tìm thấy thông tin rõ ràng.";


  // ----------------------------------------------------------
  // Simple explanation
  // ----------------------------------------------------------

  els.simpleExplanation.textContent =
    data?.simpleExplanation ||
    "Không tìm thấy thông tin rõ ràng.";


  // ----------------------------------------------------------
  // Lists
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // Source
  // ----------------------------------------------------------

  if (sourceUrl) {
    els.sourceLink.href =
      sourceUrl;

    els.sourceLink.textContent =
      "Mở paper gốc";
  }

  else {
    els.sourceLink.removeAttribute(
      "href"
    );

    els.sourceLink.textContent =
      "Không xác định nguồn";
  }


  // ----------------------------------------------------------
  // Scroll top
  // ----------------------------------------------------------

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// ============================================================
// RENDER LIST
// ============================================================

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
      document.createElement("p");


    p.className =
      "muted";


    p.textContent =
      "Không tìm thấy thông tin rõ ràng trong paper.";


    container.appendChild(p);

    return;
  }


  const ul =
    document.createElement("ul");


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
      document.createElement("li");


    li.textContent =
      item.trim();


    ul.appendChild(li);
  }


  if (!ul.children.length) {
    const p =
      document.createElement("p");


    p.className =
      "muted";


    p.textContent =
      "Không tìm thấy thông tin rõ ràng trong paper.";


    container.appendChild(p);

    return;
  }


  container.appendChild(ul);
}


// ============================================================
// CACHE
// ============================================================

async function saveToCache(
  url,
  analysis
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
    savedAt: Date.now()
  };


  // ----------------------------------------------------------
  // Sort newest first
  // ----------------------------------------------------------

  const entries =
    Object.entries(
      paperCache
    ).sort(
      (a, b) =>
        (b[1]?.savedAt || 0) -
        (a[1]?.savedAt || 0)
    );


  // ----------------------------------------------------------
  // Keep only 30 papers
  // ----------------------------------------------------------

  const trimmed =
    Object.fromEntries(
      entries.slice(0, 30)
    );


  await chrome.storage.local.set({
    paperCache: trimmed
  });
}