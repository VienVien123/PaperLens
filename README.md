# AI Paper Reader — Chrome/Edge Extension

A browser extension that analyzes research papers and explains them in Vietnamese using Gemini. Read HTML papers or PDFs, review a structured analysis in the browser side panel, and ask follow-up questions about the paper.

The extension runs in the browser and calls Gemini directly. No application backend or separate database is required.

## Features

- Extract paper content from HTML pages and text-based PDFs.
- Analyze the title, authors, research field, problem, main idea, methods, datasets, results, limitations, and contributions.
- Explain methods in detail: identify the main methods, describe each component, explain its purpose and role, and walk through its inputs, operations, and outputs.
- Present multi-step pipelines in processing order, including connections between steps and separate training and inference stages when described in the paper.
- Provide a plain-language explanation for readers without specialized knowledge of the field.
- Answer follow-up questions using the extracted paper content.
- Cache analysis and paper text for up to eight papers locally.
- Let users configure their own Gemini API key and model.

The interface, analysis, and Q&A responses are currently in Vietnamese. Paper titles, author names, and relevant technical terms retain their original wording. The prompts instruct the model to identify missing information instead of inventing paper details.

## Requirements

- Node.js 22.13.0 or later, compatible with the dependencies' declared engine requirements.
- npm.
- Chrome 114+ or a Chromium-based Edge version with side panel support. The manifest declares Chrome 114 as its minimum; use a recent browser for compatibility with the bundled PDF.js library.
- A Gemini API key with available quota and access to the model you configure.

Check your local tools:

```bash
node --version
npm --version
```

## Installation

From the project directory, install dependencies and build the extension:

```bash
npm install
npm run build
```

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd`:

```powershell
npm.cmd install
npm.cmd run build
```

The build creates a `dist/` directory containing the extension manifest, background service worker, side panel, and bundled assets.

### Load the extension

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's `dist/` directory.
5. Optionally pin **AI Paper Reader** to the toolbar.
6. Click the extension icon to open the side panel.

### Configure Gemini

1. Open settings with the gear button in the side panel.
2. Enter your Gemini API key.
3. Enter a Gemini model ID available to your account.
4. Click **Lưu** (Save).

Both an API key and a model are required. The extension uses the model you save; it does not automatically switch to another model.

Settings are stored in `chrome.storage.local` for the current browser profile. No API key needs to be added to the source code or a `.env` file.

## Usage

### Analyze a paper

1. Open a paper's HTML page or a direct PDF URL.
2. Open the extension side panel.
3. Click **Phân tích paper hiện tại** (Analyze current paper).
4. Read the structured analysis and methods explanation.

Supported extraction paths include arXiv HTML/PDF pages, J-STAGE PDF endpoints, and publisher pages that expose PDF links through metadata or embedded viewers. Actual access depends on the publisher and the browser's permissions.

For Google Scholar, open an individual paper or its PDF before analyzing it.

### Ask follow-up questions

After an analysis is available, click **Hỏi về paper này** (Ask about this paper), enter a question, and click **Gửi câu hỏi** (Send question).

Q&A uses the full extracted paper text rather than the shortened summary excerpt. Each request also includes up to six recent conversation messages. Very long papers can exceed the selected model's context limit.

### Reanalyze a paper

The extension reuses a cached analysis for the same URL when available. Click **Phân tích lại bằng Gemini** (Reanalyze with Gemini) to request a fresh analysis, including after changes to the summary prompt or model settings.

### Open a local PDF

To read a `file://` PDF, open the extension's **Details** page in your browser's extension manager and enable **Allow access to file URLs**. Then open the PDF and analyze it from the side panel.

## How it works

```text
Active browser tab
    |
    +-- HTML paper --> Extract text with chrome.scripting
    |
    +-- PDF --------> Download and extract text with PDF.js
    |
    +-- Summary --> Clean text and select sections for long papers
    |                   |
    |                   v
    |               Gemini API --> Structured JSON --> Side panel
    |
    +-- Q&A ------> Full extracted text + question + recent history
                        |
                        v
                    Gemini API --> Answer in the side panel
```

When HTML extraction yields too little content, the extension can try PDF links found in page metadata or embedded viewers. It validates downloaded content to distinguish PDFs from HTML login or error pages.

### Long papers

`src/paperProcessing.js` limits the summary input to approximately **110,000 characters**. It normalizes extracted text and removes the references section when detected.

For longer documents, it tries to select recognized sections such as the abstract, introduction, methods, experiments, results, and conclusions. If section detection is insufficient, it samples across the document. Some details may therefore be omitted from the summary input.

Adjust `MAX_INPUT_CHARS` in that file to change the limit. Larger inputs may increase API usage and must fit within the selected model's limits.

### Structured analysis

The summary request uses a JSON response schema with these fields:

```json
{
  "title": "...",
  "authors": ["..."],
  "field": "...",
  "problem": "...",
  "mainIdea": "...",
  "methods": ["..."],
  "datasets": ["..."],
  "results": ["..."],
  "limitations": ["..."],
  "contributions": ["..."],
  "simpleExplanation": "..."
}
```

### Local storage and data flow

The extension stores the Gemini API key, selected model, and up to **eight** paper entries in `chrome.storage.local`. Each paper entry includes its analysis, extracted text for Q&A, and a save timestamp, keyed by URL.

Analysis requests send the prepared paper excerpt, page title, and source URL to Gemini. Q&A requests send the extracted paper text, question, recent conversation history, title, and source URL. This is an online AI workflow.

The API key is used directly by the extension and is accessible to someone with access to the browser profile. Keep credentials out of source control and use your own key in settings.

## Development

```bash
npm test          # Run the extraction and PDF handling tests
npm run build    # Build the unpacked extension into dist/
npm run dev      # Start the Vite development server
npm run preview  # Preview the built frontend
```

The development server and frontend preview do not provide the full extension environment. To verify browser integration, build the project and load `dist/` as an unpacked extension.

After changing code:

1. Run `npm run build`.
2. Open your browser's extension manager.
3. Click **Reload** on the extension.
4. Reopen the side panel. Reanalyze the paper if you changed the AI prompts.

### Customize the AI behavior

Edit `public/service-worker.js`:

- `SUMMARY_SYSTEM_INSTRUCTION`: summary language, detail, grounding, and methods explanations.
- `RESPONSE_SCHEMA`: the structured analysis fields.
- `QA_SYSTEM_INSTRUCTION`: follow-up answer behavior.

### Source structure

```text
ai-paper-reader/
├── package.json
├── vite.config.js
├── sidepanel.html
├── README.md
├── public/
│   ├── manifest.json          # Extension metadata and permissions
│   └── service-worker.js     # Gemini requests, prompts, and response handling
├── src/
│   ├── main.js               # Side panel UI, settings, cache, and Q&A
│   ├── styles.css            # Side panel styles
│   ├── extraction.js         # HTML/PDF extraction routing and fallbacks
│   ├── page.js               # HTML text and PDF link extraction
│   ├── pdfSource.js          # PDF URL detection and download validation
│   ├── pdf.js                # PDF.js text extraction
│   └── paperProcessing.js    # Text cleanup and summary excerpt selection
└── test/
    └── extraction.test.js    # Extraction and PDF handling tests
```

## Limitations and troubleshooting

| Issue | What to check |
| --- | --- |
| Missing or invalid API key | Open settings and verify your Gemini key. |
| Model unavailable | Enter a model ID that your API account can access. |
| Quota or rate-limit errors | Check your Gemini account's available quota and retry later. |
| Browser refuses page access | Open a regular paper or PDF URL; browser system pages and other restricted pages cannot be extracted. |
| PDF contains little or no text | Scanned or image-only PDFs require OCR, which is not implemented. |
| Publisher PDF cannot be downloaded | Access may require authentication or be blocked. Try an accessible direct PDF or an arXiv version. |
| HTML extraction misses content | Complex page layouts, embedded content, and dynamic rendering can affect extraction. Try the PDF version. |
| Equations look incomplete | PDF text extraction may lose mathematical layout or reading order. Check the original paper. |
| Side panel does not open | Check browser compatibility and reload the extension. |
| Old results remain after a change | Rebuild, reload the extension, and use the reanalyze button to replace cached results. |

AI-generated analysis can contain mistakes. Check important claims and numerical results against the original paper.
