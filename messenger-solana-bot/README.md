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
Nếu muốn kiểm tra nhanh logic tạo Solana Pay URL và QR Code mà không cần cấu hình Facebook Webhook:
1. Mở terminal tại thư mục dự án và chạy:
   ```bash
   node test-qr.js
   ```
2. Dự án sẽ tự động dùng địa chỉ ví Solana test công cộng để sinh URL Solana Pay và lưu ảnh QR code tại file `test-qr.png` ngay trong thư mục này.
3. Bạn có thể mở ảnh `test-qr.png` và dùng ví Phantom trên điện thoại quét để kiểm tra thử.

## ⚡ Thử nghiệm hoạt động thực tế với Messenger (Flow kiểm tra)
1. Mở Messenger của Facebook Page bạn đã tích hợp bot.
2. Gửi một tin nhắn bất kỳ có chứa số tiền, ví dụ:
   - *"Mua áo size L - 0.5 SOL"*
   - *"0.02"*
   - *"thanh toan 0.1"*
3. Server nhận được tin nhắn từ Webhook:
   - Nó phân tích số tiền (nếu không tìm thấy số nào, bot sẽ tự động nhận giá trị mặc định là `0.1 SOL`).
   - Nó tạo Solana Pay URL với địa chỉ nhận tiền là `MERCHANT_WALLET`.
   - Sinh QR Code dưới dạng file ảnh Buffer.
   - Gọi Messenger Upload API gửi ảnh QR trực tiếp vào ô chat.
   - Gửi tiếp tin nhắn text hướng dẫn: *"Scan QR này bằng ví Phantom để thanh toán [amount] SOL nhé!"*.
4. Bạn mở ứng dụng ví **Phantom** trên điện thoại (đã chuyển sang mạng Devnet/Mainnet tương ứng với cấu hình ví của bạn), nhấn nút quét QR ở góc trên và quét QR code được gửi trong Messenger để thanh toán.

