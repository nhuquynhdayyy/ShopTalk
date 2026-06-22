# 📋 Phân công nhiệm vụ

## 🟢 Nguyên tắc chung:
*   Mỗi người làm trên folder riêng đã phân chia.
*   **Mock Data:** Nếu cần dữ liệu từ người khác chưa xong → tự tạo hardcode để chạy trước.
*   **Điểm kết nối duy nhất:** Bảng `orders` trong DB và cấu trúc JSON đã chốt:

    ### 1. Cấu trúc bảng `orders` (Database)
    
    | Tên cột | Kiểu dữ liệu | Mô tả |
    | :--- | :--- | :--- |
    | `id` | UUID (PRIMARY KEY) | Mã đơn hàng tự động tạo |
    | `reference` | VARCHAR(255) (UNIQUE, NOT NULL) | Reference key cho Solana Pay |
    | `product_name` | VARCHAR(255) (NOT NULL) | Tên sản phẩm |
    | `amount` | DECIMAL(20, 6) (NOT NULL) | Số tiền USDC cần thanh toán |
    | `seller_wallet` | VARCHAR(255) (NOT NULL) | Địa chỉ ví người bán |
    | `status` | VARCHAR(50) (DEFAULT: 'pending', NOT NULL) | Trạng thái đơn hàng: 'pending', 'paid', 'expired', 'payment_mismatch' |
    | `tx_signature` | VARCHAR(255) | Chữ ký giao dịch blockchain |
    | `created_at` | TIMESTAMP WITH TIME ZONE | Thời gian tạo đơn hàng |
    | `expires_at` | TIMESTAMP WITH TIME ZONE | Thời gian hết hạn (15 phút sau khi tạo) |
    
    ### 2. Định dạng JSON phản hồi từ Chat API (POST /api/ai/chat)
    ```json
    {
      "success": true,
      "sessionId": "UUID (dùng để giữ context multi-turn)",
      "reply": "Nội dung tin nhắn từ AI",
      "escalate": false, // hoặc true (cờ bật khi cần chuyển sang nhân viên thật)
      "qrCodeImage": "base64 string của ảnh QR (nếu có), null nếu không",
      "orderId": "UUID của đơn hàng (nếu được tạo), null nếu không"
    }
    ```

---

## 👤 THẢO NGUYÊN: AI & Agora Specialist (The Brain)
**Mục tiêu:** Xây dựng bộ não thông minh tư vấn sản phẩm, biết khi chốt đơn và tích hợp Agora.

### 🔧 Nhiệm vụ chi tiết:
1.  **Hệ thống hội thoại & Agora:**
    *   Tích hợp Groq (Llama 3) vào luồng Agora Conversational AI.
    *   Đảm bảo AI phản hồi nhanh, đúng văn phong trợ lý bán hàng.
    *   Chuyển từ gọi API chat đơn thuần sang quản lý Session/Stream của Agora để hỗ trợ Voice/Text mượt mà hơn.
2.  **Tool Calling Logic & Trích xuất thông tin:**
    *   Viết logic để AI nhận diện ý định mua hàng.
    *   Khi khách chốt mua, AI phải tự trích xuất: Tên khách, địa chỉ, danh sách SP, tổng tiền.
3.  **Dữ liệu sản phẩm & Fuzzy Search:**
    *   Hoàn thiện `products.json`: Thêm ít nhất 7-10 sản phẩm khác (phụ kiện điện thoại, áo thun, mũ, phụ kiện crypto,...) với đầy đủ `id`, `name`, `price_usdc`, `stock`, `description`.
    *   Viết hàm tìm kiếm thông minh tại file [inventory.service.js](/ShopTalk/backend/src/services/inventory.service.js) → dùng `fuse.js` (nếu cần cài: `cd backend && npm install fuse.js`) để tìm kiếm không phân biệt dấu, gõ sai chính tả vẫn ra (vd: "áo đỏ" → ra "Áo thun màu đỏ").
4.  **Escalation (Chuyển người thật):**
    *   Nếu khách hỏi câu khó, yêu cầu "gặp chủ shop", "khiếu nại", "nói với người thật" → AI trả về `action: "human_escalation"` và `escalate: true`.
    *   **Bắn WebSocket:** Khi cờ `escalate = true`, bắn sự kiện `escalation_request` tới Dashboard với nội dung: `sessionId`, `message` (tin nhắn cuối user), `timestamp`.
5.  **Mocking (Độc lập):**
    *   Không cần đợi Blockchain: Viết hàm `createMockOrder()` trả về ID đơn hàng ngẫu nhiên và hiển thị "Mã QR của bạn đây (Ảnh giả)".
    *   File cần chỉnh: [ai.service.js](/ShopTalk/backend/src/services/ai.service.js).

### 📁 File làm việc:
*   [products.json](/ShopTalk/backend/data/products.json)
*   [inventory.service.js](/ShopTalk/backend/src/services/inventory.service.js)
*   [ai.service.js](/ShopTalk/backend/src/services/ai.service.js)
*   [socket.server.js](/ShopTalk/backend/src/websocket/socket.server.js)
*   [ai.routes.js](/ShopTalk/backend/src/routes/ai.routes.js) (nếu cần thêm API Agora)

### ✅ Tiêu chí hoàn thành:
*   AI phản hồi nhanh, đúng văn phong.
*   Tìm kiếm sản phẩm mượt, không phân biệt dấu/gõ sai.
*   Khi có yêu cầu gặp người thật → Dashboard nhận được sự kiện `escalation_request`.
*   Service AI hoàn chỉnh, nhận Text/Voice đầu vào và trả JSON đúng cấu trúc.

---

## 👤 THANH PHÚC: Blockchain & Reliability Engineer (The Bank)
**Mục tiêu:** Đảm bảo tiền vào ví an toàn, chính xác, không gian lận.

### 🔧 Nhiệm vụ chi tiết:
1.  **Xác thực giao dịch (Hàm verifyPayment):**
    *   Tạo file: `backend/src/services/verify.service.js` (hiện trống, cần viết từ đầu).
    *   Kiểm tra 5 điều kiện:
        1. Giao dịch đã `Finalized` trên blockchain.
        2. Đúng loại token USDC.
        3. Đúng địa chỉ ví nhận (`seller_wallet`).
        4. Đủ/số tiền đúng bằng `amount` trong đơn hàng.
        5. Đúng mã `reference` key.
2.  **Quản lý trạng thái đơn hàng:**
    *   **Cronjob Expired:** Tạo file `backend/src/workers/expirationCron.js` dùng `node-cron` → quét các đơn `pending` quá 15 phút → chuyển thành `expired` (hoặc `PAYMENT_EXPIRED` tuân theo DB schema). Chạy định kỳ mỗi 1 phút.
    *   **Xử lý PAYMENT_MISMATCH:** Nếu khách chuyển thiếu/sai số tiền → giữ đơn ở trạng thái chờ, ghi log cảnh báo và cập nhật trạng thái thành `payment_mismatch`.
    *   **Reset Scenarios:** Xây dựng các kịch bản reset trạng thái đơn hàng khi cần.
3.  **Idempotency (Chống trùng lặp):**
    *   Đảm bảo 1 `tx_signature` chỉ được xử lý 1 lần duy nhất.
    *   Kiểm tra `tx_signature` đã tồn tại trong bảng `orders` chưa trước khi cập nhật. Nếu tồn tại → không làm gì.
4.  **Mocking (Độc lập):**
    *   Không cần AI: Tự tạo tay vài đơn hàng `pending` trực tiếp vào DB qua PgAdmin/DBeaver.
    *   Dùng ví Phantom chuyển tiền thật trên Devnet để test hàm xác thực.

### 📁 File làm việc:
*   `backend/src/services/verify.service.js` (Tạo mới)
*   [order.model.js](/ShopTalk/backend/src/models/order.model.js) (thêm hàm cần thiết)
*   `backend/src/workers/expirationCron.js` (Tạo mới)
*   [app.js](/ShopTalk/backend/src/app.js) (start cronjob khi server chạy)
*   [paymentWatcher.js](/ShopTalk/backend/src/workers/paymentWatcher.js) (nếu cần tích hợp)

### ✅ Tiêu chí hoàn thành:
*   5 điều kiện `verifyPayment` được kiểm tra 100%.
*   Đơn hàng `pending` quá 15 phút tự động chuyển `expired`.
*   Giao dịch sai số tiền được đánh dấu `payment_mismatch`.
*   Không có trường hợp 1 `tx_signature` xử lý nhiều lần.
*   Bộ script/worker chạy ổn định, cập nhật DB real-time khi có giao dịch on-chain.

---

## 👤 NGỌC HẬU: Frontend & Interaction Designer (The Face)
**Mục tiêu:** Tạo trải nghiệm "Wow" cho khách và quản lý đơn hàng mượt cho chủ shop.

### 🔧 Nhiệm vụ chi tiết:
1.  **Chat Widget (Phía khách hàng):**
    *   File: [ChatWidget.jsx](/ShopTalk/frontend/src/pages/ChatWidget.jsx).
    *   Thiết kế đẹp: UI chuyên nghiệp, có hiệu ứng gõ chữ (typing indicator) mượt.
    *   **QR Code chuyên nghiệp:** Khi AI gửi mã QR → hiện Modal mã QR to, rõ, kèm nút "Copy địa chỉ ví".
    *   **Escalation UI:** Khi `isEscalated = true` → hiển thị giao diện "Nhân viên đang hỗ trợ" với avatar nhân viên thật và tin nhắn chào mời.
2.  **Merchant Dashboard (Phía chủ shop):**
    *   File: [Dashboard.jsx](/ShopTalk/frontend/src/pages/Dashboard.jsx).
    *   **Real-time orders:** Danh sách đơn hàng cập nhật tức thì qua Socket.io. Đơn vừa `paid` → nhảy lên đầu danh sách.
    *   **Âm thanh "Ting ting":** Phát âm thanh (đã có sẵn `playChime()`) khi đơn hàng thành `paid`.
    *   **Modal Off-ramp chuyên nghiệp:**
        *   Hiện số dư USDC.
        *   Cho chọn ngân hàng, nhập STK.
        *   Hiện tỷ giá giả định.
        *   **Thêm biểu đồ tỷ giá:** Dùng `recharts` (nếu cần cài: `cd frontend && npm install recharts`) để vẽ biểu đồ tỷ giá USDC/VND giả lập.
3.  **WebSocket ổn định:**
    *   File: [useWebSocket.js](/ShopTalk/frontend/src/hooks/useWebSocket.js).
    *   Thêm logic reconnect tự động khi mất kết nối.
    *   Hiển thị trạng thái kết nối (online/offline) trên Dashboard.
4.  **Xử lý Escalation trên Dashboard:**
    *   Lắng nghe sự kiện `escalation_request` từ WebSocket → hiển thị thông báo nổi bật (có nút "Nhận" cuộc trò chuyện).
5.  **Mocking (Độc lập):**
    *   Không cần Backend xong: Tạo `const mockMessages = [...]` và `const mockOrders = [...]` ngay trong file React/Vite để dàn layout. Sau đó thay bằng API thật khi Backend hoàn thành.

### 📁 File làm việc:
*   [ChatWidget.jsx](/ShopTalk/frontend/src/pages/ChatWidget.jsx)
*   [Dashboard.jsx](/ShopTalk/frontend/src/pages/Dashboard.jsx)
*   [useWebSocket.js](/ShopTalk/frontend/src/hooks/useWebSocket.js)
*   `frontend/src/components/` (tạo thêm component nếu cần)
*   [api.js](/ShopTalk/frontend/src/api.js) (nếu cần thêm API call)

### ✅ Tiêu chí hoàn thành:
*   UI Chat và Dashboard đẹp, chuyên nghiệp, có animation mượt.
*   Modal QR Code và Modal Off-ramp rõ ràng, chuyên nghiệp (có biểu đồ tỷ giá).
*   WebSocket tự động reconnect, hiển thị trạng thái online/offline.
*   Dashboard nhận thông báo escalation và phát âm thanh khi đơn paid.
*   Toàn bộ Frontend hoàn chỉnh, chạy demo mượt với dữ liệu giả.

---

## 🌳 Quy trình làm việc với Git (Repo: `https://github.com/nhuquynhdayyy/ShopTalk`)

### 1. Tạo nhánh riêng (Mỗi thành viên 1 nhánh):

| Thành viên | Tên nhánh | Mô tả |
| :--- | :--- | :--- |
| **THẢO NGUYÊN (The Brain)** | `feature/ai-agora` | Chứa tất cả code về AI, Agora, products.json |
| **THANH PHÚC (The Bank)** | `feature/blockchain-reliability` | Chứa code về verifyPayment, cronjob, idempotency |
| **NGỌC HẬU (The Face)** | `feature/frontend-ui` | Chứa code về Frontend, Chat Widget, Dashboard |

### 2. Quy trình push code:
```bash
# Bước 1: Clone repo (nếu chưa clone)
git clone https://github.com/nhuquynhdayyy/ShopTalk.git
cd ShopTalk

# Bước 2: Checkout sang nhánh của mình
git checkout -b [tên-nhánh-của-mình]
# Ví dụ: git checkout -b feature/ai-agora

# Bước 3: Code, chỉnh sửa file...

# Bước 4: Stage và commit code (Viết commit message rõ ràng)
git add .
git commit -m "[Tên thành viên]: [Mô tả ngắn gọn thay đổi]"
# Ví dụ: git commit -m "A: Hoàn thiện products.json và fuzzy search"

# Bước 5: Push code lên repo
git push origin [tên-nhánh-của-mình]
# Ví dụ: git push origin feature/ai-agora
```

### 3. Lưu ý quan trọng:
*   **LUÔN** pull code mới nhất từ `main` trước khi bắt đầu code để tránh conflict:
    ```bash
    git checkout main
    git pull origin main
    git checkout [tên-nhánh-của-mình]
    git merge main
    ```
*   Commit message phải rõ ràng, viết bằng tiếng Việt hoặc tiếng Anh đều được, miễn dễ hiểu.
*   **Không** push code trực tiếp lên nhánh `main`.
*   Sau khi push xong, tạo Pull Request (PR) và thông báo cho team.
