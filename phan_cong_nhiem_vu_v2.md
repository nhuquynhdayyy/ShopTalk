
# 📋 Phân công nhiệm vụ v2 - ShopTalk
---

## 🟢 Nguyên tắc chung (Cố định):
- **Độc lập:** Mỗi người làm module riêng, dùng Mock Data để không chờ đợi nhau.
- **Điểm kết nối:** Bảng `orders`, cấu trúc JSON API, WebSocket events đã chốt.
- **Git Flow:** Mỗi người 1 nhánh riêng, tạo PR khi hoàn thành.

---

## 📊 API Contract Cơ bản (Cập nhật):
### 1. Database Schema Mới:
| Bảng | Mô tả |
| :--- | :--- |
| `orders` | Giữ nguyên cũ (xem phan_cong_nhiem_vu.md) |
| `chat_history` | Lưu lịch sử chat text/voice |
| `products` | Bảng sản phẩm đầy đủ thông tin tư vấn |
| `sessions` | Quản lý session chat/voice |

### 2. Cấu trúc bảng `products`:
| Tên cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Mã sản phẩm |
| `sku` | VARCHAR(100) (UNIQUE) | Mã SKU |
| `name` | VARCHAR(255) (NOT NULL) | Tên sản phẩm |
| `category` | VARCHAR(100) | Danh mục |
| `price_usdc` | DECIMAL(20,6) (NOT NULL) | Giá USDC |
| `price_vnd` | DECIMAL(20,0) | Giá VND (tham khảo) |
| `stock` | INT (NOT NULL) | Tồn kho |
| `size_options` | JSON | Các lựa chọn size (vd: ["S","M","L"]) |
| `color_options` | JSON | Các lựa chọn màu |
| `description` | TEXT | Mô tả chi tiết |
| `selling_points` | JSON[] | Điểm bán hàng (vd: ["Chống nước","Bảo hành 1 năm"]) |
| `reviews` | JSON[] | Đánh giá (vd: [{user:"A",rating:5,comment:"Tốt"}]) |
| `images` | JSON[] | Link ảnh sản phẩm |
| `created_at` | TIMESTAMP | Thời gian tạo |
| `updated_at` | TIMESTAMP | Thời gian cập nhật |

### 3. Cấu trúc bảng `chat_history`:
| Tên cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | UUID (PK) | ID bản ghi |
| `session_id` | UUID (FK) | ID session |
| `sender` | VARCHAR(50) (NOT NULL) | "user" / "ai" / "agent" |
| `type` | VARCHAR(50) (NOT NULL) | "text" / "voice" |
| `content` | TEXT | Nội dung text / transcript voice |
| `audio_url` | VARCHAR(500) | Link file voice (nếu có) |
| `timestamp` | TIMESTAMP | Thời gian gửi |

### 4. Cấu trúc bảng `sessions`:
| Tên cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | UUID (PK) | ID session |
| `type` | VARCHAR(50) (NOT NULL) | "text" / "voice" |
| `status` | VARCHAR(50) (NOT NULL) | "active" / "escalated" / "closed" |
| `user_meta` | JSON | Thông tin user (name, phone,...) |
| `created_at` | TIMESTAMP | Thời gian tạo |
| `closed_at` | TIMESTAMP | Thời gian đóng |

---

## 👤 NGUYỄN NHƯ QUỲNH (Lead Developer & System Architect)
### 🎯 Objective:
- Thiết kế database, tích hợp các nền tảng quản lý kho, nhúng widget chat/voice lên website/Messenger/Zalo.

### 🔧 Key Tasks:
1. **Tạo bảng `products`, `chat_history`, `sessions`:**
   - File: `backend/src/config/migrate.js`
   - Thêm đầy đủ các trường theo schema đã định nghĩa.
2. **Tạo Models Mới:**
   - File mới: `backend/src/models/product.model.js`
   - File mới: `backend/src/models/chatHistory.model.js`
   - File mới: `backend/src/models/session.model.js`
3. **Tích hợp Sapo/KiotViet:**
   - File mới: `backend/src/integrations/sapo.adapter.js`
   - File mới: `backend/src/integrations/kiotviet.adapter.js`
   - File mới: `backend/src/routes/webhooks.routes.js` (nhận webhook đồng bộ sản phẩm).
4. **Nhúng Widget Chat/Voice:**
   - File mới: `frontend/src/embed/chatWidgetEmbed.js` (script nhúng vào website).
   - Tài liệu hướng dẫn nhúng lên Messenger/Zalo (file `docs/embed-guide.md`).
5. **Review & Merge Code:**
   - Review PR của các thành viên.

### ✅ Definition of Done (DoD):
- Migration chạy thành công, tạo đủ 3 bảng mới.
- Models CRUD đầy đủ.
- Adapter Sapo/KiotViet dùng mock data chạy được.
- Script nhúng widget tạo xong, tài liệu hướng dẫn rõ ràng.

---

## 👤 THẢO NGUYÊN (AI & Agora Specialist - The Brain)
### 🎯 Objective:
- Xây dựng AI Agent thông minh, tư vấn thuyết phục, ghi nhận feedback.

### 🔧 Key Tasks:
1. **Cập nhật System Prompt AI Agent (Tư vấn thuyết phục):**
   - File: `ai-agent/prompts/system-prompt.md`
   - Thêm prompt: Nhấn mạnh selling points, giải quyết objection, khuyến mãi.
2. **Hoàn thiện AI Tools:**
   - File: `ai-agent/tools/logFeedback.tool.js` (lưu feedback vào `chat_history`).
   - File: `ai-agent/tools/getReviews.tool.js` (lấy reviews sản phẩm).
3. **Cập nhật `products.json` với đầy đủ thông tin:**
   - File: `backend/data/products.json` (thêm `selling_points`, `reviews`, `size_options`...).

### ✅ Definition of Done (DoD):
- AI trả lời có thuyết phục, dùng selling points.
- Tools `logFeedback` và `getReviews` hoạt động.
- `products.json` đầy đủ trường cho AI tư vấn.

---

## 👤 THANH PHÚC (Blockchain & Backend Engineer - The Bank)
### 🎯 Objective:
- Quản lý trạng thái đơn hàng, logic chờ thanh toán, check sâu escalation.

### 🔧 Key Tasks:
1. **Bắn Event WebSocket `transcript_received`, `order_paid`, `escalation_request`:**
   - File: `backend/src/websocket/socket.server.js`
   - File: `backend/src/workers/paymentWatcher.js` (bắn `order_paid`).
   - Định nghĩa rõ ràng cấu trúc từng event.
2. **Logic "Chờ thanh toán xong" & Nhắc lại sau 5 phút:**
   - File: `backend/src/workers/paymentWatcher.js`
   - Tạo cron job nhỏ hoặc logic kiểm tra đơn hàng pending chưa paid sau 5 phút.
3. **Check sâu Escalation Logic:**
   - File: `backend/src/models/session.model.js` (thêm hàm cập nhật trạng thái session).
   - File: `backend/src/workers/escalation.worker.js` (tạo mới, quản lý ticket escalation).
4. **Payment Verify & Idempotency:**
   - File: `backend/src/services/verify.service.js` (giữ nguyên, hoàn thiện).

### ✅ Definition of Done (DoD):
- Tất cả WebSocket events được định nghĩa và bắn đúng lúc.
- Đơn hàng unpaid sau 5 phút có logic nhắc lại.
- Escalation ticket được quản lý, trạng thái session cập nhật đúng.

---

## 👤 NGỌC HẬU (Frontend & UX Engineer - The Face)
### 🎯 Objective:
- Tạo UI/UX Chat Widget + Dashboard, xử lý transcript, end call, ẩn QR.

### 🔧 Key Tasks:
1. **Chat Widget:**
   - File: `frontend/src/pages/ChatWidget.jsx`
   - File mới: `frontend/src/components/VoiceCallUI.jsx`
   - **Hiển thị transcript voice:** Lắng nghe event `transcript_received`.
   - **Nút tắt cuộc gọi:** Thêm nút "End Call" vào `VoiceCallUI.jsx`.
   - **Ẩn QR khi paid:** Lắng nghe event `order_paid`, ẩn QR, hiện thông báo thành công.
2. **Dashboard:**
   - File: `frontend/src/pages/Dashboard.jsx`
   - File mới: `frontend/src/components/OffRampChart.jsx` (dùng `recharts`).
   - Giữ nguyên các tính năng cũ, thêm mock data nếu cần.
3. **Mock Data:**
   - Tạo các file mock trong `frontend/src/mocks/`:
     - `mockChatHistory.js`, `mockProducts.js`, `mockExchangeRates.js`.

### ✅ Definition of Done (DoD):
- Transcript voice hiện lên chat.
- Có nút end call hoạt động.
- QR code ẩn ngay khi nhận event `order_paid`.
- UI chạy mượt với mock data.

---

## 🌳 Git Flow & Branch Naming (Cập nhật):
| Thành viên | Tên nhánh | Mô tả |
| :--- | :--- | :--- |
| **QUỲNH** | `main` | Migration, models, adapters |
| **NGUYÊN** | `feature/ai-agora-v2` | AI, Agora, Escalation v2 |
| **PHÚC** | `feature/blockchain-backend-v2` | Payment watcher, webhooks |
| **HẬU** | `feature/frontend-ux-v2` | Chat widget, Dashboard v2 |

### Quy trình Push Code:
1. Pull code mới nhất từ `main`.
2. Checkout nhánh riêng.
3. Code, commit với message rõ ràng (vd: `[Quỳnh] Add products table migration`).
4. Push lên origin.
5. Tạo Pull Request.

---

## 📌 Tổng kết:
- Tất cả thành viên dùng Mock Data để phát triển độc lập.
- Các kết nối giữa module qua API và WebSocket events đã chốt rõ ràng.
- Mỗi task đều có file/module cụ thể, dễ quản lý.
