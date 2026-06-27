const express = require('express');
const router = express.Router();
const { encodeURL } = require('@solana/pay');
const { PublicKey } = require('@solana/web3.js');
const QRCode = require('qrcode');
const BigNumber = require('bignumber.js');
const Groq = require('groq-sdk');

// 1. Cấu hình danh sách sản phẩm và in-memory session quản lý trạng thái đơn hàng của từng khách hàng (PSID)
const PRODUCTS = [
  { name: "Áo thun basic", price: 0.05 },   // Giá trị tính bằng SOL
  { name: "Áo hoodie", price: 0.1 },
  { name: "Quần jean", price: 0.12 },
  { name: "Váy hoa", price: 0.08 }
];

const sessions = {};

// 2. Base URL của Facebook Graph API
const GRAPH_API_VERSION = 'v20.0';
const FACEBOOK_GRAPH_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Gửi tin nhắn văn bản thông thường tới người dùng Messenger
 */
async function sendTextMessage(recipientId, text) {
  try {
    const accessToken = process.env.PAGE_ACCESS_TOKEN;
    if (!accessToken || accessToken.includes('your_facebook_page_access_token_here')) {
      throw new Error("Chưa cấu hình PAGE_ACCESS_TOKEN trong file .env");
    }

    const response = await fetch(
      `${FACEBOOK_GRAPH_URL}/me/messages?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: text }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Facebook API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    console.log(`[Facebook API] Gửi tin nhắn text thành công tới ${recipientId}. Message ID: ${data.message_id}`);
    return data;
  } catch (error) {
    console.error(`[Facebook API] Lỗi khi gửi tin nhắn text tới ${recipientId}:`, error.message);
    throw error;
  }
}

/**
 * Upload ảnh QR code lên Facebook Attachment API và gửi về cho khách hàng
 */
async function sendQRImage(recipientId, qrBuffer) {
  try {
    const accessToken = process.env.PAGE_ACCESS_TOKEN;
    if (!accessToken || accessToken.includes('your_facebook_page_access_token_here')) {
      throw new Error("Chưa cấu hình PAGE_ACCESS_TOKEN trong file .env");
    }

    console.log(`[Facebook API] Đang upload ảnh QR code lên Facebook Message Attachments...`);
    
    const form = new FormData();
    form.append('message', JSON.stringify({
      attachment: {
        type: 'image',
        payload: {
          is_reusable: true
        }
      }
    }));

    // Tạo blob từ Buffer để append vào FormData dùng global fetch
    const blob = new Blob([qrBuffer], { type: 'image/png' });
    form.append('filedata', blob, 'solana-pay-qr.png');

    const uploadResponse = await fetch(
      `${FACEBOOK_GRAPH_URL}/me/message_attachments?access_token=${accessToken}`,
      {
        method: 'POST',
        body: form
      }
    );

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Facebook Upload API error: ${uploadResponse.status} ${errText}`);
    }

    const uploadData = await uploadResponse.json();
    const attachmentId = uploadData.attachment_id;
    console.log(`[Facebook API] Upload ảnh thành công. attachment_id: ${attachmentId}`);

    console.log(`[Facebook API] Đang gửi tin nhắn đính kèm QR code tới khách hàng ${recipientId}...`);
    const sendResponse = await fetch(
      `${FACEBOOK_GRAPH_URL}/me/messages?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: 'image',
              payload: {
                attachment_id: attachmentId
              }
            }
          }
        })
      }
    );

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      throw new Error(`Facebook Send Attachment error: ${sendResponse.status} ${errText}`);
    }

    const sendData = await sendResponse.json();
    console.log(`[Facebook API] Đã gửi ảnh QR code thành công. Message ID: ${sendData.message_id}`);
    return sendData;
  } catch (error) {
    console.error(`[Facebook API] Lỗi khi gửi ảnh QR tới ${recipientId}:`, error.message);
    throw error;
  }
}

/**
 * Tạo Solana Pay URL và chuyển đổi nó thành QR Code dưới dạng Image Buffer (PNG)
 */
async function generatePaymentQR(amount) {
  try {
    const merchantWalletStr = process.env.MERCHANT_WALLET;
    if (!merchantWalletStr || merchantWalletStr.includes('your_solana_wallet_address_here')) {
      throw new Error("Chưa cấu hình địa chỉ ví MERCHANT_WALLET hợp lệ trong file .env");
    }

    const recipient = new PublicKey(merchantWalletStr);
    const solAmount = new BigNumber(amount);
    const label = 'ShopTalk Store';
    const message = `Thanh toan don hang ${amount} SOL`;
    const memo = `ST-${Date.now()}`;

    const url = encodeURL({
      recipient,
      amount: solAmount,
      label,
      message,
      memo
    });

    console.log(`[Solana Pay] Đã tạo URL thanh toán: ${url.toString()}`);

    const qrBuffer = await QRCode.toBuffer(url.toString(), {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return {
      url: url.toString(),
      qrBuffer
    };
  } catch (error) {
    console.error("Lỗi trong quá trình tạo Solana Pay QR:", error);
    throw error;
  }
}

/**
 * Gửi lịch sử hội thoại và trạng thái session hiện tại lên Groq AI để phân tích thực thể và ý định.
 */
async function analyzeConversation(history, currentSession) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.includes('your_groq_api_key_here')) {
      throw new Error("Chưa cấu hình GROQ_API_KEY hợp lệ trong file .env");
    }

    const groq = new Groq({ apiKey });

    const systemPrompt = `Bạn là trợ lý bán hàng tự động (AI Assistant) vô cùng thân thiện của Queen Shop.
Nhiệm vụ của bạn là tư vấn sản phẩm, thu thập đầy đủ thông tin giao hàng của khách và hướng dẫn thanh toán qua Solana Pay.

Đây là danh sách sản phẩm mẫu của Queen Shop:
${PRODUCTS.map(p => `- ${p.name}: ${p.price} SOL`).join('\n')}

Trạng thái thông tin đơn hàng hiện tại của khách hàng này (lưu từ session bộ nhớ):
- Sản phẩm đã chọn: ${currentSession.productName || 'Chưa chọn'}
- Tên khách hàng: ${currentSession.customerName || 'Chưa có'}
- Số điện thoại: ${currentSession.phone || 'Chưa có'}
- Địa chỉ nhận hàng: ${currentSession.address || 'Chưa có'}

HƯỚNG DẪN XỬ LÝ VÀ PHẢN HỒI:
1. Phân tích tin nhắn của khách hàng và xác định "intent" (ý định):
   - "greeting": Chào hỏi ban đầu khi khách bắt đầu chat.
   - "browse": Khách muốn hỏi danh sách sản phẩm, giá cả, hoặc tìm hiểu shop có gì.
   - "order": Khách muốn đặt hàng, hoặc đang cung cấp các thông tin giao hàng (Tên, SĐT, Địa chỉ). Bạn cần dẫn dắt khách hàng cung cấp từng thông tin một cách tự nhiên.
   - "confirm": Khách hàng đồng ý chốt đơn hàng và tiến hành thanh toán (ví dụ khách nhắn: "Xác nhận", "Đúng rồi", "Thanh toán đi", "Mua", v.v.) SAU KHI tất cả thông tin đơn hàng (Sản phẩm + Tên + SĐT + Địa chỉ) đã được thu thập đầy đủ.
   - "other": Câu hỏi ngoài lề không liên quan.

2. Trích xuất thông tin (Entity Extraction) từ tin nhắn mới nhất để cập nhật đơn hàng:
   - "product": Tìm kiếm xem khách hàng có chỉ định sản phẩm cụ thể nào thuộc danh sách trên không. Trả về đúng tên sản phẩm ở danh sách (ví dụ: "Áo hoodie") hoặc null.
   - "customerName": Trích xuất tên của khách nếu khách giới thiệu hoặc cung cấp thông tin giao hàng.
   - "phone": Trích xuất số điện thoại (chuỗi số).
   - "address": Trích xuất địa chỉ giao nhận.
   * LƯU Ý: Nếu các thông tin này đã có trong trạng thái đơn hàng hiện tại ở trên, hãy GIỮ NGUYÊN trừ khi khách hàng nói rõ họ muốn thay đổi thông tin đó.

3. Tạo phản hồi "reply" bằng tiếng Việt:
   - Nếu khách chưa chọn sản phẩm: Giới thiệu các sản phẩm của shop kèm mức giá SOL.
   - Nếu đã chọn sản phẩm nhưng thiếu thông tin giao hàng: Hãy hỏi một cách lịch sự để lấy thông tin còn thiếu tiếp theo (Hỏi Tên trước -> sau đó đến SĐT -> sau đó đến Địa chỉ). Không hỏi dồn dập cùng lúc.
   - Nếu đã đủ tất cả thông tin đơn hàng: Tóm tắt lại đơn hàng (Sản phẩm, Giá, Tên khách, SĐT, Địa chỉ) và hỏi khách có "Xác nhận" để chuyển sang thanh toán hay không.
   - Nếu khách đồng ý xác nhận đơn và thông tin đã hoàn tất đầy đủ: Ghi nhận intent = "confirm", viết câu reply ngắn gọn báo rằng bot đang gửi mã QR Solana Pay để thanh toán.

QUY TẮC PHẢN HỒI BẮT BUỘC:
Bạn chỉ được trả về duy nhất một chuỗi JSON hợp lệ. KHÔNG bọc JSON trong khối mã markdown (\`\`\`json ... \`\`\`), không viết thêm lời dẫn giải thích hay bất cứ văn bản nào bên ngoài JSON.

Cấu trúc JSON phản hồi như sau:
{
  "intent": "greeting|browse|order|confirm|other",
  "product": "Tên sản phẩm (hoặc null)",
  "customerName": "Tên khách hàng (hoặc null)",
  "phone": "Số điện thoại (hoặc null)",
  "address": "Địa chỉ giao nhận (hoặc null)",
  "reply": "Nội dung phản hồi gửi tới khách hàng"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ];

    console.log(`[Groq] Đang gọi model llama-3.3-70b-versatile để phân tích...`);
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0.2
    });

    const responseContent = completion.choices[0].message.content.trim();
    console.log(`[Groq] Phản hồi JSON nhận được:`, responseContent);

    const parsedResult = JSON.parse(responseContent);
    return parsedResult;
  } catch (error) {
    console.error('[Groq Service] Lỗi khi xử lý hội thoại với Groq:', error);
    throw error;
  }
}

/**
 * GET /webhook: Dùng để xác thực webhook với Meta Developer Console
 */
router.get('/webhook', (req, res) => {
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
router.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');

    body.entry.forEach(async (entry) => {
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          if (webhookEvent.message && !webhookEvent.message.is_echo && webhookEvent.message.text) {
            const senderPsid = webhookEvent.sender.id;
            const messageText = webhookEvent.message.text;

            console.log(`\n[Webhook] Đã nhận tin nhắn từ khách hàng (PSID: ${senderPsid}): "${messageText}"`);

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
            session.history.push({ role: 'user', content: messageText });
            if (session.history.length > 20) {
              session.history = session.history.slice(-20);
            }

            try {
              const analysis = await analyzeConversation(session.history, session);
              const { intent, product, customerName, phone, address, reply } = analysis;

              console.log(`[Groq Analysis] Intent nhận diện: "${intent}"`);
              console.log(`[Groq Analysis] Thông tin trích xuất:`, { product, customerName, phone, address });

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

              if (intent === 'confirm') {
                const isDataComplete = session.productName && session.price && session.customerName && session.phone && session.address;

                if (isDataComplete) {
                  await sendTextMessage(senderPsid, reply);

                  console.log(`[Process] Đang khởi tạo mã thanh toán Solana Pay cho ${session.productName} giá ${session.price} SOL...`);
                  const { url, qrBuffer } = await generatePaymentQR(session.price);

                  await sendQRImage(senderPsid, qrBuffer);

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

                  console.log(`[Process] Đã gửi thông tin thanh toán cho ${senderPsid}. Xóa session.`);
                  delete sessions[senderPsid];
                } else {
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
                await sendTextMessage(senderPsid, reply);
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

module.exports = router;
