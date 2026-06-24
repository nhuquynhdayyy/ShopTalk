# 🔵 Nhiệm vụ Phát triển Frontend & Hỗ trợ Đa ngôn ngữ (i18n) - NGỌC HẬU
---

Dưới đây là chi tiết các nhiệm vụ của NGỌC HẬU để triển khai hệ thống đa ngôn ngữ (Tiếng Việt & Tiếng Anh) cho toàn bộ ứng dụng ShopTalk, bao gồm cả Giao diện, AI Agent, Agora Voice Call và dữ liệu sản phẩm.

---

## 🌐 Task 1: Thiết lập hệ thống quản lý bản dịch (i18n) cho toàn bộ giao diện Frontend
### 📝 Mô tả:
Cần tạo một hệ thống quản lý bản dịch chuyên nghiệp để thay thế tất cả các đoạn text cứng trong giao diện bằng khóa bản dịch.

### 📁 Tệp liên quan:
- Tất cả các file trong `frontend/src/` (chứa text giao diện)

### ⚙️ Yêu cầu chi tiết:
1. Cài đặt thư viện i18n phù hợp (ví dụ: `react-i18next` hoặc tự viết context đơn giản).
2. Tạo 2 file bản dịch chính:
   - [vi.json](file:///d:/CONVO HACKATHON/ShopTalk/frontend/src/i18n/vi.json) : Bản dịch tiếng Việt
   - [en.json](file:///d:/CONVO HACKATHON/ShopTalk/frontend/src/i18n/en.json) : Bản dịch tiếng Anh
3. Liệt kê TẤT CẢ các đoạn text hiện có trong giao diện (từ tất cả components) vào 2 file này.
4. Áp dụng hệ thống i18n cho toàn bộ:
   - [ChatWidget.jsx](file:///d:/CONVO HACKATHON/ShopTalk/frontend/src/pages/ChatWidget.jsx)
   - [Dashboard.jsx](file:///d:/CONVO HACKATHON/ShopTalk/frontend/src/pages/Dashboard.jsx)
   - [App.jsx](file:///d:/CONVO HACKATHON/ShopTalk/frontend/src/App.jsx)
   - Tất cả các component trong `frontend/src/components/`
   - Các file mock (nếu cần)
5. Lưu ngôn ngữ người dùng chọn vào `sessionStorage` (giống hiện tại với `shoptalk_session_id`) để giữ nguyên ngôn ngữ sau khi làm mới trang.

---

## 🤖 Task 2: Cập nhật AI Agent để hỗ trợ 2 ngôn ngữ (Việt + Anh) và chuyển đổi mượt mà
### 📝 Mô tả:
Hiện tại AI Agent chỉ dùng prompt tiếng Việt. Cần cập nhật để AI tự động trả lời theo ngôn ngữ khách chọn hoặc khách dùng.

### 📁 Tệp liên quan:
- [ai.service.js](file:///d:/CONVO HACKATHON/ShopTalk/backend/src/services/ai.service.js)
- [system-prompt.md](file:///d:/CONVO HACKATHON/ShopTalk/ai-agent/prompts/system-prompt.md)
- [api.js](file:///d:/CONVO HACKATHON/ShopTalk/frontend/src/api.js) (thêm tham số language khi gọi API)

### ⚙️ Yêu cầu chi tiết:
1. Tạo thêm prompt tiếng Anh hoàn chỉnh trong `ai-agent/prompts/` (hoặc lưu vào biến trong `ai.service.js`).
2. Cập nhật API `/api/ai/chat` để nhận tham số `language` (giá trị: `'vi'` hoặc `'en'`).
3. Dựa vào tham số `language`, AI sẽ dùng prompt tương ứng và trả lời đúng ngôn ngữ đó.
4. Cập nhật Frontend để gửi tham số `language` cùng mỗi tin nhắn chat.
5. Đảm bảo AI vẫn hiểu được nếu khách đổi ngôn ngữ giữa chừng (ví dụ: khách đang chat tiếng Việt, bấm đổi sang tiếng Anh → AI trả lời tiếng Anh tiếp theo).

---

## 🎙️ Task 3: Cập nhật Agora Voice Call để hỗ trợ 2 ngôn ngữ
### 📝 Mô tả:
Hiện tại voice call chỉ được cấu hình cho tiếng Việt. Cần cập nhật để chuyển đổi ngôn ngữ ASR (speech-to-text) và TTS (text-to-speech) theo lựa chọn của người dùng.

### 📁 Tệp liên quan:
- `backend/src/services/agora.service.js`
- `backend/src/routes/agora.routes.js`
- [useAgoraVoice.js](file:///d:/CONVO HACKATHON/ShopTalk/frontend/src/hooks/useAgoraVoice.js)
- [VoiceCallUI.jsx](file:///d:/CONVO HACKATHON/ShopTalk/frontend/src/components/VoiceCallUI.jsx)

### ⚙️ Yêu cầu chi tiết:
1. Cập nhật logic khởi tạo Agora Agent để nhận tham số `language`.
2. Dựa vào `language`, thay đổi:
   - Ngôn ngữ ASR (ví dụ: `'vi-VN'` hoặc `'en-US'`).
   - Ngôn ngữ TTS (ví dụ: tiếng Việt dùng Microsoft HoaiMy, tiếng Anh dùng Microsoft Jenny).
   - Prompt hệ thống của Agora Agent theo ngôn ngữ.
3. Cập nhật Frontend để gửi tham số `language` khi bắt đầu voice call.
4. Đảm bảo nếu người dùng đổi ngôn ngữ giữa cuộc gọi, sẽ khởi tạo lại kênh voice với ngôn ngữ mới.
5. Cập nhật transcript hiển thị trong chat widget theo đúng ngôn ngữ.

---

## 📦 Task 4: Cập nhật dữ liệu sản phẩm để hỗ trợ 2 ngôn ngữ
### 📝 Mô tả:
Hiện tại thông tin sản phẩm chỉ có tiếng Việt. Cần cập nhật để có cả tiếng Anh.

### 📁 Tệp liên quan:
- [products.json](file:///d:/CONVO HACKATHON/ShopTalk/backend/data/products.json)
- [inventory.service.js](file:///d:/CONVO HACKATHON/ShopTalk/backend/src/services/inventory.service.js)

### ⚙️ Yêu cầu chi tiết:
1. Cập nhật cấu trúc mỗi sản phẩm trong `products.json` để có `name_vi`, `name_en`, `description_vi`, `description_en` hoặc giữ nguyên cấu trúc cũ, thêm trường mới: `translations` (chứa object `{ vi: { name, description }, en: { name, description } }`).
2. Cập nhật `checkInventory` và `getProducts` để trả về thông tin sản phẩm theo ngôn ngữ được yêu cầu.
3. Cập nhật API `/api/agent-tools/check-inventory` để nhận tham số `language`.

---

## 📱 Task 5: Nâng cao trải nghiệm chuyển đổi ngôn ngữ
### 📝 Mô tả:
Làm cho trải nghiệm chuyển đổi ngôn ngữ thật mượt mà, không cần load lại trang.

### 📁 Tệp liên quan:
- Toàn bộ Frontend (đã áp dụng i18n ở Task 1)

### ⚙️ Yêu cầu chi tiết:
1. Khi người dùng bấm đổi ngôn ngữ:
   - Tất cả text trong giao diện chuyển đổi ngay lập tức (không reload trang).
   - Gửi signal đến backend để thay đổi ngôn ngữ cho các request tiếp theo.
   - Nếu đang trong voice call, hỏi người dùng có muốn kết thúc cuộc gọi hiện tại và bắt đầu lại với ngôn ngữ mới không.
2. Lưu ngôn ngữ mặc định (nếu người dùng chưa chọn): dựa vào ngôn ngữ trình duyệt (`navigator.language`).
3. Nâng cao dropdown chọn ngôn ngữ: có cờ quốc gia, rõ ràng hơn.

---

## 📝 Lưu ý chung cho tất cả Task:
- Giữ nguyên toàn bộ các tính năng hiện có, chỉ thêm hỗ trợ ngôn ngữ.
- Sau khi hoàn thành, kiểm tra toàn bộ luồng: chat text, chat voice, tạo đơn hàng, xem Dashboard đều hoạt động ở cả 2 ngôn ngữ.
- Đảm bảo tính nhất quán: nếu khách dùng tiếng Việt, toàn bộ giao diện + AI + voice đều tiếng Việt, và ngược lại.
