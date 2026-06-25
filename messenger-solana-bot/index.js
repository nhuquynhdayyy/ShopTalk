require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { generatePaymentQR } = require('./solanaPay');
const { sendTextMessage, sendQRImage } = require('./messenger');

const app = express();
const PORT = process.env.PORT || 3000;

// Sử dụng body-parser để parse dữ liệu JSON từ Facebook gửi về
app.use(bodyParser.json());

/**
 * Hàm phân tích số tiền từ tin nhắn của khách hàng.
 * Tìm số thực hoặc số nguyên xuất hiện đầu tiên.
 * Mặc định trả về 0.1 SOL nếu không tìm thấy số nào.
 * 
 * @param {string} text - Tin nhắn của khách hàng
 * @returns {number} Số tiền đã parse được
 */
function parseAmountFromText(text) {
  if (!text) return 0.1;
  
  // Tìm kiếm số nguyên hoặc số thập phân trong tin nhắn (ví dụ: "0.5", "10", "1.25")
  const match = text.match(/\b\d+(?:\.\d+)?\b/);
  if (match) {
    const amount = parseFloat(match[0]);
    if (!isNaN(amount) && amount > 0) {
      return amount;
    }
  }
  return 0.1; // Mặc định là 0.1 SOL nếu không phân tích được
}

// Endpoint kiểm tra trạng thái hoạt động của server
app.get('/', (req, res) => {
  res.send('Solana Pay Messenger Bot đang hoạt động!');
});

/**
 * GET /webhook: Dùng để xác thực webhook với Meta Developer Console
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const localVerifyToken = process.env.VERIFY_TOKEN || 'mytoken123';

  if (mode && token) {
    if (mode === 'subscribe' && token === localVerifyToken) {
      console.log('[Webhook] Xác thực thành công với Meta!');
      res.status(200).send(challenge);
    } else {
      console.log('[Webhook] Xác thực thất bại! Verify Token không chính xác.');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

/**
 * POST /webhook: Nhận các sự kiện từ Facebook Messenger
 */
app.post('/webhook', (req, res) => {
  const body = req.body;

  // Kiểm tra xem đây có phải là sự kiện từ trang Facebook hay không
  if (body.object === 'page') {
    // Phản hồi ngay lập tức với mã 200 OK để Facebook biết đã nhận tin nhắn, tránh bị retry liên tục
    res.status(200).send('EVENT_RECEIVED');

    // Duyệt qua từng entry (Facebook có thể gộp nhiều sự kiện vào một request)
    body.entry.forEach(async (entry) => {
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          // Bỏ qua tin nhắn dạng echo (tin nhắn của chính page gửi đi)
          // Chỉ xử lý tin nhắn text hợp lệ của người dùng gửi đến
          if (webhookEvent.message && !webhookEvent.message.is_echo && webhookEvent.message.text) {
            const senderPsid = webhookEvent.sender.id;
            const messageText = webhookEvent.message.text;

            console.log(`\n[Webhook] Đã nhận tin nhắn từ khách hàng (PSID: ${senderPsid}): "${messageText}"`);

            try {
              // 1. Parse số tiền từ tin nhắn (ví dụ: "mua áo 0.5 SOL" -> 0.5)
              const amount = parseAmountFromText(messageText);
              console.log(`[Process] Số tiền phân tích được: ${amount} SOL`);

              // 2. Tạo Solana Pay URL và QR Code dạng PNG Image Buffer
              const { url, qrBuffer } = await generatePaymentQR(amount);

              // 3. Gửi ảnh QR Code về Messenger cho khách hàng (dạng multipart/form-data upload)
              await sendQRImage(senderPsid, qrBuffer);

              // 4. Gửi kèm tin nhắn văn bản giải thích và hướng dẫn thanh toán
              const guideText = `Scan QR này bằng ví Phantom để thanh toán ${amount} SOL nhé!\n\n(Hoặc click vào link để thanh toán nếu dùng trình duyệt có ví: ${url})`;
              await sendTextMessage(senderPsid, guideText);

              console.log(`[Process] Đã hoàn thành gửi yêu cầu thanh toán ${amount} SOL cho ${senderPsid}\n`);
            } catch (err) {
              console.error(`[Process] Lỗi khi xử lý tin nhắn của ${senderPsid}:`, err);
              // Phản hồi lại khách hàng về sự cố
              try {
                await sendTextMessage(senderPsid, "Rất tiếc, đã có lỗi xảy ra khi tạo mã QR Solana Pay. Vui lòng thử lại sau.");
              } catch (sendErr) {
                console.error("[Process] Không thể gửi tin nhắn báo lỗi đến khách hàng:", sendErr.message);
              }
            }
          }
        }
      }
    });
  } else {
    // Trả về 404 nếu request không phải từ page
    res.sendStatus(404);
  }
});

// Khởi chạy Express Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Server đang chạy tại port: ${PORT}`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`======================================================\n`);
});
