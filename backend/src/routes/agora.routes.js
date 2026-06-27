const express = require('express');
const router = express.Router();
const { generateRtcToken } = require('../services/agora.service');
const {
  groq,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_EN,
  OPENAI_TOOLS,
  executeTool,
  getSystemPromptForLanguage,
  normalizeLanguage,
  sessionLanguages
} = require('../services/ai.service');
const { getProducts, checkInventory, formatProductCatalogForPrompt } = require('../services/inventory.service');

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

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
const detectVoiceOrder = async (messages, language = 'vi') => {
  try {
    const recentMessages = messages.filter(m => m.role !== 'system').slice(-30);
    
    const products = await getProducts(language);
    const productMap = products
      .map(p => `- "${p.name}": ${p.price_usdc}`)
      .join('\n');
    
    const prompt = `Phân tích lịch sử trò chuyện bằng giọng nói giữa khách hàng (user) và trợ lý bán hàng (assistant) để trích xuất thông tin đặt đơn hàng.
Hãy trả về một đối tượng JSON duy nhất (không có mã markdown hay ký tự thừa nào khác ngoài JSON):
{
  "hasBuyIntent": <true/false, khách hàng đã xác nhận đồng ý/chốt mua hàng>,
  "hasName": <true/false, khách hàng đã cung cấp tên người nhận cụ thể>,
  "hasPhone": <true/false, khách hàng đã cung cấp số điện thoại liên hệ cụ thể>,
  "hasAddress": <true/false, khách hàng đã cung cấp địa chỉ giao hàng cụ thể>,
  "productName": <tên sản phẩm khách chọn mua (chính xác từ danh sách dưới), hoặc null nếu không rõ>,
  "amount": <giá sản phẩm (number), hoặc null nếu không rõ>,
  "customerName": <tên người nhận đã cung cấp, hoặc null nếu không rõ>,
  "customerPhone": <số điện thoại liên hệ đã cung cấp, hoặc null nếu không rõ>,
  "customerAddress": <địa chỉ giao hàng đã cung cấp, hoặc null nếu không rõ>
}

Danh sách sản phẩm & giá hiện có trong kho:
${productMap}`;

    const chatCompletion = await groq.chat.completions.create({
      model: GROQ_MODEL,
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
 * Tạo chuỗi danh sách sản phẩm từ database
 * @returns {Promise<string>} Danh sách sản phẩm formatted cho system prompt
 */
const generateProductListPrompt = formatProductCatalogForPrompt;

/**
 * Hàm fallback phân tích hội thoại voice bằng regex/keywords và fuzzy search
 */
const fallbackDetectVoiceOrder = async (messages, language = 'vi') => {
  const lang = normalizeLanguage(language);
  const allContent = messages.map(m => m.content).join(' ').toLowerCase();
  // Pre-compute diacritic-normalized version of conversation content for matching
  const allContentNorm = allContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const hasBuyIntent = allContent.includes('mua') || allContent.includes('đặt hàng') || allContent.includes('chốt') || allContent.includes('chot') || allContent.includes('order')
    || allContent.includes('buy') || allContent.includes('purchase') || allContent.includes('i want') || allContent.includes("i'll take");

  let customerName = null;
  let customerPhone = null;
  let customerAddress = null;
  let productName = null;
  let amount = null;

  // Tìm sản phẩm từ database bằng fuzzy search
  try {
    // Thử tìm từ nội dung hội thoại
    const products = await getProducts(language);
    
    for (const product of products) {
      const parseTranslations = (p) => {
        if (!p || !p.translations) return {};
        if (typeof p.translations === 'string') {
          try { return JSON.parse(p.translations); } catch (_) { return {}; }
        }
        return p.translations;
      };

      const translations = parseTranslations(product) || {};
      const enName = translations.en?.name || '';
      const viName = translations.vi?.name || product.name || '';

      const nameCandidates = [
        product.name,
        viName,
        enName,
        product.sku
      ].filter(Boolean).map(n => n.toLowerCase());

      const matched = nameCandidates.some(name => {
        // Normalize candidate name (remove diacritics)
        const normName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        // Check 1: allContent contains full candidate name (exact or with diacritics)
        if (allContent.includes(name) || allContentNorm.includes(normName)) return true;
        // Check 2: Any significant word from normName appears in allContentNorm (partial match)
        // e.g. "oversize" in conversation matches "ao thun oversize trendy"
        const words = normName.split(/\s+/).filter(w => w.length >= 4);
        return words.some(w => allContentNorm.includes(w));
      });

      if (matched) {
        productName = product.name;
        amount = parseFloat(product.price_usdc);
        break;
      }
    }
    
    // Nếu không tìm thấy, dùng sản phẩm đầu tiên làm default
    if (!productName && products.length > 0) {
      productName = products[0].name;
      amount = parseFloat(products[0].price_usdc);
    }
  } catch (error) {
    console.error('[Agora] Lỗi tìm sản phẩm:', error.message);
    // Fallback
    productName = 'Sản phẩm mặc định';
    amount = 0.1;
  }

  for (let i = 0; i < messages.length - 1; i++) {
    const current = messages[i];
    const next = messages[i + 1];
    if (current.role === 'assistant' && next.role === 'user') {
      const currentLower = current.content.toLowerCase();
      let matched = false;

      if (currentLower.includes('tên người nhận') || currentLower.includes('cho em biết tên') || currentLower.includes('xin tên') || currentLower.includes('họ và tên')
        || currentLower.includes('your name') || currentLower.includes('full name') || currentLower.includes('recipient name')) {
        customerName = next.content.replace(/tên (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').replace(/my name is/gi, '').replace(/i am/gi, '').trim();
        matched = true;
      }
      if (currentLower.includes('số điện thoại') || currentLower.includes('sđt') || currentLower.includes('so dien thoai') || currentLower.includes('sdt') || currentLower.includes('liên hệ')
        || currentLower.includes('phone number') || currentLower.includes('phone') || currentLower.includes('contact number')) {
        const phoneCleaned = next.content.replace(/số điện thoại (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').replace(/my phone is/gi, '').trim();
        if (!matched || /\d+/.test(phoneCleaned)) {
          customerPhone = phoneCleaned;
          matched = true;
        }
      }
      if (!matched && (currentLower.includes('địa chỉ') || currentLower.includes('cho em biết địa chỉ') || currentLower.includes('xin địa chỉ') || currentLower.includes('giao hàng')
        || currentLower.includes('shipping address') || currentLower.includes('delivery address') || currentLower.includes('address'))) {
        customerAddress = next.content.replace(/địa chỉ (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').replace(/my address is/gi, '').trim();
      }
    }
  }

  // Regex phone: Vietnam 10-digit or international formats
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}|\b(0[3|5|7|8|9]+[0-9]{8})\b/;
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

const getSlidingWindow = (messages, limit = 10) => {
  const systemMsgs = messages.filter(m => m.role === 'system');
  const otherMsgs = messages.filter(m => m.role !== 'system');
  
  if (otherMsgs.length <= limit) {
    return messages;
  }
  
  let startIndex = otherMsgs.length - limit;
  while (startIndex > 0 && otherMsgs[startIndex].role === 'tool') {
    startIndex--;
  }
  if (startIndex > 0 && otherMsgs[startIndex - 1].tool_calls) {
    startIndex--;
  }
  
  return [...systemMsgs, ...otherMsgs.slice(startIndex)];
};

/**
 * Handler xử lý Webhook từ Agora Conversational AI
 * Tối ưu cho Voice: Trả lời ngắn, không markdown, hỗ trợ Tools
 */
const llmWebhookHandler = async (req, res) => {
  let language = 'vi';
  try {
    const { messages: reqMessages, stream } = req.body;
    if (!reqMessages) return res.status(400).json({ error: 'No messages' });

    const sessionId = req.query.sessionId || req.body.sessionId || req.body.channel;
    language = normalizeLanguage(req.query.language || req.body.language || 'vi');

    if (sessionId) {
      sessionLanguages.set(sessionId, language);
    }

    // 0. Kiểm tra nếu cuộc trò chuyện đã chuyển giao sang người thật (Handoff)
    const { isSessionInHandoff } = require('../websocket/socket.server');
    if (typeof isSessionInHandoff === 'function' && isSessionInHandoff(sessionId)) {
      console.log(`[Agora Webhook] 🛑 Chặn AI Voice trả lời cho sessionId: ${sessionId} (đang trong chế độ người thật hỗ trợ)`);
      return res.status(200).json({ error: 'Session is in handoff' });
    }

    // Emit user's transcript immediately to the chat screen
    const lastUserMsg = [...reqMessages].reverse().find(msg => msg.role === 'user');
    if (sessionId && lastUserMsg && lastUserMsg.content) {
      const { emitTranscriptReceived } = require('../websocket/socket.server');
      emitTranscriptReceived({
        sessionId,
        sender: 'user',
        transcript: lastUserMsg.content,
        type: 'voice',
        id: 'user-' + Date.now()
      });
    }

    // 1. Kiểm tra logic Escalation ngay trước khi gửi LLM
    const { checkEscalation, emitEscalationEvent } = require('../services/ai.service');
    if (lastUserMsg && lastUserMsg.content && checkEscalation(lastUserMsg.content)) {
      emitEscalationEvent(sessionId, lastUserMsg.content, 'manual_request');
      const speakText = language === 'en'
        ? 'I apologize for the inconvenience. I will transfer this conversation to a human support agent right away!'
        : "Dạ em xin lỗi vì sự bất tiện này. Em sẽ chuyển ngay cuộc trò chuyện này sang nhân viên hỗ trợ để xử lý nhanh nhất cho mình ạ! 🙏";
      
      if (sessionId) {
        const assistantMsgId = 'ai-escalate-' + Date.now();
        const { emitTranscriptReceived } = require('../websocket/socket.server');
        emitTranscriptReceived({
          sessionId,
          sender: 'assistant',
          transcript: speakText,
          type: 'voice',
          id: assistantMsgId
        });
      }

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const chunk1 = {
          id: 'voice-escalate-' + Date.now(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: GROQ_MODEL,
          choices: [
            {
              index: 0,
              delta: { content: speakText },
              finish_reason: null
            }
          ]
        };
        res.write(`data: ${JSON.stringify(chunk1)}\n\n`);

        const chunk2 = {
          id: 'voice-escalate-' + Date.now(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: GROQ_MODEL,
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
          id: 'voice-escalate-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: GROQ_MODEL,
          choices: [{
            message: { role: 'assistant', content: speakText },
            index: 0,
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
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

    // Đảm bảo có system prompt theo ngôn ngữ
    const basePrompt = getSystemPromptForLanguage(language, 'voice');
    if (!messages.some(msg => msg.role === 'system')) {
      messages.unshift({ role: 'system', content: basePrompt });
    } else {
      messages[0] = { role: 'system', content: basePrompt };
    }

    const productListPrompt = await generateProductListPrompt(language);

    const voiceLangInstruction = language === 'en'
      ? `IMPORTANT — THIS IS A VOICE INTERFACE:
- Keep answers SHORT, max 2-3 short sentences
- NEVER use backticks, markdown, code, or function names like check_inventory or create_order
- STORE CATALOG & PRICES (always quote these exactly):
${productListPrompt}
- Ask for one piece of info at a time: name first, then phone, then shipping address.
- Wait for the customer to answer before asking the next question.
- You MUST collect full name, phone number, and shipping address before creating an order.
- Never hallucinate that a QR was sent when information is incomplete.
- Always respond in English.`
      : `QUAN TRỌNG - ĐÂY LÀ GIAO DIỆN GIỌNG NÓI:
- Trả lời NGẮN GỌN, tối đa 2-3 câu ngắn
- TUYỆT ĐỐI không viết backtick, markdown, code, tên function như check_inventory hay create_order
- DANH SÁCH SẢN PHẨM & GIÁ CỦA CỬA HÀNG (TUYỆT ĐỐI nói đúng giá này):
${productListPrompt}
- Hỏi từng thông tin một, không hỏi cùng lúc: hỏi họ và tên trước, sau đó hỏi số điện thoại, sau đó mới hỏi địa chỉ giao hàng.
- Chờ khách trả lời xong từng câu rồi mới hỏi thông tin tiếp theo.
- BẮT BUỘC phải thu thập đủ 3 thông tin: Họ tên, Số điện thoại, Địa chỉ giao hàng mới được phép tạo đơn.
- Tuyệt đối không được tự bịa (hallucinate) ra việc đã gửi mã QR khi thông tin chưa đầy đủ.`;

    messages.splice(1, 0, {
      role: 'system',
      content: voiceLangInstruction
    });

    // Kiểm tra xem khách đã đặt đơn chưa để tránh duplicate order
    const allContentLower = messages.map(m => m.content).join(' ').toLowerCase();
    const alreadyCreated = allContentLower.includes('da em da ghi nhan thong tin, anh chi vui long nhin vao cua so chat') ||
      allContentLower.includes('dạ em đã ghi nhận thông tin, anh chị vui lòng nhìn vào cửa sổ chat') ||
      allContentLower.includes('please look at the chat window for the payment qr');

    if (!alreadyCreated) {
      const fallback = await fallbackDetectVoiceOrder(messages, language);
      let detection = fallback;

      if (fallback.hasBuyIntent) {
        const llmDetection = await detectVoiceOrder(messages, language);
        if (llmDetection) {
          detection = llmDetection;
        }
      }

      if (detection && detection !== fallback) {
        if (!detection.customerName && fallback.customerName) {
          detection.customerName = fallback.customerName;
          detection.hasName = true;
        }
        if (!detection.customerPhone && fallback.customerPhone) {
          detection.customerPhone = fallback.customerPhone;
          detection.hasPhone = true;
        }
        if (!detection.customerAddress && fallback.customerAddress && fallback.customerAddress !== detection.customerName) {
          detection.customerAddress = fallback.customerAddress;
          detection.hasAddress = true;
        }
      }

      if (detection && detection.hasBuyIntent && detection.hasName && detection.hasPhone && detection.hasAddress) {
        // Kiểm tra địa chỉ có hợp lệ không
        const isAddressValid = (addr) => {
          if (!addr) return false;
          const words = addr.trim().split(/\s+/).filter(Boolean);
          const normalized = addr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
          const blacklistPatterns = [/nhu quan/i, /nha quan/i];
          if (words.length <= 2 || blacklistPatterns.some(p => p.test(normalized))) {
            return false;
          }
          return true;
        };

        if (!isAddressValid(detection.customerAddress)) {
          const speakText = 'Dạ anh chị cho em xin địa chỉ cụ thể (số nhà, tên đường) để em tạo đơn nhé';
          
          if (sessionId) {
            const assistantMsgId = 'ai-addr-verify-' + Date.now();
            const { emitTranscriptReceived } = require('../websocket/socket.server');
            emitTranscriptReceived({
              sessionId,
              sender: 'assistant',
              transcript: speakText,
              type: 'voice',
              id: assistantMsgId
            });
          }

          if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const chunk1 = {
              id: 'voice-addr-verify-' + Date.now(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
              choices: [
                {
                  index: 0,
                  delta: { content: speakText },
                  finish_reason: null
                }
              ]
            };
            res.write(`data: ${JSON.stringify(chunk1)}\n\n`);

            const chunk2 = {
              id: 'voice-addr-verify-' + Date.now(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
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
              id: 'voice-addr-verify-' + Date.now(),
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
              choices: [{
                message: { role: 'assistant', content: speakText },
                index: 0,
                finish_reason: 'stop'
              }],
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            });
          }
        }

        console.log('[LLM Webhook] Phát hiện đủ thông tin đặt hàng qua voice:', detection);

        const detectedProductName = detection.productName || 'Solana Mobile Saga v2';
        const detectedAmount = detection.amount || 0.1;
        const detectedName = detection.customerName || 'Khách mua qua Voice';
        const detectedPhone = detection.customerPhone || 'Chưa cung cấp';
        const detectedAddress = detection.customerAddress || 'Chưa cung cấp';

        // Kiểm tra tồn kho của sản phẩm trước khi tạo đơn hàng
        const productResult = await checkInventory(detectedProductName, language);
        if (!productResult || !productResult.found || productResult.stock <= 0) {
          console.log('[LLM Webhook] Sản phẩm hết hàng hoặc không tìm thấy, không tạo đơn:', productResult);
          
          const speakText = language === 'en'
            ? "I'm sorry, this item is currently out of stock. Let me connect you with our staff for support."
            : "Dạ hiện tại em chưa tìm thấy sản phẩm này trong kho. Em sẽ chuyển sang nhân viên thật để kiểm tra và hỗ trợ anh/chị chính xác hơn ạ.";

          const { emitEscalationEvent } = require('../services/ai.service');
          emitEscalationEvent(sessionId, `Khách mua sản phẩm qua Voice nhưng hết hàng: ${detectedProductName}`, 'inventory_not_found');

          if (sessionId) {
            const assistantMsgId = 'ai-order-out-of-stock-' + Date.now();
            const { emitTranscriptReceived } = require('../websocket/socket.server');
            emitTranscriptReceived({
              sessionId,
              sender: 'assistant',
              transcript: speakText,
              type: 'voice',
              id: assistantMsgId
            });
          }

          if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const chunk1 = {
              id: 'voice-order-fail-' + Date.now(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
              choices: [
                {
                  index: 0,
                  delta: { content: speakText },
                  finish_reason: null
                }
              ]
            };
            res.write(`data: ${JSON.stringify(chunk1)}\n\n`);

            const chunk2 = {
              id: 'voice-order-fail-' + Date.now(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
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
              id: 'voice-order-fail-' + Date.now(),
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
              choices: [{
                message: { role: 'assistant', content: speakText },
                index: 0,
                finish_reason: 'stop'
              }],
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            });
          }
        }

        // Gọi executeTool để dùng chung logic và validation với Chat (check inventory, check high-value order, map session)
        const { executeTool } = require('../services/ai.service');
        const toolResultStr = await executeTool('create_order', {
          product_name: detectedProductName,
          amount: detectedAmount,
          customer_name: detectedName,
          customer_phone: detectedPhone,
          customer_address: detectedAddress
        }, sessionId);

        const result = JSON.parse(toolResultStr);

        if (!result.success) {
          console.log('[LLM Webhook] Tạo đơn hàng qua Voice thất bại hoặc cần chuyển giao:', result);
          let speakText = result.message || 'Dạ hiện tại không thể tạo đơn hàng này.';
          let escalate = false;
          let escalationReason = 'tool_escalation';

          if (result.escalate) {
            escalate = true;
            escalationReason = result.reason || 'tool_escalation';
            if (result.reason === 'inventory_not_found') {
              speakText = language === 'en'
                ? "I'm sorry, this item is currently out of stock. Let me connect you with our staff for support."
                : 'Dạ hiện tại em chưa tìm thấy sản phẩm này trong kho. Em sẽ chuyển sang nhân viên thật để kiểm tra và hỗ trợ anh/chị chính xác hơn ạ.';
            } else if (result.reason === 'high_value_order') {
              speakText = language === 'en'
                ? `This high-value order of ${result.amount} USDC requires store manager approval. Let me transfer you to our live staff right away.`
                : `Dạ đơn hàng giá trị cao ${result.amount} USDC cần chủ shop duyệt trực tiếp ạ. Em sẽ kết nối với nhân viên thật ngay nhé.`;
            }
            
            const { emitEscalationEvent } = require('../services/ai.service');
            emitEscalationEvent(sessionId, `Khách mua hàng qua Voice gặp lỗi: ${result.message}`, escalationReason);
          }

          if (sessionId) {
            const assistantMsgId = 'ai-order-fail-' + Date.now();
            const { emitTranscriptReceived } = require('../websocket/socket.server');
            emitTranscriptReceived({
              sessionId,
              sender: 'assistant',
              transcript: speakText,
              type: 'voice',
              id: assistantMsgId
            });
          }

          if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const chunk1 = {
              id: 'voice-order-fail-' + Date.now(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
              choices: [
                {
                  index: 0,
                  delta: { content: speakText },
                  finish_reason: null
                }
              ]
            };
            res.write(`data: ${JSON.stringify(chunk1)}\n\n`);

            const chunk2 = {
              id: 'voice-order-fail-' + Date.now(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
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
              id: 'voice-order-fail-' + Date.now(),
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: GROQ_MODEL,
              choices: [{
                message: { role: 'assistant', content: speakText },
                index: 0,
                finish_reason: 'stop'
              }],
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            });
          }
        }

        // Tạo đơn hàng thành công
        const orderId = result.order_id;
        const qrCodeImage = result.qr_code;
        const sellerWallet = result.seller_wallet || process.env.SELLER_WALLET || '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ';
        const speakText = language === 'en'
          ? 'Got it! Please look at the chat window to see your Solana Pay QR code.'
          : 'Dạ em đã ghi nhận thông tin, anh chị vui lòng nhìn vào cửa sổ chat để xem mã QR thanh toán nhé!';

        // Emit WebSocket để frontend hiển thị QR
        const { getIo } = require('../websocket/socket.server');
        const io = getIo();
        if (io) {
          io.emit('voice_order_created', {
            orderId: orderId,
            productName: result.product_name,
            amount: result.amount,
            qrCodeImage,
            customerName: detectedName,
            customerPhone: detectedPhone,
            customerAddress: detectedAddress,
            sellerWallet: sellerWallet
          });
          console.log(`[Socket.io] 📢 Đã phát sự kiện 'voice_order_created' cho đơn #${orderId}`);
        } else {
          console.warn('[Socket.io] ⚠️ getIo() trả về null, không thể phát sự kiện voice_order_created');
        }

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
            model: GROQ_MODEL,
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
            model: GROQ_MODEL,
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
            model: GROQ_MODEL,
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
        model: GROQ_MODEL,
        messages: getSlidingWindow(messages, 6),
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
        model: GROQ_MODEL,
        messages: getSlidingWindow(messages, 6),
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
      const isRateLimit = error?.status === 429 || error?.statusCode === 429 || 
        (error?.message && (
          error.message.includes('429') || 
          error.message.includes('Rate limit') || 
          error.message.includes('rate limit') || 
          error.message.includes('TPM')
        ));

      const fallbackContent = isRateLimit
        ? 'Dạ mạng bên em hơi chậm, anh chị chờ em vài giây nhé'
        : (language === 'en'
          ? 'What product are you interested in today?'
          : 'Dạ, anh chị đang quan tâm sản phẩm gì ạ?');

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
        model: GROQ_MODEL,
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
