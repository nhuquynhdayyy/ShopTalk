# 🔴 Nhiệm vụ Phát triển Backend & AI - THANH PHÚC
---

Dưới đây là chi tiết các nhiệm vụ Backend, AI và Socket.io để xử lý luồng **Chuyển giao cho người thật (Escalation)** và **Hỗ trợ chat trực tiếp**.

---

## 🔴 Task 1: Thực hiện Escalation khi không tìm thấy sản phẩm trong kho
### 📝 Mô tả:
Hiện tại khi `checkInventory` không tìm thấy sản phẩm, hệ thống chỉ trả về thông báo lỗi thông thường mà không kích hoạt Escalation. Cần thêm logic để phát hiện trường hợp này và chuyển giao cho nhân viên.

### 📁 Tệp liên quan:
- [inventory.service.js](file:///d:/CONVO HACKATHON/ShopTalk/backend/src/services/inventory.service.js)
- [ai.service.js](file:///d:/CONVO HACKATHON/ShopTalk/backend/src/services/ai.service.js)

### ⚙️ Yêu cầu chi tiết:
1. Sửa `checkInventory` để trả về thêm flag cho biết có tìm thấy sản phẩm hay không (nếu chưa có).
2. Trong `ai.service.js`, sau khi gọi `checkInventory`, kiểm tra nếu không tìm thấy sản phẩm → kích hoạt Escalation.
3. Đảm bảo UI Chat Widget nhận được `escalate: true` và hiển thị giao diện chuyển giao.
4. Giữ nguyên hiện trạng WebSocket bắn sự kiện `escalation_request` đến Dashboard.

---

## 🟡 Task 2: Thực hiện Escalation khi khách hỏi lại nhiều lần cùng một câu
### 📝 Mô tả:
Hiện tại chưa có logic đếm số lần lặp lại câu hỏi của khách. Cần thêm logic này để tự động chuyển giao khi khách hỏi cùng một câu liên tiếp (ví dụ: 2 lần).

### 📁 Tệp liên quan:
- [ai.service.js](file:///d:/CONVO HACKATHON/ShopTalk/backend/src/services/ai.service.js)
- (Nếu cần lưu vào DB: `backend/src/models/...`)

### ⚙️ Yêu cầu chi tiết:
1. Lưu lịch sử tin nhắn của khách (theo `sessionId`).
2. Thêm logic so sánh tin nhắn hiện tại với tin nhắn trước đó (sau khi chuẩn hóa: loại bỏ dấu, lowercase, loại bỏ khoảng trắng thừa).
3. Nếu trùng lặp ≥ số lần quy định (ví dụ: 2 lần) → kích hoạt Escalation.
4. Đảm bảo UI Chat Widget nhận được `escalate: true` và hiển thị giao diện chuyển giao.
5. Giữ nguyên hiện trạng WebSocket bắn sự kiện `escalation_request` đến Dashboard.

---

## 🟢 Task 3: Thực hiện Escalation khi giá trị đơn hàng vượt ngưỡng
### 📝 Mô tả:
Hiện tại chưa có logic kiểm tra giá trị đơn hàng trước khi tạo đơn. Cần thêm logic này để chuyển giao cho chủ shop duyệt nếu đơn hàng có giá trị vượt ngưỡng.

### 📁 Tệp liên quan:
- [ai.service.js](file:///d:/CONVO HACKATHON/ShopTalk/backend/src/services/ai.service.js)
- [orders.routes.js](file:///d:/CONVO HACKATHON/ShopTalk/backend/src/routes/orders.routes.js)
- `backend/.env.example` & file `.env` cục bộ

### ⚙️ Yêu cầu chi tiết:
1. Thêm biến môi trường `ESCALATION_ORDER_THRESHOLD_USDC` (ví dụ giá trị mặc định: `100` USDC) vào `.env.example`.
2. Trong `ai.service.js`, trước khi gọi `createOrder`, kiểm tra giá trị đơn hàng (`amount`).
3. Nếu `amount >= ESCALATION_ORDER_THRESHOLD_USDC` → kích hoạt Escalation thay vì tạo đơn hàng tự động.
4. Đảm bảo UI Chat Widget nhận được `escalate: true` và hiển thị giao diện chuyển giao.
5. Giữ nguyên hiện trạng WebSocket bắn sự kiện `escalation_request` đến Dashboard (nội dung thông báo rõ đây là đơn hàng giá trị cao cần duyệt).

---

## 🔵 Task 4: Hoàn thiện luồng sau khi Escalation (Chủ shop chat trực tiếp với khách)
### 📝 Mô tả:
Hiện tại sau khi chủ shop bấm "Nhận" trên Dashboard, chỉ cập nhật state `accepted: true` mà chưa mở phòng chat trực tiếp. Cần hoàn thiện luồng này (phần Backend / Socket.io).

### 📁 Tệp liên quan:
- [socket.server.js](file:///d:/CONVO HACKATHON/ShopTalk/backend/src/websocket/socket.server.js)
- (Nếu cần: `backend/src/services/...`)

### ⚙️ Yêu cầu chi tiết:
1. Sau khi chủ shop bấm "Nhận" trên Dashboard, mở giao diện chat trực tiếp với khách hàng đó (theo `sessionId`).
2. Thêm logic Socket.io để truyền tin nhắn giữa chủ shop (Dashboard) và khách hàng (Chat Widget).
3. Trong chế độ này, AI sẽ "quan sát" → không tự động trả lời tin nhắn của khách.
4. Giữ nguyên hiện trạng: sau khi Escalation, ô nhập tin nhắn của khách sẽ được ẩn cho đến khi chủ shop kết nối.

---

## 📝 Lưu ý chung cho tất cả Task:
- Giữ nguyên toàn bộ hiện trạng đã có:
  - UI Chat Widget ẩn ô nhập và hiển thị `<StaffHandoff />` khi `isEscalated = true`.
  - Logic bắn sự kiện `escalation_request` qua WebSocket.
  - Hiển thị banner thông báo trên Dashboard.
- Sau khi hoàn thành mỗi Task, kiểm tra lại bằng các kịch bản Test đã cung cấp trong báo cáo QA.
