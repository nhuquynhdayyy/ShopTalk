# Facebook Messenger Solana Pay Chatbot

Bot Facebook Messenger tích hợp Solana Pay viết bằng Node.js & Express. Khi khách hàng nhắn tin vào fanpage, chatbot tự động phân tích số tiền, sinh mã thanh toán Solana Pay dưới dạng QR Code PNG và gửi trực tiếp lại cho khách hàng qua Messenger.

---

## 🛠️ Hướng dẫn cài đặt và chạy local từng bước

### Bước 1: Cài đặt thư viện (Dependencies)
Mở terminal tại thư mục dự án và chạy lệnh sau để cài đặt các gói cần thiết:
```bash
npm install
```

### Bước 2: Tạo và cấu hình file `.env`
Tạo một file `.env` ở thư mục gốc của dự án (hoặc đổi tên file `.env` có sẵn) và cấu hình các biến sau:
```env
# Token tự chế để xác thực webhook (bạn có thể thay đổi tùy ý)
VERIFY_TOKEN=mytoken123

# Access Token của trang Facebook (lấy từ ứng dụng Meta for Developers)
PAGE_ACCESS_TOKEN=your_facebook_page_access_token_here

# Địa chỉ ví Solana của bạn (để nhận tiền từ khách hàng)
MERCHANT_WALLET=your_solana_wallet_address_here

# API Key cho dịch vụ Groq AI
GROQ_API_KEY=your_groq_api_key_here

# Port khởi chạy server
PORT=3000
```

### Bước 3: Chạy ứng dụng Node.js
Khởi động backend server bằng cách chạy lệnh:
```bash
node index.js
```
Hoặc:
```bash
npm start
```
Server sẽ chạy mặc định tại cổng `3000` và hiển thị thông báo:
`🚀 Server đang chạy tại port: 3000`

### Bước 4: Chạy Ngrok để expose Localhost ra Internet công cộng (HTTPS)
Do Facebook yêu cầu callback URL webhook phải chạy trên giao thức `HTTPS`, bạn cần dùng Ngrok để chuyển tiếp kết nối.
Mở một cửa sổ terminal mới và chạy:
```bash
ngrok http 3000
```
Sau khi chạy thành công, Ngrok sẽ hiển thị một URL dạng:
`https://xxxx-xxx-xx-xx.ngrok-free.app`

Hãy copy URL có dạng **`https://`** này.

### Bước 5: Cấu hình Webhook trong Portal Meta for Developers (Facebook Developers)
1. Truy cập vào ứng dụng của bạn trên [Meta for Developers](https://developers.facebook.com/).
2. Thêm sản phẩm **Messenger** vào ứng dụng (nếu chưa có).
3. Tìm đến tab **Messenger** -> **Settings** (Cài đặt) -> phần **Webhooks**.
4. Nhấn **Configure** (Cấu hình) hoặc **Edit Subscription**:
   - **Callback URL**: Nhập URL HTTPS của Ngrok kết hợp thêm đuôi `/webhook` (Ví dụ: `https://xxxx-xxx-xx-xx.ngrok-free.app/webhook`).
   - **Verify Token**: Nhập giá trị trùng khớp với biến `VERIFY_TOKEN` trong file `.env` của bạn (mặc định là `mytoken123`).
5. Nhấn **Verify and Save** (Xác minh và Lưu).
6. Sau khi xác minh thành công, tìm mục **Webhooks Fields** bên dưới, nhấn **Subscribe** vào trường `messages` (và `messaging_postbacks` nếu cần).
7. Ở mục **Access Tokens**, hãy liên kết Page của bạn và lấy Token để điền vào `PAGE_ACCESS_TOKEN` ở file `.env` (nếu chưa điền).

---

## 🧪 Chạy thử nghiệm nhanh (Quick Test)

### 1. Kiểm tra nhanh logic tạo Solana Pay QR
Nếu muốn kiểm tra nhanh logic sinh URL Solana Pay và QR Code độc lập:
1. Mở terminal tại thư mục dự án và chạy:
   ```bash
   node test-qr.js
   ```
2. Dự án sẽ tự động dùng địa chỉ ví Solana test công cộng để sinh URL Solana Pay và lưu ảnh QR code tại file `test-qr.png` ngay trong thư mục này.

### 2. Kiểm tra nhanh logic hội thoại và trích xuất thực thể của Groq AI
Nếu muốn kiểm tra chatbot hội thoại thông minh tự động trích xuất sản phẩm, tên, SĐT, địa chỉ:
1. Cấu hình biến `GROQ_API_KEY` hợp lệ trong file `.env`.
2. Mở terminal tại thư mục dự án và chạy:
   ```bash
   node test-groq.js
   ```
3. Script sẽ giả lập một đoạn hội thoại của khách từ chào hỏi -> chọn sản phẩm Áo hoodie -> cung cấp tên -> cung cấp SĐT, địa chỉ -> xác nhận mua hàng. Bạn sẽ nhìn thấy chi tiết phản hồi của bot và trạng thái session được AI cập nhật theo từng bước.

## ⚡ Thử nghiệm hoạt động thực tế với Messenger (Flow kiểm tra)
1. Mở Messenger của Facebook Page bạn đã tích hợp bot.
2. Gửi lời chào, ví dụ: *"Chào shop"*
   - Bot sẽ tự động chào bạn và giới thiệu danh sách sản phẩm mẫu (Áo thun basic, Áo hoodie, Quần jean, Váy hoa) kèm giá bằng SOL.
3. Chọn một sản phẩm bạn muốn mua, ví dụ: *"Mình muốn mua cái Áo hoodie"*
   - Bot ghi nhận sản phẩm và bắt đầu thu thập thông tin giao hàng: *"Bạn vui lòng cho shop xin Họ tên để làm đơn hàng nhé!"*
4. Cung cấp tên của bạn: *"Mình là Nguyễn Văn B"*
   - Bot ghi nhận tên và hỏi tiếp số điện thoại: *"Cảm ơn bạn B, cho mình xin số điện thoại nhận hàng nhé."*
5. Cung cấp số điện thoại và địa chỉ nhận hàng: *"Số mình là 0912345678, giao tới 234 Trần Hưng Đạo, Quận 1"*
   - Bot nhận diện đầy đủ thông tin, in ra tóm tắt đơn hàng và hỏi bạn có muốn Xác nhận để tiến hành thanh toán hay không.
6. Xác nhận thanh toán đơn hàng: *"Xác nhận mua"*
   - Khi đó, Webhook ghi nhận intent = "confirm", thực hiện tạo Solana Pay QR code dựa trên giá sản phẩm đã chọn (0.1 SOL đối với Áo hoodie).
   - Bot upload ảnh QR code lên Messenger và hiển thị mã QR kèm tóm tắt đơn hàng + link thanh toán trực tiếp.
7. Bạn mở ví **Phantom** trên điện thoại, quét mã QR và xác nhận giao dịch để hoàn tất đơn hàng.
