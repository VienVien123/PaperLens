# AI Paper Reader — Chrome/Edge Extension

Extension cá nhân để đọc research paper/PDF trên trình duyệt và trả về:

- Tên paper
- Authors
- Lĩnh vực
- Paper giải quyết vấn đề gì
- Ý tưởng chính
- Phương pháp
- Dataset
- Kết quả
- Hạn chế
- Đóng góp chính
- Giải thích đơn giản bằng tiếng Việt

Không có chatbot, không có server, không có database.

---

## 1. Kiến trúc

```text
Chrome / Edge
    |
    |-- Trang paper HTML
    |       -> chrome.scripting đọc text
    |
    |-- PDF
    |       -> pdfjs-dist đọc text
    |
    v
Chọn phần quan trọng của paper
    |
    v
OpenAI Responses API
    |
    v
Structured JSON
    |
    v
Chrome Side Panel
```

API key được lưu bằng `chrome.storage.local` trên profile trình duyệt của bạn.

---

## 2. Yêu cầu

Cài:

- Node.js 20+ (khuyên dùng Node.js 22 LTS)
- npm
- Chrome 114+ hoặc Edge Chromium tương đương
- OpenAI API key có billing/quota

Kiểm tra:

```bash
node -v
npm -v
```

---

## 3. Cài thư viện

Mở Terminal tại folder project:

```bash
npm install
```

---

## 4. Build extension

```bash
npm run build
```

Sau khi chạy xong sẽ có:

```text
dist/
├── manifest.json
├── service-worker.js
├── sidepanel.html
└── assets/
```

ĐÂY là folder cài vào trình duyệt.

---

## 5. Cài trên Google Chrome

Mở:

```text
chrome://extensions
```

Sau đó:

1. Bật **Developer mode**
2. Bấm **Load unpacked**
3. Chọn folder `dist`
4. Pin extension `AI Paper Reader` lên thanh công cụ nếu muốn

Bấm icon extension -> Chrome Side Panel sẽ mở.

Chrome Side Panel API cần Chrome 114 trở lên.

---

## 6. Cài trên Microsoft Edge

Mở:

```text
edge://extensions
```

Sau đó:

1. Bật **Developer mode**
2. Bấm **Load unpacked**
3. Chọn folder `dist`

---

## 7. Nhập API key

Trong Side Panel:

1. Bấm `⚙️`
2. Dán OpenAI API key
3. Model mặc định: `gpt-6-luna`
4. Bấm **Lưu**

Bạn có thể đổi model bất kỳ lúc nào.

API key KHÔNG được viết cứng trong source code. Nó được lưu trong browser storage của profile hiện tại.

> Đây là kiến trúc dành cho một mình bạn dùng. Nếu phát hành extension cho người khác, không nên để API key phía client; khi đó nên có backend.

---

## 8. Cách dùng

### arXiv HTML

Ví dụ mở:

```text
https://arxiv.org/html/...
```

Bấm extension -> **Phân tích paper hiện tại**.

### arXiv PDF

Ví dụ:

```text
https://arxiv.org/pdf/1706.03762
```

Bấm extension -> **Phân tích paper hiện tại**.

Extension sẽ:

1. tải PDF,
2. dùng PDF.js lấy text,
3. bỏ phần References nếu nhận diện được,
4. nếu paper quá dài sẽ lấy các section quan trọng,
5. gửi text sang OpenAI,
6. nhận JSON có schema cố định,
7. render ra Side Panel.

### PDF từ J-STAGE và các trang nhà xuất bản

Extension nhận diện URL `/_pdf`, `/pdf/`, `.pdf#page=...` và các link tải PDF không có đuôi file. Khi trang HTML không có đủ nội dung, extension thử link PDF trong metadata hoặc khung nhúng, rồi kiểm tra dữ liệu tại URL hiện tại. Trang đăng nhập/lỗi trả về thay cho PDF sẽ có thông báo riêng. PDF scan vẫn cần OCR và chưa được hỗ trợ.

### Google Scholar

Google Scholar chủ yếu là trang tìm kiếm.

Đúng flow:

```text
Google Scholar
   -> click paper hoặc [PDF]
   -> mở paper/PDF
   -> bấm AI Paper Reader
```

Nếu bấm Analyze ngay tại trang danh sách Google Scholar, extension sẽ yêu cầu bạn mở paper trước.

---

## 9. PDF local trên máy

Nếu muốn đọc:

```text
file:///C:/...
```

hoặc PDF local trên macOS/Linux:

Vào `chrome://extensions` -> AI Paper Reader -> **Details** -> bật:

**Allow access to file URLs**

Sau đó mở PDF và dùng extension.

---

## 10. Paper quá dài

File:

```text
src/paperProcessing.js
```

đang giới hạn khoảng:

```js
110_000
```

ký tự gửi AI.

Nếu paper dài hơn:

- ưu tiên title/đầu paper,
- tìm Abstract,
- Introduction,
- Method/Approach,
- Experiments,
- Results,
- Discussion,
- Limitations,
- Conclusion,
- bỏ References,
- nếu không nhận diện section tốt thì lấy mẫu xuyên suốt document.

Muốn tăng:

```js
const MAX_INPUT_CHARS = 110_000;
```

Ví dụ:

```js
const MAX_INPUT_CHARS = 180_000;
```

Nhưng input dài hơn sẽ tốn token/API cost hơn.

---

## 11. Thay model

Mở Settings trong extension.

Ví dụ:

```text
gpt-6-luna
```

Project không hard-code model trong UI logic; model được lưu ở:

```text
chrome.storage.local
```

---

## 12. Sửa prompt AI

File:

```text
public/service-worker.js
```

Tìm:

```js
const systemPrompt = `...`
```

Đây là nơi quy định cách AI đọc paper.

Schema JSON cũng nằm ngay trong cùng file:

```js
const schema = {
  ...
}
```

---

## 13. Output JSON

AI bắt buộc trả dạng:

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

Dùng Structured Outputs để giảm trường hợp AI trả sai format.

---

## 14. Cache

Kết quả được lưu local theo URL.

Tối đa:

```text
30 papers
```

File:

```text
src/main.js
```

Tìm:

```js
entries.slice(0, 30)
```

Mở lại cùng URL -> extension sẽ dùng kết quả cũ, không tốn API call.

Muốn gọi lại AI:

```text
Phân tích lại bằng AI
```

---

## 15. Các giới hạn hiện tại

### PDF scan

Nếu PDF chỉ là ảnh, không có text layer:

```text
Không hoạt động
```

vì bản này chưa có OCR.

Academic PDF từ arXiv thường có text layer.

### Publisher chống tải PDF

Một số trang yêu cầu login/cookie hoặc tải PDF qua URL đặc biệt. Nếu extension không đọc được trang publisher:

- thử bản arXiv,
- hoặc mở link PDF trực tiếp.

### Website render đặc biệt

Một số site dùng iframe/shadow DOM hoặc app JS phức tạp nên extraction HTML có thể không tốt. PDF thường ổn định hơn.

### Công thức

PDF.js lấy text của equation nhưng thứ tự/format công thức có thể không hoàn hảo. Bản MVP tập trung vào nội dung paper, không render lại công thức.

---

## 16. Development workflow

Sau khi sửa code:

```bash
npm run build
```

Sau đó vào:

```text
chrome://extensions
```

Bấm nút **Reload** trên extension.

Không cần xóa/cài lại.

---

## 17. Cấu trúc source

```text
ai-paper-reader/
├── package.json
├── vite.config.js
├── sidepanel.html
├── README.md
│
├── public/
│   ├── manifest.json
│   └── service-worker.js
│
└── src/
    ├── main.js
    ├── styles.css
    ├── pdf.js
    ├── page.js
    └── paperProcessing.js
```

### `main.js`

Điều khiển UI, active tab, cache, gọi extraction và gửi message sang service worker.

### `pdf.js`

Download + đọc PDF bằng PDF.js.

### `page.js`

Inject script vào tab để lấy text từ paper dạng HTML.

### `paperProcessing.js`

Clean text, bỏ References, chọn section quan trọng khi paper quá dài.

### `service-worker.js`

Gọi OpenAI Responses API và ép kết quả về JSON schema.

---

## 18. Nếu gặp lỗi

### `API key không hợp lệ`

Kiểm tra key và billing/quota OpenAI.

### `model not found`

Vào Settings đổi model thành model mà API account của bạn có quyền dùng.

### `Cannot access contents of the page`

Trang đó có thể là trang hệ thống, Chrome Web Store, hoặc trang bị giới hạn. Mở paper/PDF ở URL bình thường.

### `PDF gần như không có text layer`

Đây thường là PDF scan. Bản này chưa OCR.

### Extension không mở side panel

Kiểm tra Chrome >= 114 và reload extension ở `chrome://extensions`.

---

## 19. Bảo mật cho trường hợp cá nhân

Thiết kế hiện tại phù hợp khi:

- chỉ bạn dùng,
- không publish extension,
- máy/profile Chrome là của bạn.

API key nằm trong Chrome local storage. Người có quyền truy cập profile trình duyệt hoặc máy của bạn vẫn có thể lấy được key.

Nếu sau này chia sẻ extension cho người khác, hãy chuyển lời gọi OpenAI sang backend và giữ API key ở server.
