const express = require('express');
const router = express.Router();
const { generateRtcToken } = require('../services/agora.service');
const {
  groq,
  SYSTEM_PROMPT,
  OPENAI_TOOLS,
  executeTool
} = require('../services/ai.service');

/**
 * 1. Handler tạo Token cho Frontend (Sửa lỗi 404 và ReferenceError)
 */
const tokenHandler = (req, res) => {
  try {
    const { channelName, uid, role } = req.method === 'GET' ? req.query : req.body;

    if (!channelName) {
      return res.status(400).json({ success: false, error: 'channelName is required' });
    }

    const userUid = uid !== undefined && uid !== null && uid !== '' ? (Number(uid) || 0) : 0;
    const userRole = role !== undefined && role !== null && role !== '' ? role : 'PUBLISHER';

    const token = generateRtcToken(channelName, userUid, userRole);

    return res.status(200).json({
      token,
      channelName,
      uid: userUid,
      appId: process.env.AGORA_APP_ID
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 2. Hàm lọc sạch dữ liệu rác (metadata) để Agora không báo lỗi 400
 */
const cleanResponse = (groqData) => {
  return {
    id: groqData.id,
    object: "chat.completion",
    created: groqData.created,
    model: groqData.model,
    choices: groqData.choices.map(c => ({
      message: {
        role: c.message.role,
        content: c.message.content || "",
        // Giữ lại tool_calls nếu có để Agora biết AI đang gọi hàm
        ...(c.message.tool_calls ? { tool_calls: c.message.tool_calls } : {})
      },
      index: c.index,
      finish_reason: c.finish_reason
    })),
    usage: groqData.usage
  };
};

/**
 * Handler xử lý Webhook từ Agora Conversational AI
 * Tối ưu cho Voice: Trả lời ngắn, không markdown, hỗ trợ Tools
 */
/**
 * Hàm gọi LLM để phân tích hội thoại voice
 */
const detectVoiceOrder = async (messages) => {
  try {
    const recentMessages = messages.filter(m => m.role !== 'system').slice(-30);
    const prompt = `Phân tích lịch sử trò chuyện bằng giọng nói giữa khách hàng (user) và trợ lý bán hàng (assistant) để trích xuất thông tin đặt đơn hàng.
Hãy trả về một đối tượng JSON duy nhất (không có mã markdown hay ký tự thừa nào khác ngoài JSON):
{
  "hasBuyIntent": <true/false, khách hàng đã xác nhận đồng ý/chốt mua hàng>,
  "hasName": <true/false, khách hàng đã cung cấp tên người nhận cụ thể>,
  "hasPhone": <true/false, khách hàng đã cung cấp số điện thoại liên hệ cụ thể>,
  "hasAddress": <true/false, khách hàng đã cung cấp địa chỉ giao hàng cụ thể>,
  "productName": <tên sản phẩm khách chọn mua, ví dụ "Solana Mobile Saga v2", "Tai nghe TWS Blockchain Edition", hoặc null nếu không rõ>,
  "amount": <giá sản phẩm (number), ví dụ 0.1, 35, hoặc null nếu không rõ>,
  "customerName": <tên người nhận đã cung cấp, hoặc null nếu không rõ>,
  "customerPhone": <số điện thoại liên hệ đã cung cấp, hoặc null nếu không rõ>,
  "customerAddress": <địa chỉ giao hàng đã cung cấp, hoặc null nếu không rõ>
}

Bản đồ sản phẩm & giá mặc định để tham khảo:
- "Solana Mobile Saga Phone": 0.1
- "Solana Mobile Saga v2": 0.1
- "ShopTalk T-Shirt": 0.1
- "Ốp lưng Saga Phone trong suốt": 8.0
- "Cáp sạc USB-C 1m": 5.0
- "Củ sạc nhanh 65W GaN": 18.0
- "Tai nghe TWS Blockchain Edition": 35.0
- "Mũ lưỡi trai ShopTalk": 12.0
- "Áo hoodie Crypto Dev": 28.0
- "Ledger Nano S Plus": 79.0
- "Sticker Pack Web3": 3.0
- "Balo Laptop Crypto": 45.0
- "Phantom Wallet Keychain": 6.0`;

    const chatCompletion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify(recentMessages.map(m => ({ role: m.role, content: m.content }))) }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const resultText = chatCompletion.choices[0]?.message?.content;
    console.log(`[LLM Detect] Result: ${resultText}`);
    return JSON.parse(resultText);
  } catch (error) {
    console.error('[LLM Detect] Lỗi phân tích đơn hàng qua voice:', error);
    return null;
  }
};

/**
 * Hàm fallback phân tích hội thoại voice bằng regex/keywords
 */
const fallbackDetectVoiceOrder = (messages) => {
  const allContent = messages.map(m => m.content).join(' ').toLowerCase();
  const hasBuyIntent = allContent.includes('mua') || allContent.includes('đặt hàng') || allContent.includes('chốt') || allContent.includes('chot') || allContent.includes('order');

  let customerName = null;
  let customerPhone = null;
  let customerAddress = null;
  let productName = 'Solana Mobile Saga v2';
  let amount = 0.1;

  if (allContent.includes('tai nghe')) {
    productName = 'Tai nghe TWS Blockchain Edition';
    amount = 35.0;
  } else if (allContent.includes('ao thun') || allContent.includes('áo thun') || allContent.includes('t-shirt')) {
    productName = 'ShopTalk T-Shirt';
    amount = 0.1;
  } else if (allContent.includes('hoodie')) {
    productName = 'Áo hoodie Crypto Dev';
    amount = 28.0;
  } else if (allContent.includes('op lung') || allContent.includes('ốp lưng')) {
    productName = 'Ốp lưng Saga Phone trong suốt';
    amount = 8.0;
  } else if (allContent.includes('cap sac') || allContent.includes('cáp sạc')) {
    productName = 'Cáp sạc USB-C 1m';
    amount = 5.0;
  } else if (allContent.includes('ledger')) {
    productName = 'Ledger Nano S Plus';
    amount = 79.0;
  }

  for (let i = 0; i < messages.length - 1; i++) {
    const current = messages[i];
    const next = messages[i + 1];
    if (current.role === 'assistant' && next.role === 'user') {
      const currentLower = current.content.toLowerCase();
      if (currentLower.includes('tên người nhận') || currentLower.includes('cho em biết tên') || currentLower.includes('xin tên') || currentLower.includes('họ và tên')) {
        customerName = next.content.replace(/tên (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').trim();
      }
      if (currentLower.includes('số điện thoại') || currentLower.includes('sđt') || currentLower.includes('so dien thoai') || currentLower.includes('sdt') || currentLower.includes('liên hệ')) {
        customerPhone = next.content.replace(/số điện thoại (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').trim();
      }
      if (currentLower.includes('địa chỉ') || currentLower.includes('cho em biết địa chỉ') || currentLower.includes('xin địa chỉ') || currentLower.includes('giao hàng')) {
        customerAddress = next.content.replace(/địa chỉ (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').trim();
      }
    }
  }

  // Regex to match a standard 10-digit phone number in Vietnam
  const phoneRegex = /(0[3|5|7|8|9]+[0-9]{8})\b/;
  const matchPhone = allContent.match(phoneRegex);
  if (matchPhone && !customerPhone) {
    customerPhone = matchPhone[1];
  }

  return {
    hasBuyIntent,
    hasName: !!customerName,
    hasPhone: !!customerPhone,
    hasAddress: !!customerAddress,
    productName,
    amount,
    customerName,
    customerPhone,
    customerAddress
  };
};

/**
 * Handler xử lý Webhook từ Agora Conversational AI
 * Tối ưu cho Voice: Trả lời ngắn, không markdown, hỗ trợ Tools
 */
const llmWebhookHandler = async (req, res) => {
  try {
    const { messages: reqMessages, stream } = req.body;
    if (!reqMessages) return res.status(400).json({ error: 'No messages' });

    const sessionId = req.query.sessionId || req.body.sessionId || req.body.channel;

    // Emit user's transcript immediately to the chat screen
    if (sessionId) {
      const lastUserMsg = [...reqMessages].reverse().find(msg => msg.role === 'user');
      if (lastUserMsg && lastUserMsg.content) {
        const { emitTranscriptReceived } = require('../websocket/socket.server');
        emitTranscriptReceived({
          sessionId,
          sender: 'user',
          transcript: lastUserMsg.content,
          type: 'voice',
          id: 'user-' + Date.now()
        });
      }
    }

    // Lọc metadata Agora thêm vào, Groq không chấp nhận
    let messages = reqMessages.map(msg => {
      const clean = { role: msg.role, content: msg.content || '' };
      if (msg.tool_calls) clean.tool_calls = msg.tool_calls;
      if (msg.tool_call_id) {
        clean.tool_call_id = msg.tool_call_id;
        clean.name = msg.name;
      }
      return clean;
    });

    // Đảm bảo có system prompt
    if (!messages.some(msg => msg.role === 'system')) {
      messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
    }

    // Thêm instruction voice ngay sau system prompt (index 1)
    messages.splice(1, 0, {
      role: 'system',
      content: `QUAN TRỌNG - ĐÂY LÀ GIAO DIỆN GIỌNG NÓI:
- Trả lời NGẮN GỌN, tối đa 2-3 câu ngắn
- TUYỆT ĐỐI không viết backtick, markdown, code, tên function như check_inventory hay create_order
- DANH SÁCH SẢN PHẨM & GIÁ CỦA CỬA HÀNG (TUYỆT ĐỐI nói đúng giá này):
  + Solana Mobile Saga Phone (Saga v1): 0.1 USDC
  + Solana Mobile Saga v2: 0.1 USDC
  + ShopTalk T-Shirt: 0.1 USDC
  + Ốp lưng Saga Phone trong suốt: 8 USDC
  + Cáp sạc USB-C 1m: 5 USDC
  + Củ sạc nhanh 65W GaN: 18 USDC
  + Tai nghe TWS Blockchain Edition: 35 USDC
  + Mũ lưỡi trai ShopTalk: 12 USDC
  + Áo hoodie Crypto Dev: 28 USDC
  + Ledger Nano S Plus: 79 USDC
  + Sticker Pack Web3: 3 USDC
  + Balo Laptop Crypto: 45 USDC
  + Phantom Wallet Keychain: 6 USDC
- Hỏi từng thông tin một, không hỏi cùng lúc: hỏi họ và tên trước, sau đó hỏi số điện thoại, sau đó mới hỏi địa chỉ giao hàng.
- Chờ khách trả lời xong từng câu rồi mới hỏi thông tin tiếp theo.
- Quy trình thu thập thông tin khi khách đồng ý mua/chốt đơn:
  1. Hỏi họ và tên: "Dạ anh/chị cho em xin họ và tên người nhận ạ?"
  2. Sau khi có tên, hỏi số điện thoại: "Dạ anh/chị cho em xin số điện thoại liên hệ ạ?"
  3. Sau khi có số điện thoại, hỏi địa chỉ giao hàng: "Dạ anh/chị cho em xin địa chỉ giao hàng ạ?"
- Khi đã nhận đủ cả 3 thông tin (Họ tên + Số điện thoại + Địa chỉ), Trợ lý ảo sẽ dừng lại để hệ thống tạo đơn hàng.`
    });

    // Kiểm tra xem khách đã đặt đơn chưa để tránh duplicate order
    const allContentLower = messages.map(m => m.content).join(' ').toLowerCase();
    const alreadyCreated = allContentLower.includes('da em da ghi nhan thong tin, anh chi vui long nhin vao cua so chat') ||
      allContentLower.includes('dạ em đã ghi nhận thông tin, anh chị vui lòng nhìn vào cửa sổ chat');

    if (!alreadyCreated) {
      let detection = await detectVoiceOrder(messages);
      if (!detection) {
        detection = fallbackDetectVoiceOrder(messages);
      } else {
        const fallback = fallbackDetectVoiceOrder(messages);
        if (!detection.customerName && fallback.customerName) {
          detection.customerName = fallback.customerName;
          detection.hasName = true;
        }
        if (!detection.customerPhone && fallback.customerPhone) {
          detection.customerPhone = fallback.customerPhone;
          detection.hasPhone = true;
        }
        if (!detection.customerAddress && fallback.customerAddress) {
          detection.customerAddress = fallback.customerAddress;
          detection.hasAddress = true;
        }
      }

      if (detection && detection.hasBuyIntent && detection.hasName && detection.hasPhone && detection.hasAddress) {
        console.log('[LLM Webhook] Phát hiện đủ thông tin đặt hàng qua voice:', detection);

        const { createOrder } = require('../models/order.model');
        const { createPaymentRequest, generateQRCode } = require('../services/solanaPay.service');
        const { Keypair } = require('@solana/web3.js');

        const referenceKey = Keypair.generate().publicKey.toBase58();
        const detectedProductName = detection.productName || 'Solana Mobile Saga v2';
        const detectedAmount = detection.amount || 0.1;
        const detectedName = detection.customerName || 'Khách mua qua Voice';
        const detectedPhone = detection.customerPhone || 'Chưa cung cấp';
        const detectedAddress = detection.customerAddress || 'Chưa cung cấp';

        // Tạo đơn hàng
        const order = await createOrder({
          reference: referenceKey,
          product_name: detectedProductName,
          amount: detectedAmount,
          seller_wallet: process.env.SELLER_WALLET || '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ',
          status: 'pending',
          customer_name: detectedName,
          customer_phone: detectedPhone,
          customer_address: detectedAddress
        });

        const paymentUrl = createPaymentRequest(order);
        const qrCodeImage = await generateQRCode(paymentUrl);

        // Emit WebSocket để frontend hiển thị QR
        const { getIo } = require('../websocket/socket.server');
        const io = getIo();
        if (io) {
          io.emit('voice_order_created', {
            orderId: order.id,
            productName: order.product_name,
            amount: order.amount,
            qrCodeImage,
            customerName: detectedName,
            customerPhone: detectedPhone,
            customerAddress: detectedAddress,
            sellerWallet: order.seller_wallet
          });
          console.log(`[Socket.io] 📢 Đã phát sự kiện 'voice_order_created' cho đơn #${order.id}`);
        } else {
          console.warn('[Socket.io] ⚠️ getIo() trả về null, không thể phát sự kiện voice_order_created');
        }

        const speakText = 'Dạ em đã ghi nhận thông tin, anh chị vui lòng nhìn vào cửa sổ chat để xem mã QR thanh toán nhé!';

        // Emit AI assistant response for voice order created success
        if (sessionId) {
          const assistantMsgId = 'ai-order-' + Date.now();
          const { emitTranscriptReceived } = require('../websocket/socket.server');
          emitTranscriptReceived({
            sessionId,
            sender: 'assistant',
            transcript: speakText,
            type: 'voice',
            id: assistantMsgId
          });
        }

        // Override response to stream/return the static speech
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          const chunk1 = {
            id: 'voice-order-' + Date.now(),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'llama-3.1-8b-instant',
            choices: [
              {
                index: 0,
                delta: {
                  content: speakText
                },
                finish_reason: null
              }
            ]
          };
          res.write(`data: ${JSON.stringify(chunk1)}\n\n`);

          const chunk2 = {
            id: 'voice-order-' + Date.now(),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'llama-3.1-8b-instant',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }
            ]
          };
          res.write(`data: ${JSON.stringify(chunk2)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        } else {
          return res.json({
            id: 'voice-order-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'llama-3.1-8b-instant',
            choices: [{
              message: {
                role: 'assistant',
                content: speakText
              },
              index: 0,
              finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          });
        }
      }
    }

    console.log(`[LLM Webhook] Gọi Groq với ${messages.length} messages, stream=${!!stream}`);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: messages,
        max_tokens: 100,
        temperature: 0.6,
        stream: true
      });

      let fullContent = '';
      const assistantMsgId = 'ai-' + Date.now();

      for await (const chunk of streamResponse) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          if (sessionId) {
            const { emitTranscriptReceived } = require('../websocket/socket.server');
            emitTranscriptReceived({
              sessionId,
              sender: 'assistant',
              transcript: fullContent,
              type: 'voice',
              id: assistantMsgId
            });
          }
        }
        const data = JSON.stringify(chunk);
        res.write(`data: ${data}\n\n`);
      }

      console.log('[LLM Webhook] Stream xong, content:', fullContent);
      res.write('data: [DONE]\n\n');
      res.end();

    } else {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: messages,
        max_tokens: 100,
        temperature: 0.6,
      });

      const content = response.choices[0].message.content;
      console.log('[LLM Webhook] Groq trả về:', content);

      if (sessionId) {
        const assistantMsgId = 'ai-' + Date.now();
        const { emitTranscriptReceived } = require('../websocket/socket.server');
        emitTranscriptReceived({
          sessionId,
          sender: 'assistant',
          transcript: content,
          type: 'voice',
          id: assistantMsgId
        });
      }

      return res.json(cleanResponse(response));
    }

  } catch (error) {
    console.error('[LLM Webhook Error]:', error.message);
    if (!res.headersSent) {
      const fallbackContent = 'Dạ, anh chị đang quan tâm sản phẩm gì ạ?';

      const currentSessionId = req.query.sessionId || req.body.sessionId || req.body.channel;
      if (currentSessionId) {
        const assistantMsgId = 'ai-fallback-' + Date.now();
        const { emitTranscriptReceived } = require('../websocket/socket.server');
        emitTranscriptReceived({
          sessionId: currentSessionId,
          sender: 'assistant',
          transcript: fallbackContent,
          type: 'voice',
          id: assistantMsgId
        });
      }

      return res.json({
        id: 'fallback-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'llama-3.1-8b-instant',
        choices: [{
          message: {
            role: 'assistant',
            content: fallbackContent
          },
          index: 0,
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      });
    }
  }
};

// ĐĂNG KÝ CÁC ROUTE
router.get('/token', tokenHandler);
router.post('/token', tokenHandler);
router.post('/llm-webhook', llmWebhookHandler);

// Đăng ký fallback cho /api/agora/
router.get('/', tokenHandler);
router.post('/', tokenHandler);

module.exports = router;