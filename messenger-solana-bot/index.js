require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { generatePaymentQR } = require('./solanaPay');
const { sendTextMessage, sendQRImage } = require('./messenger');
const { analyzeConversation, PRODUCTS } = require('./groqService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// In-memory session quản lý trạng thái đơn hàng và lịch sử chat của từng PSID
const sessions = {};

// Endpoint kiểm tra trạng thái hoạt động của server
app.get('/', (req, res) => {
  res.send('Queen Shop Solana Pay Bot tích hợp Groq AI đang hoạt động!');
});

/**
 * GET /webhook: Dùng để xác thực webhook với Meta Developer Console (Giữ nguyên không thay đổi)
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
 * POST /webhook: Nhận và xử lý tin nhắn của khách hàng từ Facebook Messenger
 */
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    // Trả về 200 OK ngay lập tức cho Facebook để báo đã nhận sự kiện, tránh bị retry liên tục
    res.status(200).send('EVENT_RECEIVED');

    body.entry.forEach(async (entry) => {
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          // Bỏ qua các sự kiện echo (tin nhắn bot tự gửi) và chỉ xử lý tin nhắn văn bản hợp lệ
          if (webhookEvent.message && !webhookEvent.message.is_echo && webhookEvent.message.text) {
            const senderPsid = webhookEvent.sender.id;
            const messageText = webhookEvent.message.text;

            console.log(`\n[Webhook] Đã nhận tin nhắn từ khách hàng (PSID: ${senderPsid}): "${messageText}"`);

            // Khởi tạo session cho khách hàng nếu chưa tồn tại
            if (!sessions[senderPsid]) {
              sessions[senderPsid] = {
                productName: null,
                price: null,
                customerName: null,
                phone: null,
                address: null,
                history: []
              };
            }

            const session = sessions[senderPsid];

            // Thêm tin nhắn của khách hàng vào lịch sử hội thoại
            session.history.push({ role: 'user', content: messageText });
            // Giới hạn độ dài lịch sử hội thoại tránh quá tải tokens của Groq (giữ 20 tin nhắn gần nhất)
            if (session.history.length > 20) {
              session.history = session.history.slice(-20);
            }

            try {
              // 1. Phân tích hội thoại bằng Groq AI
              const analysis = await analyzeConversation(session.history, session);
              const { intent, product, customerName, phone, address, reply } = analysis;

              console.log(`[Groq Analysis] Intent nhận diện: "${intent}"`);
              console.log(`[Groq Analysis] Thông tin trích xuất:`, { product, customerName, phone, address });

              // 2. Đồng bộ hóa thông tin trích xuất từ AI vào Session bộ nhớ
              if (product) {
                session.productName = product;
                const matchedProduct = PRODUCTS.find(p => p.name.toLowerCase() === product.toLowerCase());
                if (matchedProduct) {
                  session.price = matchedProduct.price;
                }
              }
              if (customerName) session.customerName = customerName;
              if (phone) session.phone = phone;
              if (address) session.address = address;

              console.log(`[Session State] Trạng thái hiện tại:`, {
                productName: session.productName,
                price: session.price,
                customerName: session.customerName,
                phone: session.phone,
                address: session.address
              });

              // 3. Xử lý logic dựa trên intent AI trả về
              if (intent === 'confirm') {
                // Kiểm tra xem đã thu thập đủ toàn bộ thông tin đơn hàng chưa
                const isDataComplete = session.productName && session.price && session.customerName && session.phone && session.address;

                if (isDataComplete) {
                  // Gửi lời chào / xác nhận từ AI trước
                  await sendTextMessage(senderPsid, reply);

                  // Tạo Solana Pay QR Code từ giá của sản phẩm trong session
                  console.log(`[Process] Đang khởi tạo mã thanh toán Solana Pay cho ${session.productName} giá ${session.price} SOL...`);
                  const { url, qrBuffer } = await generatePaymentQR(session.price);

                  // Gửi ảnh QR Code lên Messenger
                  await sendQRImage(senderPsid, qrBuffer);

                  // Gửi tóm tắt chi tiết đơn hàng kèm link thanh toán trực tiếp
                  const confirmationMsg = `📋 XÁC NHẬN ĐƠN HÀNG THÀNH CÔNG:\n` +
                    `--------------------------------------\n` +
                    `🛍️ Sản phẩm: ${session.productName}\n` +
                    `💰 Giá trị đơn: ${session.price} SOL\n` +
                    `👤 Người nhận: ${session.customerName}\n` +
                    `📞 Số điện thoại: ${session.phone}\n` +
                    `📍 Địa chỉ giao hàng: ${session.address}\n` +
                    `--------------------------------------\n` +
                    `👉 Quét mã QR ở trên bằng ví Phantom để thanh toán.\n` +
                    `🔗 Link thanh toán trực tiếp: ${url}`;

                  await sendTextMessage(senderPsid, confirmationMsg);

                  // Reset session sau khi chốt đơn thành công để khách hàng có thể mua đơn hàng tiếp theo
                  console.log(`[Process] Đã gửi thông tin thanh toán cho ${senderPsid}. Xóa session.`);
                  delete sessions[senderPsid];
                } else {
                  // Nếu Groq trả về intent 'confirm' nhưng trong session lưu trữ thực tế vẫn bị thiếu trường
                  console.log(`[Process] Intent là confirm nhưng session chưa đủ dữ liệu. Yêu cầu điền thêm.`);
                  const missingFieldsReply = `Mình chưa thu thập đủ thông tin để tạo đơn hàng. Bạn vui lòng cung cấp thêm:\n` +
                    (!session.productName ? `- Chọn sản phẩm (Áo thun basic, Áo hoodie, Quần jean, Váy hoa)\n` : '') +
                    (!session.customerName ? `- Họ và tên của bạn\n` : '') +
                    (!session.phone ? `- Số điện thoại liên hệ\n` : '') +
                    (!session.address ? `- Địa chỉ giao nhận nhận hàng\n` : '') +
                    `Cảm ơn bạn!`;

                  await sendTextMessage(senderPsid, missingFieldsReply);
                  session.history.push({ role: 'assistant', content: missingFieldsReply });
                }
              } else {
                // Với các intent khác (greeting, browse, order, other), gửi tin nhắn AI trả về bình thường
                await sendTextMessage(senderPsid, reply);
                // Lưu phản hồi của trợ lý vào lịch sử trò chuyện
                session.history.push({ role: 'assistant', content: reply });
              }

            } catch (err) {
              console.error(`[Webhook Error] Gặp lỗi khi xử lý tin nhắn của ${senderPsid}:`, err);
              try {
                await sendTextMessage(senderPsid, "Hệ thống đang gặp sự cố khi trò chuyện với AI hoặc tạo mã thanh toán. Bạn vui lòng thử lại sau nhé!");
              } catch (sendErr) {
                console.error("[Webhook Error] Không thể gửi tin nhắn báo lỗi đến khách hàng:", sendErr.message);
              }
            }
          }
        }
      }
    });
  } else {
    res.sendStatus(404);
  }
});

// Khởi chạy Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Queen Shop Bot đang chạy tại port: ${PORT}`);
  console.log(`🔗 Webhook endpoint sẵn sàng nhận dữ liệu`);
  console.log(`======================================================\n`);
});