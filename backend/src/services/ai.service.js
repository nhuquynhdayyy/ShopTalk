const Groq = require('groq-sdk');
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
const { Keypair } = require('@solana/web3.js');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { checkInventory, normalize, formatProductCatalogForPrompt, resolveProductDisplayName } = require('./inventory.service');
const axios = require('axios');
const { createOrder, getOrderById } = require('../models/order.model');
const { createPaymentRequest, generateQRCode } = require('./solanaPay.service');
const { fallbackDetectOrder, wantsQrResend } = require('./orderDetection.service');
const { getIo, isSessionInHandoff, addLiveHandoffSession } = require('../websocket/socket.server');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');

// Load SYSTEM_PROMPT từ file system-prompt.md (cho text chat)
let SYSTEM_PROMPT = '';
try {
  const promptPath = path.join(__dirname, '../../ai-agent/prompts/system-prompt.md');
  SYSTEM_PROMPT = fs.readFileSync(promptPath, 'utf-8');
  console.log('[AI Agent] ✅ Đã load System Prompt (Text) từ file system-prompt.md');
} catch (error) {
  console.error('[AI Agent] ❌ Lỗi khi đọc file system-prompt.md:', error.message);
  // Fallback prompt đơn giản nếu không đọc được file
  SYSTEM_PROMPT = `Bạn là nhân viên bán hàng (Sales Agent) chuyên nghiệp của cửa hàng "ShopTalk".
Nhiệm vụ: Tư vấn sản phẩm, kiểm tra kho, tạo đơn hàng và hướng dẫn quét thanh toán USDC Solana (Devnet).

## TƯ DUY RA QUYẾT ĐỊNH NHANH & ƯU TIÊN GỌI TOOL
- Ngay khi khách nhắc đến sản phẩm hoặc ý định mua, gọi ngay \`check_inventory\` hoặc \`create_order\` thay vì đặt câu hỏi khảo sát rườm rà.
- Khi gọi tool (như \`check_inventory\` hoặc \`create_order\`), bạn **phải thực hiện tool call ngay lập tức ở lượt này**. Không giải thích hay nói dông dài với khách hàng trước khi gọi.
- Tuyệt đối không tự bịa sản phẩm. Luôn dùng \`check_inventory\` để xác thực trước khi báo giá/số lượng.

## QUY TẮC THU THẬP THÔNG TIN CHẶT CHẼ (BẮT BUỘC)
- Bạn **BẮT BUỘC phải thu thập đủ 3 thông tin**: **Họ tên**, **Số điện thoại**, **Địa chỉ giao hàng** mới được phép nói câu "Em sẽ tạo đơn hàng" hoặc gọi công cụ \`create_order\`.
- **Nếu khách mới đưa tên và địa chỉ**, bạn **PHẢI** hỏi tiếp: *"Cho em xin số điện thoại để shipper liên lạc ạ?"* trước khi thực hiện các bước tiếp theo.
- Tuyệt đối **không được tự bịa (hallucinate) ra việc đã gửi mã QR hoặc đã tạo đơn hàng** khi thông tin của khách hàng chưa đầy đủ 3 yếu tố trên.
- Khi đã nhận đủ cả 3 thông tin này, gọi ngay công cụ \`create_order\` ở lượt trả lời hiện tại.

## PHỄU BÁN HÀNG 6 BƯỚC (TỐI ƯU HÓA)
1. **Chào & Hỏi (Qualify):** Chào ngắn gọn, tìm hiểu nhu cầu. Nếu khách hỏi sản phẩm hoặc giá, chuyển thẳng sang gọi tool.
2. **Gợi ý (Recommend):** Gọi \`check_inventory\` tìm sản phẩm. Báo thông tin sản phẩm và giá nhanh chóng.
3. **Giải quyết phân vân (Objection):** Khách chê đắt/lo ngại -> gọi \`get_reviews\` kể feedback thật. Xác nhận cảm giác -> đưa giải pháp.
4. **Gợi ý thêm (Upsell):** Khéo léo gợi ý 1 phụ kiện đi kèm phù hợp (chỉ thực hiện 1 lần sau khi chốt đơn và nếu khách không vội).
5. **Chốt đơn (Close):** Khi khách đồng ý mua, chuyển thẳng tới bước này. Thu thập lần lượt: Họ tên, Số điện thoại, Địa chỉ. Có đủ 3 thông tin mới gọi \`create_order\`.
6. **Sau bán (Post-Sale):** Tóm tắt đơn hàng ngắn gọn (Sản phẩm, Tổng tiền, Người nhận, SĐT, Địa chỉ). Gọi \`generate_payment_qr\`, hiển thị ảnh QR Solana Pay và hướng dẫn họ dùng ví Phantom/Solflare (Devnet) quét mã để hoàn tất. Sau khi QR hiển thị, AI tuyệt đối im lặng để khách thao tác chuyển tiền.

## QUY TẮC CỐT LÕI
1. Luôn lịch sự, xưng hô phù hợp (dạ, em, anh/chị...).
2. Báo trước khi gọi tool bằng câu siêu ngắn (hoặc gọi luôn không cần nói): "Dạ để em check nhanh nhé..." hoặc "Dạ em tạo đơn ngay nhé..."
3. Luôn nhắc nhở khách thanh toán bằng USDC trên mạng Solana Devnet.
4. Danh sách kho hàng thực tế được cập nhật tự động từ database ở cuối system prompt. Chỉ tư vấn/báo giá sản phẩm có trong danh sách đó hoặc qua kết quả \`check_inventory\`.`;
}

// Load SYSTEM_PROMPT_VOICE từ file system-prompt-voice.md (cho voice agent)
let SYSTEM_PROMPT_VOICE = '';
try {
  const promptVoicePath = path.join(__dirname, '../../ai-agent/prompts/system-prompt-voice.md');
  SYSTEM_PROMPT_VOICE = fs.readFileSync(promptVoicePath, 'utf-8');
  console.log('[AI Agent] ✅ Đã load System Prompt (Voice) từ file system-prompt-voice.md');
} catch (error) {
  console.error('[AI Agent] ❌ Lỗi khi đọc file system-prompt-voice.md:', error.message);
  // Fallback: dùng prompt text nếu không có voice prompt
  SYSTEM_PROMPT_VOICE = SYSTEM_PROMPT;
  console.warn('[AI Agent] ⚠️ Fallback: Dùng text prompt cho voice agent');
}

// Load SYSTEM_PROMPT_EN từ file (cho text chat tiếng Anh)
let SYSTEM_PROMPT_EN = '';
try {
  const promptEnPath = path.join(__dirname, '../../ai-agent/prompts/system-prompt-en.md');
  SYSTEM_PROMPT_EN = fs.readFileSync(promptEnPath, 'utf-8');
  console.log('[AI Agent] ✅ Đã load System Prompt (EN Text) từ file system-prompt-en.md');
} catch (error) {
  console.error('[AI Agent] ❌ Lỗi khi đọc file system-prompt-en.md:', error.message);
  SYSTEM_PROMPT_EN = `You are a professional Sales Agent for the "ShopTalk" store.
Your mission: advise on products, check inventory, create orders, and guide customers to pay via USDC on Solana (Devnet).
Always respond in English. Use tools: check_inventory, create_order, generate_payment_qr, get_reviews, log_feedback.
Collect full name, phone number, and shipping address before calling create_order.`;
}

// Load SYSTEM_PROMPT_VOICE_EN (cho voice agent tiếng Anh)
let SYSTEM_PROMPT_VOICE_EN = '';
try {
  const promptVoiceEnPath = path.join(__dirname, '../../ai-agent/prompts/system-prompt-voice-en.md');
  SYSTEM_PROMPT_VOICE_EN = fs.readFileSync(promptVoiceEnPath, 'utf-8');
  console.log('[AI Agent] ✅ Đã load System Prompt (EN Voice) từ file system-prompt-voice-en.md');
} catch (error) {
  console.error('[AI Agent] ❌ Lỗi khi đọc file system-prompt-voice-en.md:', error.message);
  SYSTEM_PROMPT_VOICE_EN = SYSTEM_PROMPT_EN;
}

const normalizeLanguage = (language) => (
  typeof language === 'string' && language.toLowerCase().startsWith('en') ? 'en' : 'vi'
);

const getSystemPromptForLanguage = (language, mode = 'text') => {
  const lang = normalizeLanguage(language);
  if (mode === 'voice') {
    return lang === 'en' ? SYSTEM_PROMPT_VOICE_EN : SYSTEM_PROMPT_VOICE;
  }
  return lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT;
};

const getEscalationReply = (language, reason = 'manual_request') => {
  const lang = normalizeLanguage(language);
  if (reason === 'repeated_question') {
    return lang === 'en'
      ? 'I notice you have asked the same question again. I will transfer this chat to a human agent for more accurate help.'
      : 'Dạ em thấy anh/chị đang phải hỏi lại cùng một vấn đề. Em sẽ chuyển cuộc trò chuyện này sang nhân viên thật để hỗ trợ chính xác hơn ạ.';
  }
  if (reason === 'inventory_not_found') {
    return lang === 'en'
      ? "I couldn't find that product in our inventory. I'll connect you with a staff member who can check and assist you more accurately."
      : 'Dạ hiện tại em chưa tìm thấy sản phẩm này trong kho. Em sẽ chuyển sang nhân viên thật để kiểm tra và hỗ trợ anh/chị chính xác hơn ạ.';
  }
  return lang === 'en'
    ? 'I apologize for the inconvenience. I will transfer this conversation to a human support agent right away!'
    : 'Dạ em xin lỗi vì sự bất tiện này. Em sẽ chuyển ngay cuộc trò chuyện này sang nhân viên hỗ trợ thực tế để xử lý nhanh nhất cho anh/chị ạ! 🙏';
};

const GREETING_ONLY_PATTERN = /^(hello|hi|hey|yo|howdy|good morning|good afternoon|good evening|chao|xin chao|chao ban|chao em|chao a|chao chi)(\s+(there|you|ban|em|a|chi))?[!.?\s]*$/i;

const GENERIC_INVENTORY_TERMS = new Set([
  'hello', 'hi', 'hey', 'all', 'list', 'catalog', 'products', 'product',
  'san pham', 'items', 'everything', 'anything', 'shop', 'store', 'hang'
]);

const PRODUCT_INTENT_KEYWORDS = [
  'mua', 'buy', 'order', 'dat hang', 'con hang', 'in stock', 'stock', 'kho',
  'inventory', 'gia', 'price', 'cost', 'san pham', 'product', 'ao', 'shirt',
  'hoodie', 'tai nghe', 'earbuds', 'phone', 'saga', 'ledger', 'co khong',
  'co ban', 'ban khong', 'have', 'sell', 'available', 'cheapest', 'dat nhat',
  're nhat', 'most expensive', 'recommend', 'tu van', 'advise', 'looking for',
  'interested in', 'want', 'need'
];

const isSmallTalkOrGreeting = (text) => {
  if (!text || !text.trim()) return true;
  const normalized = normalize(text).trim();
  return GREETING_ONLY_PATTERN.test(normalized);
};

const hasProductIntent = (text) => {
  if (!text) return false;
  const normalizedMsg = normalize(text);
  return PRODUCT_INTENT_KEYWORDS.some((keyword) => normalizedMsg.includes(normalize(keyword)));
};

const isGenericInventoryQuery = (productName) => {
  const normalizedProduct = normalize((productName || '').trim());
  if (!normalizedProduct) return true;
  if (GENERIC_INVENTORY_TERMS.has(normalizedProduct)) return true;
  const words = normalizedProduct.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => GENERIC_INVENTORY_TERMS.has(word));
};

const shouldEscalateInventoryNotFound = (userMessage, productName) => {
  if (isSmallTalkOrGreeting(userMessage)) return false;
  if (isGenericInventoryQuery(productName)) return false;
  return hasProductIntent(userMessage);
};

// ─── State: Lưu trữ lịch sử hội thoại (Context) ──────────────────────────────────
// Map lưu trữ: sessionId -> Array of messages
const chatSessions = new Map();

// Map lưu trữ: sessionId -> agentId
const activeAgoraAgents = new Map();
const startingAgoraAgents = new Map();

// Map lưu trữ: orderId -> sessionId
const orderSessions = new Map();

const latestOrderBySession = new Map();
const repeatedQuestionState = new Map();
const sessionLanguages = new Map();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPEATED_QUESTION_LIMIT = Number(process.env.ESCALATION_REPEAT_QUESTION_LIMIT || 2);
const DEFAULT_ORDER_THRESHOLD_USDC = 100;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isPositiveAmount = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const buildToolValidationError = (toolName, missingFields, message) => JSON.stringify({
  success: false,
  validation_error: true,
  tool: toolName,
  missing_fields: missingFields,
  message
});

const parseToolArguments = (rawArgs) => {
  if (!rawArgs) return {};
  if (typeof rawArgs === 'object') return rawArgs;
  try {
    return JSON.parse(rawArgs);
  } catch (_) {
    return {};
  }
};

const validateToolArgs = (name, args, language = 'vi') => {
  const fieldsByTool = {
    check_inventory: ['product_name'],
    create_order: ['product_name', 'amount', 'customer_name', 'customer_phone', 'customer_address'],
    generate_payment_qr: ['order_id'],
    get_reviews: [],
    log_feedback: ['feedback_type', 'content']
  };

  const missing = (fieldsByTool[name] || []).filter((field) => {
    if (field === 'amount') return !isPositiveAmount(args[field]);
    return !isNonEmptyString(args[field]);
  });

  if (name === 'get_reviews' && !isNonEmptyString(args.product_name) && !isNonEmptyString(args.product_sku)) {
    missing.push('product_sku');
  }

  if (missing.length > 0) {
    const message = language === 'en'
      ? `Tool ${name} is missing required parameters: ${missing.join(', ')}. Please ask the customer to provide the missing information, do not hallucinate data.`
      : `Tool ${name} thiếu tham số bắt buộc: ${missing.join(', ')}. Hãy hỏi khách hàng bổ sung thông tin còn thiếu, không tự bịa dữ liệu.`;

    return {
      valid: false,
      result: buildToolValidationError(
        name,
        missing,
        message
      )
    };
  }

  return { valid: true };
};

const isRateLimitError = (error) => {
  const message = error?.message || '';
  return message.includes('Rate limit') ||
    message.includes('rate limit') ||
    message.includes('TPM') ||
    message.includes('429');
};

const isGroqToolCallError = (errorPayload) => {
  const message = errorPayload?.message || '';
  return message.includes('Failed to call a function') ||
    message.includes('failed_generation') ||
    Boolean(errorPayload?.failed_generation);
};

const callChatCompletions = async (apiUrl, apiKey, payload) => {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return { response, data };
};

const normalizeUserQuestion = (text) => normalize(text)
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getOrderEscalationThreshold = () => {
  const value = Number(process.env.ESCALATION_ORDER_THRESHOLD_USDC);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_ORDER_THRESHOLD_USDC;
};

const getRepeatEscalation = (sessionId, userMessage) => {
  const normalizedMessage = normalizeUserQuestion(userMessage);
  if (!sessionId || normalizedMessage.length < 3) {
    return { shouldEscalate: false, count: 1, normalizedMessage };
  }

  const previous = repeatedQuestionState.get(sessionId);
  const nextCount = previous?.normalizedMessage === normalizedMessage ? previous.count + 1 : 1;
  repeatedQuestionState.set(sessionId, { normalizedMessage, count: nextCount });

  return {
    shouldEscalate: nextCount >= REPEATED_QUESTION_LIMIT,
    count: nextCount,
    normalizedMessage
  };
};

/**
 * Lấy lịch sử tin nhắn của một phiên chat, khởi tạo hoặc cập nhật ngôn ngữ nếu cần
 */
const buildTextSystemPrompt = async (language) => {
  const lang = normalizeLanguage(language);
  const basePrompt = getSystemPromptForLanguage(lang, 'text');
  const catalog = await formatProductCatalogForPrompt(lang);
  const catalogHeader = lang === 'en'
    ? '\n\n## LIVE STORE CATALOG (from database — only recommend/sell these products)\n'
    : '\n\n## DANH SÁCH KHO HÀNG THỰC TẾ (từ database — chỉ tư vấn/bán các sản phẩm sau)\n';
  const catalogFooter = lang === 'en'
    ? '\nAlways call `check_inventory` to confirm stock and price before quoting or creating an order.'
    : '\nLuôn gọi `check_inventory` để xác nhận tồn kho và giá trước khi báo giá hoặc tạo đơn.';

  return `${basePrompt}${catalogHeader}${catalog}${catalogFooter}`;
};

const getOrCreateSession = async (sessionId, language = 'vi') => {
  const lang = normalizeLanguage(language);
  const systemPrompt = await buildTextSystemPrompt(lang);

  if (!chatSessions.has(sessionId)) {
    chatSessions.set(sessionId, [{ role: 'system', content: systemPrompt }]);
    sessionLanguages.set(sessionId, lang);
  } else {
    const previousLang = sessionLanguages.get(sessionId);
    if (previousLang !== lang) {
      const messages = chatSessions.get(sessionId);
      const systemIndex = messages.findIndex((m) => m.role === 'system');
      if (systemIndex >= 0) {
        messages[systemIndex] = { role: 'system', content: systemPrompt };
      } else {
        messages.unshift({ role: 'system', content: systemPrompt });
      }
      sessionLanguages.set(sessionId, lang);
      console.log(`[AI Agent] 🌐 Session ${sessionId}: đổi ngôn ngữ ${previousLang || 'unknown'} → ${lang}`);
    } else {
      const messages = chatSessions.get(sessionId);
      const systemIndex = messages.findIndex((m) => m.role === 'system');
      if (systemIndex >= 0) {
        messages[systemIndex] = { role: 'system', content: systemPrompt };
      }
    }
  }

  return chatSessions.get(sessionId);
};

// ─── Định nghĩa Danh sách Tools (Function Calling) cho OpenAI ──────────────
const checkInventoryTool = require('../../ai-agent/tools/checkInventory.tool');
const createOrderTool = require('../../ai-agent/tools/createOrder.tool');
const generatePaymentQRTool = require('../../ai-agent/tools/generatePaymentQR.tool');
const getReviewsTool = require('../../ai-agent/tools/getReviews.tool');
const logFeedbackTool = require('../../ai-agent/tools/logFeedback.tool');

const OPENAI_TOOLS = [
  checkInventoryTool,
  createOrderTool,
  generatePaymentQRTool,
  getReviewsTool.definition || getReviewsTool,
  logFeedbackTool.definition || logFeedbackTool
];

// ─── Logic thực thi các công cụ (Tool Execution) ───────────────────────────

const executeTool = async (name, args = {}, sessionId = null) => {
  args = parseToolArguments(args);
  const language = sessionId ? (sessionLanguages.get(sessionId) || 'vi') : 'vi';

  if (name === 'generate_payment_qr') {
    const latestOrderId = sessionId ? latestOrderBySession.get(sessionId) : null;
    if (!isNonEmptyString(args.order_id) && latestOrderId) {
      args.order_id = latestOrderId;
    }
    if (isNonEmptyString(args.order_id) && !UUID_REGEX.test(args.order_id)) {
      if (latestOrderId) {
        args.order_id = latestOrderId;
      } else {
        return buildToolValidationError(
          name,
          ['order_id'],
          `order_id "${args.order_id}" không phải UUID hợp lệ. Chỉ dùng order_id thật do create_order trả về, không tự bịa mã đơn.`
        );
      }
    }
  }

  const validation = validateToolArgs(name, args, language);
  if (!validation.valid) {
    return validation.result;
  }

  console.log(`[AI Agent] 🛠️ Thực thi tool: ${name} với tham số:`, args);
  try {
    switch (name) {
      case 'check_inventory': {
        try {
          if (!args || typeof args.product_name !== 'string' || !args.product_name.trim()) {
            return language === 'en' ? 'Unspecified product' : 'Sản phẩm không xác định';
          }
          const productResult = await checkInventory(args.product_name, language);
          if (productResult && productResult.found) {
            if (productResult.is_summary) {
              return JSON.stringify(productResult);
            }
            return JSON.stringify({
              found: true,
              name: productResult.name,
              price_usdc: productResult.price_usdc,
              stock: productResult.stock,
              description: productResult.description,
              selling_points: productResult.selling_points,
              size_options: productResult.size_options,
              color_options: productResult.color_options,
              message: language === 'en'
                ? `Product "${productResult.name}" has ${productResult.stock} units in stock at ${productResult.price_usdc} USDC.`
                : `Sản phẩm "${productResult.name}" còn ${productResult.stock} chiếc trong kho với giá ${productResult.price_usdc} USDC.`
            });
          }
          return JSON.stringify({
            found: false,
            message: language === 'en' ? 'Product not found in inventory.' : 'Không tìm thấy sản phẩm trong kho.'
          });
        } catch (err) {
          console.error('[AI Agent] Lỗi check_inventory tool:', err.message);
          return language === 'en' ? 'Unspecified product' : 'Sản phẩm không xác định';
        }
      }

      case 'create_order': {
        const productResult = await checkInventory(args.product_name, language);
        if (!productResult || productResult.found === false) {
          return JSON.stringify({
            success: false,
            escalate: true,
            reason: 'inventory_not_found',
            message: language === 'en'
              ? `Sorry, we couldn't find the product "${args.product_name}" in stock.`
              : `Không thể tạo đơn hàng vì không tìm thấy sản phẩm "${args.product_name}" trong kho.`
          });
        }

        const threshold = getOrderEscalationThreshold();
        const orderAmount = Number(args.amount || productResult.price_usdc);

        if (orderAmount >= threshold) {
          return JSON.stringify({
            success: false,
            escalate: true,
            reason: 'high_value_order',
            amount: orderAmount,
            threshold,
            message: language === 'en'
              ? `This order (${orderAmount} USDC) exceeds the ${threshold} USDC threshold and requires shop owner approval before the order can be created.`
              : `Đơn hàng ${orderAmount} USDC vượt ngưỡng ${threshold} USDC và cần chủ shop duyệt trước khi tạo đơn.`
          });
        }

        // Sinh reference key ngẫu nhiên dùng thư viện @solana/web3.js
        const referenceKey = Keypair.generate().publicKey.toBase58();
        const sellerWallet = args.seller_wallet || process.env.SELLER_WALLET || '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ';

        const orderProductName = productResult.canonical_name || productResult.sku || productResult.name;
        const displayProductName = productResult.name;

        const newOrder = await createOrder({
          reference: referenceKey,
          product_name: orderProductName,
          amount: orderAmount,
          seller_wallet: sellerWallet,
          status: 'pending',
          customer_name: args.customer_name || null,
          customer_phone: args.customer_phone || null,
          customer_address: args.customer_address || null,
          items_list: args.items_list || null
        });

        if (newOrder && sessionId) {
          orderSessions.set(newOrder.id, sessionId);
          latestOrderBySession.set(sessionId, newOrder.id);
          console.log(`[Order Map] Mapped order ID ${newOrder.id} to session ID ${sessionId}`);
        }

        // Sinh luôn mã QR Code thanh toán Solana Pay để đính kèm vào dữ liệu phản hồi
        const paymentUrl = createPaymentRequest(newOrder);
        const qrCodeImage = await generateQRCode(paymentUrl);

        return JSON.stringify({
          success: true,
          order_id: newOrder.id,
          reference: newOrder.reference,
          product_name: displayProductName,
          canonical_product_name: newOrder.product_name,
          amount: newOrder.amount,
          payment_url: paymentUrl,
          qr_code: qrCodeImage,
          message: language === 'en'
            ? `Order created successfully! Order #${newOrder.id} for ${displayProductName} at ${newOrder.amount} USDC is awaiting payment.`
            : `Tạo đơn hàng thành công! Đơn hàng #${newOrder.id} cho sản phẩm ${displayProductName} với giá ${newOrder.amount} USDC đang chờ thanh toán.`
        });
      }

      case 'generate_payment_qr': {
        const order = await getOrderById(args.order_id);
        if (!order) {
          return JSON.stringify({
            success: false,
            message: language === 'en'
              ? `Order with ID ${args.order_id} not found.`
              : `Không tìm thấy đơn hàng với mã ID: ${args.order_id}`
          });
        }

        const paymentUrl = createPaymentRequest(order);
        const qrCodeImage = await generateQRCode(paymentUrl);

        const displayProductName = await resolveProductDisplayName(order.product_name, language);

        return JSON.stringify({
          success: true,
          order_id: order.id,
          product_name: displayProductName,
          canonical_product_name: order.product_name,
          amount: Number(order.amount),
          payment_url: paymentUrl,
          qr_code: qrCodeImage,
          message: language === 'en'
            ? 'QR code generated successfully. Please show this image to the customer to scan for payment.'
            : 'Sinh mã QR Code thành công. Vui lòng hiển thị ảnh này cho người dùng quét thanh toán.'
        });
      }

      case 'get_reviews': {
        console.log(`[AI Agent] 🔍 Lấy đánh giá cho sản phẩm SKU/Name: "${args.product_sku || args.product_name}"`);
        let sku = args.product_sku || args.product_name;
        const productResult = await checkInventory(sku, language);
        if (productResult && productResult.found && productResult.sku) {
          sku = productResult.sku;
        }
        const result = await getReviewsTool.handler(
          { product_sku: sku, limit: args.limit, min_rating: args.min_rating },
          { db: db.pool, logger: console }
        );
        return JSON.stringify(result);
      }

      case 'log_feedback': {
        args.session_id = args.session_id || sessionId || 'unknown';
        console.log(`[AI Agent] 📝 Ghi nhận phản hồi session: "${args.session_id}" | Nội dung: "${args.content}"`);
        const result = await logFeedbackTool.handler(
          args,
          { db: db.pool, logger: console }
        );
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `Tool ${name} không được hỗ trợ.` });
    }
  } catch (err) {
    console.error(`[AI Agent] ❌ Lỗi khi thực thi tool ${name}:`, err.message);
    return JSON.stringify({ error: err.message });
  }
};

// ─── Logic Chuyển đổi cuộc gọi sang Người thật (Escalation) ──────────────────────

const checkEscalation = (text) => {
  if (!text) return false;
  const normalizedText = normalize(text);
  const rawText = text.toLowerCase();

  const escalationKeywords = [
    'khieu nai', 'khiếu nại',
    'noi chuyen voi nguoi that', 'nói chuyện với người thật',
    'loi san pham', 'lỗi sản phẩm',
    'hoan tien', 'hoàn tiền',
    'nhan vien that', 'nhân viên thật',
    'gap nguoi that', 'gặp người thật',
    'gap nhan vien', 'gặp nhân viên',
    'gap chu shop', 'gặp chủ shop',
    'chuyen sang nguoi that', 'chuyển sang người thật',
    'nhan vien ho tro', 'nhân viên hỗ trợ',
    'support',
    'noi voi nguoi that',
    'nói với người thật',
    'yêu cầu nhân viên',
    'gặp admin',
    'chat với người thật',
    'talk to human', 'talk to a human', 'speak to human', 'real person',
    'human agent', 'live agent', 'customer service',
    'complaint', 'refund', 'defective product', 'product defect',
    'shop owner', 'store owner', 'manager'
  ];
  return escalationKeywords.some(keyword =>
    normalizedText.includes(normalize(keyword)) || rawText.includes(keyword)
  );
};

/**
 * Bắn sự kiện escalation_request tới Dashboard qua WebSocket (Socket.io)
 * Khi khách yêu cầu gặp người thật, Dashboard sẽ nhận thông báo ngay lập tức
 * @param {string} sessionId - ID phiên chat
 * @param {string} userMessage - Tin nhắn cuối cùng của khách
 */
const emitEscalationEvent = (sessionId, userMessage, reason = 'manual_request') => {
  try {
    const io = getIo();
    if (io) {
      const payload = {
        sessionId,
        message: userMessage,
        reason,
        timestamp: new Date().toISOString()
      };
      io.emit('escalation_request', payload);
      console.log(`[AI Agent] 🚨 Đã bắn sự kiện escalation_request cho sessionId: ${sessionId}`);
    } else {
      console.warn('[AI Agent] ⚠️ Socket.io chưa được khởi tạo, không thể bắn escalation event.');
    }

    // Chỉ khóa AI khi khách chủ động yêu cầu người thật hoặc hỏi lặp — không khóa vì lỗi kho tự động
    const autoHandoffReasons = new Set(['manual_request', 'repeated_question']);
    if (typeof addLiveHandoffSession === 'function' && sessionId && autoHandoffReasons.has(reason)) {
      addLiveHandoffSession(sessionId, reason);
    }
  } catch (err) {
    console.error('[AI Agent] ❌ Lỗi khi bắn escalation event:', err.message);
  }
};

// ─── Mock Order: Tạo đơn hàng giả hoàn toàn không cần DB/Blockchain ───────────

/**
 * Tạo một đơn hàng giả (mock) để demo chạy được khi không có DB hoặc Blockchain
 * @param {string} productName - Tên sản phẩm
 * @param {number} amount - Số tiền USDC
 * @returns {Object} Thông tin đơn hàng giả bao gồm mock QR Code
 */
const createMockOrder = (productName = 'Solana Mobile Saga v2', amount = 0.1) => {
  const mockOrderId = 'MOCK-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  const mockReference = 'REF-' + Math.random().toString(36).substring(2, 14).toUpperCase();

  // Ảnh QR giả dạng SVG base64 — hiển thị được ngay trên browser
  const mockQrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="white"/>
    <rect x="10" y="10" width="60" height="60" fill="none" stroke="black" stroke-width="8"/>
    <rect x="25" y="25" width="30" height="30" fill="black"/>
    <rect x="130" y="10" width="60" height="60" fill="none" stroke="black" stroke-width="8"/>
    <rect x="145" y="25" width="30" height="30" fill="black"/>
    <rect x="10" y="130" width="60" height="60" fill="none" stroke="black" stroke-width="8"/>
    <rect x="25" y="145" width="30" height="30" fill="black"/>
    <rect x="85" y="10" width="10" height="10" fill="black"/>
    <rect x="100" y="10" width="10" height="10" fill="black"/>
    <rect x="85" y="25" width="10" height="10" fill="black"/>
    <rect x="100" y="40" width="10" height="10" fill="black"/>
    <rect x="115" y="25" width="10" height="10" fill="black"/>
    <rect x="85" y="85" width="10" height="10" fill="black"/>
    <rect x="100" y="70" width="10" height="10" fill="black"/>
    <rect x="115" y="85" width="10" height="10" fill="black"/>
    <rect x="130" y="85" width="10" height="10" fill="black"/>
    <rect x="85" y="100" width="10" height="10" fill="black"/>
    <rect x="115" y="100" width="10" height="10" fill="black"/>
    <rect x="85" y="115" width="10" height="10" fill="black"/>
    <rect x="100" y="115" width="10" height="10" fill="black"/>
    <rect x="85" y="130" width="10" height="10" fill="black"/>
    <rect x="115" y="130" width="10" height="10" fill="black"/>
    <rect x="130" y="115" width="10" height="10" fill="black"/>
    <rect x="145" y="100" width="10" height="10" fill="black"/>
    <rect x="160" y="100" width="10" height="10" fill="black"/>
    <rect x="175" y="100" width="10" height="10" fill="black"/>
    <rect x="145" y="115" width="10" height="10" fill="black"/>
    <rect x="175" y="115" width="10" height="10" fill="black"/>
    <rect x="145" y="130" width="10" height="10" fill="black"/>
    <rect x="160" y="130" width="10" height="10" fill="black"/>
    <rect x="175" y="130" width="10" height="10" fill="black"/>
    <rect x="145" y="145" width="10" height="10" fill="black"/>
    <rect x="160" y="160" width="10" height="10" fill="black"/>
    <rect x="175" y="160" width="10" height="10" fill="black"/>
    <rect x="145" y="175" width="10" height="10" fill="black"/>
    <rect x="175" y="175" width="10" height="10" fill="black"/>
    <text x="100" y="195" text-anchor="middle" font-size="8" fill="#888">DEMO QR</text>
  </svg>`;

  const mockQrBase64 = 'data:image/svg+xml;base64,' + Buffer.from(mockQrSvg).toString('base64');

  console.log(`[AI Agent] 🎭 Tạo Mock Order: ${mockOrderId} | SP: ${productName} | ${amount} USDC`);

  return {
    id: mockOrderId,
    reference: mockReference,
    product_name: productName,
    amount,
    seller_wallet: process.env.SELLER_WALLET || '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ',
    status: 'pending',
    qr_code: mockQrBase64,
    is_mock: true
  };
};

const parseReplyContent = (content) => {
  if (!content) return { text_reply: '', function_call: null };

  const regex = /<function=([^>]+)>([\s\S]*?)<\/function>/g;
  let text_reply = content;
  let function_call = null;

  const match = regex.exec(content);
  if (match) {
    text_reply = content.replace(regex, '').trim();
    const funcName = match[1].trim();
    const funcArgsStr = match[2].trim();
    let args = {};
    try {
      args = JSON.parse(funcArgsStr);
    } catch (e) {
      args = { raw: funcArgsStr };
    }
    function_call = {
      name: funcName,
      arguments: args
    };
  }

  return { text_reply, function_call };
};

const getSlidingWindow = (messages, limit = 6) => {
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

const buildOrderCreatedReply = (lang, parsed) => {
  if (lang === 'en') {
    return `Order created successfully!

- Product: ${parsed.product_name}
- Amount: ${parsed.amount} USDC (Devnet)
- Order ID: ${parsed.order_id}

Please scan the Solana Pay QR code on your screen with Phantom/Solflare (Devnet) to complete payment.`;
  }
  return `Dạ em đã tạo đơn hàng thành công!

- Sản phẩm: ${parsed.product_name}
- Số tiền: ${parsed.amount} USDC (Devnet)
- Mã đơn: ${parsed.order_id}

Anh/chị vui lòng quét mã QR Solana Pay trên màn hình bằng Phantom/Solflare (Devnet) để thanh toán nhé.`;
};

const buildQrResendReply = (lang, parsed) => (
  lang === 'en'
    ? `Here is your Solana Pay QR code again for order #${parsed.order_id}. Please scan with Phantom/Solflare on Devnet.`
    : `Dạ em gửi lại mã QR thanh toán cho đơn #${parsed.order_id}. Anh/chị quét bằng Phantom/Solflare (Devnet) nhé.`
);

/**
 * Tự động tạo đơn hoặc gửi lại QR khi đủ thông tin — không phụ thuộc LLM tool call.
 */
const tryAutoOrderFlow = async (sessionMessages, sessionId, userMessage, lang) => {
  const existingOrderId = sessionId ? latestOrderBySession.get(sessionId) : null;

  if (existingOrderId && wantsQrResend(userMessage)) {
    const toolResult = await executeTool('generate_payment_qr', { order_id: existingOrderId }, sessionId);
    try {
      const parsed = JSON.parse(toolResult);
      if (parsed.success) {
        const reply = buildQrResendReply(lang, parsed);
        sessionMessages.push({ role: 'assistant', content: reply });
        return {
          success: true,
          reply,
          qrCodeImage: parsed.qr_code,
          orderId: parsed.order_id,
          productName: parsed.product_name,
          amount: parsed.amount
        };
      }
    } catch (_) { /* fall through to LLM */ }
  }

  if (existingOrderId) {
    return null;
  }

  const detection = await fallbackDetectOrder(sessionMessages, lang);
  if (!detection.hasBuyIntent || !detection.hasName || !detection.hasPhone || !detection.hasAddress) {
    return null;
  }

  console.log('[AI Agent] 📦 Auto-detect đủ thông tin đặt hàng (text chat):', {
    productName: detection.productName,
    customerName: detection.customerName
  });

  const toolResult = await executeTool('create_order', {
    product_name: detection.productName,
    amount: detection.amount,
    customer_name: detection.customerName,
    customer_phone: detection.customerPhone,
    customer_address: detection.customerAddress
  }, sessionId);

  let parsed;
  try {
    parsed = JSON.parse(toolResult);
  } catch (_) {
    return null;
  }

  if (parsed.escalate) {
    emitEscalationEvent(sessionId, parsed.message || userMessage, parsed.reason || 'tool_escalation');
    const reply = parsed.message || getEscalationReply(lang);
    sessionMessages.push({ role: 'assistant', content: reply });
    return {
      success: true,
      reply,
      escalate: true,
      escalationReason: parsed.reason || 'tool_escalation'
    };
  }

  if (!parsed.success) {
    return null;
  }

  const reply = buildOrderCreatedReply(lang, parsed);
  sessionMessages.push({ role: 'assistant', content: reply });
  return {
    success: true,
    reply,
    qrCodeImage: parsed.qr_code,
    orderId: parsed.order_id,
    productName: parsed.product_name,
    amount: parsed.amount
  };
};

/**
 * Gửi tin nhắn và nhận phản hồi từ LLM
 * @param {string} sessionId - ID phiên chat để giữ context
 * @param {string} userMessage - Tin nhắn từ người dùng
 * @returns {Promise<Object>} { success, reply, escalate, qrCodeImage, orderId }
 */
const chat = async (sessionId, userMessage, language = 'vi') => {
  const lang = normalizeLanguage(language);

  // 0. Kiểm tra nếu cuộc trò chuyện đã chuyển giao sang người thật (Handoff)
  if (typeof isSessionInHandoff === 'function' && isSessionInHandoff(sessionId)) {
    console.log(`[AI Agent] 🛑 Chặn AI trả lời cho sessionId: ${sessionId} (đang trong chế độ người thật hỗ trợ)`);
    return {
      success: true,
      reply: null,
      suppress: true
    };
  }

  // 1. Kiểm tra logic Escalation ngay trước khi gửi LLM
  if (checkEscalation(userMessage)) {
    // Bắn WebSocket event tới Dashboard để nhân viên biết có khách cần hỗ trợ
    emitEscalationEvent(sessionId, userMessage, 'manual_request');
    return {
      success: true,
      reply: getEscalationReply(lang, 'manual_request'),
      function_call: null,
      escalate: true
    };
  }

  const repeatCheck = getRepeatEscalation(sessionId, userMessage);
  if (repeatCheck.shouldEscalate) {
    const reply = getEscalationReply(lang, 'repeated_question');
    emitEscalationEvent(sessionId, userMessage, 'repeated_question');
    return {
      success: true,
      reply,
      function_call: null,
      escalate: true,
      escalationReason: 'repeated_question'
    };
  }

  const sessionMessages = await getOrCreateSession(sessionId, lang);

  // Lưu tin nhắn của người dùng vào context
  sessionMessages.push({ role: 'user', content: userMessage });

  const autoOrderResult = await tryAutoOrderFlow(sessionMessages, sessionId, userMessage, lang);
  if (autoOrderResult) {
    return autoOrderResult;
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;

  // Xác định API Key, Endpoint và Model sử dụng
  let apiKey = null;
  let apiUrl = 'https://api.openai.com/v1/chat/completions';
  let modelName = 'gpt-4o-mini';

  if (groqApiKey) {
    apiKey = groqApiKey;
    apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
    // modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    console.log(`[AI Agent] 🚀 Sử dụng Groq API với Model: ${modelName}`);
  } else if (openaiApiKey) {
    apiKey = openaiApiKey;
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    modelName = 'gpt-4o-mini';
    console.log(`[AI Agent] 🚀 Sử dụng OpenAI API với Model: ${modelName}`);
  }

  // Nếu không có API Key, chạy chế độ Mock/Sandbox tự động để demo hoạt động không bị crash
  if (!apiKey) {
    console.warn('[AI Agent] ⚠️ Không có GROQ_API_KEY / OPENAI_API_KEY — dùng mockChatFlow');
    return mockChatFlow(sessionMessages, userMessage, sessionId, lang);
  }

  try {
    const basePayload = {
      model: modelName,
      messages: getSlidingWindow(sessionMessages, 6),
      temperature: 0.4
    };

    let { data } = await callChatCompletions(apiUrl, apiKey, {
      ...basePayload,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: false
    });

    if (data.error && isGroqToolCallError(data.error)) {
      console.warn('[AI Agent] ⚠️ Groq tool-call failed:', data.error.message);
      if (data.error.failed_generation) {
        console.warn('[AI Agent] failed_generation:', String(data.error.failed_generation).slice(0, 500));
      }

      const fallbackModel = process.env.GROQ_TOOL_MODEL || 'llama-3.3-70b-versatile';
      if (fallbackModel !== modelName) {
        console.warn(`[AI Agent] 🔁 Retry tool-call với model: ${fallbackModel}`);
        ({ data } = await callChatCompletions(apiUrl, apiKey, {
          ...basePayload,
          model: fallbackModel,
          tools: OPENAI_TOOLS,
          tool_choice: 'auto',
          parallel_tool_calls: false
        }));
      }

      if (data.error && isGroqToolCallError(data.error)) {
        console.warn('[AI Agent] 🔁 Retry không dùng tools (plain text)');
        ({ data } = await callChatCompletions(apiUrl, apiKey, basePayload));
      }
    }

    if (data.error) {
      throw new Error(`API Error: ${data.error.message}${data.error.failed_generation ? ` | failed_generation: ${String(data.error.failed_generation).slice(0, 200)}` : ''}`);
    }

    let assistantMessage = data.choices[0].message;

    // Xử lý Tool Calling (nếu LLM yêu cầu gọi Tool)
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Đưa assistant message chứa tool_calls vào history
      sessionMessages.push(assistantMessage);

      let qrCodeImage = null;
      let orderId = null;
      let productName = null;
      let amount = null;
      let toolEscalation = null;

      for (const toolCall of assistantMessage.tool_calls) {
        const name = toolCall.function.name;
        const args = parseToolArguments(toolCall.function.arguments);

        // Thực thi tool
        const toolResult = await executeTool(name, args, sessionId);

        // Lưu thông tin phục vụ trả về trực tiếp cho UI nếu có
        let cleanToolResultStr = toolResult;
        try {
          const parsed = JSON.parse(toolResult);
          if (parsed.found === false && name === 'check_inventory') {
            if (shouldEscalateInventoryNotFound(userMessage, args.product_name)) {
              console.log(`[AI Agent] ⚠️ inventory_not_found → escalate (product: "${args.product_name}")`);
              toolEscalation = {
                reason: 'inventory_not_found',
                message: parsed.message || `Không tìm thấy sản phẩm "${args.product_name || userMessage}" trong kho.`,
                reply: getEscalationReply(lang, 'inventory_not_found')
              };
            } else {
              console.log(`[AI Agent] ℹ️ inventory_not_found → bỏ qua escalate (generic/greeting, product: "${args.product_name}")`);
            }
          }
          if (parsed.escalate) {
            toolEscalation = {
              reason: parsed.reason || 'tool_escalation',
              message: parsed.message || userMessage,
              reply: parsed.message || getEscalationReply(lang)
            };
          }
        } catch (_) { }

        if (name === 'generate_payment_qr' || name === 'create_order') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success) {
              if (name === 'generate_payment_qr') {
                qrCodeImage = parsed.qr_code;
                orderId = parsed.order_id;
              }
            }
          } catch (_) { }
        }
        if (name === 'create_order') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success) {
              if (parsed.qr_code) {
                qrCodeImage = parsed.qr_code;
                delete parsed.qr_code; // Xóa base64 khỏi góc nhìn của AI
              }
              orderId = parsed.order_id;
              productName = parsed.product_name;
              amount = parsed.amount;

              cleanToolResultStr = JSON.stringify(parsed);
            }
          } catch (_) { }
        }

        // Đưa kết quả tool vào history (bản đã dọn dẹp Base64)
        sessionMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: name,
          content: cleanToolResultStr
        });
      }

      if (toolEscalation) {
        emitEscalationEvent(sessionId, toolEscalation.message, toolEscalation.reason);
        const reply = toolEscalation.reply;
        sessionMessages.push({ role: 'assistant', content: reply });
        return {
          success: true,
          reply,
          function_call: null,
          escalate: true,
          escalationReason: toolEscalation.reason,
          qrCodeImage,
          orderId,
          productName,
          amount
        };
      }

      // Gọi lại API lần thứ 2 với kết quả của tool
      const secondModel = process.env.GROQ_TOOL_MODEL || modelName;
      ({ data } = await callChatCompletions(apiUrl, apiKey, {
        model: secondModel,
        messages: getSlidingWindow(sessionMessages, 6),
        temperature: 0.4
      }));
      if (data.error) {
        throw new Error(`Second-step API Error: ${data.error.message}`);
      }
      assistantMessage = data.choices[0].message;

      // Lưu câu trả lời cuối cùng vào history
      sessionMessages.push(assistantMessage);

      // Xóa cú pháp <function=...> rác nếu LLM bịa ra trong text
      const assistantContent = assistantMessage.content || '';
      const cleanReply = assistantContent.replace(/<function=.*?>.*?<\/function>/gs, '').trim();
      const { text_reply, function_call } = parseReplyContent(assistantContent);
      return {
        success: true,
        reply: cleanReply,
        function_call,
        escalate: checkEscalation(userMessage),
        qrCodeImage,
        orderId,
        productName,
        amount
      };
    } else {
      // Không có tool call, lưu câu trả lời vào history và trả về
      sessionMessages.push(assistantMessage);

      // Xóa cú pháp <function=...> rác nếu LLM bịa ra trong text
      const assistantContent = assistantMessage.content || '';
      const cleanReply = assistantContent.replace(/<function=.*?>.*?<\/function>/gs, '').trim();
      const { text_reply, function_call } = parseReplyContent(assistantContent);
      return {
        success: true,
        reply: cleanReply,
        function_call,
        escalate: checkEscalation(userMessage)
      };
    }

  } catch (error) {
    console.error('[AI Agent] ❌ Lỗi xử lý LLM Chat:', error.message);
    if (isRateLimitError(error)) {
      return {
        success: true,
        reply: 'Dạ hiện tại AI đang nhận hơi nhiều yêu cầu cùng lúc. Anh/chị vui lòng chờ vài giây rồi nhắn lại giúp em nhé.',
        escalate: false,
        retryable: true
      };
    }
    return {
      success: false,
      reply: `Xin lỗi, hệ thống AI đang gặp sự cố kết nối: ${error.message}. Em có thể giúp gì thêm cho anh/chị?`,
      escalate: false
    };
  }
};

// ─── Hướng dẫn & Tích hợp Agora SDK ─────────────────────────────────────────

/**
 * Tạo token RTC dùng cho user/agent tham gia kênh voice
 * @param {string} channelName - Tên kênh RTC
 * @param {number|string} uid - ID người dùng/agent
 * @returns {string} RTC Token
 */
const generateAgoraToken = (channelName, uid) => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    console.warn('[Agora] ⚠️ Thiếu AGORA_APP_ID hoặc AGORA_APP_CERTIFICATE. Trả về token mock...');
    return 'mock-agora-token-' + Date.now();
  }

  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600; // Hết hạn sau 1 giờ
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  // Sử dụng thư viện agora-token chính thức
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    Number(uid),
    role,
    privilegeExpiredTs
  );

  return { token, appId };
};

/**
 * Gọi REST API tới Agora Conversational AI Engine để mời Agent tham gia kênh RTC
 * Đã cấu hình đầy đủ: LLM (Groq/LLaMA 3.3), ASR (vi-VN), TTS (Microsoft HoaiMy),
 * System Prompt, Tools và Webhook URL cho tool calling.
 * @param {string} channelName - Tên kênh RTC
 * @param {number} agentUid - UID của AI Agent (ví dụ: 999)
 * @param {string} language - Ngôn ngữ ('vi' hoặc 'en')
 * @param {string} sessionId - ID phiên chat text để đồng bộ ngữ cảnh (Context Sync)
 */
const startAgoraAgent = async (channelName, agentUid = 999, language = 'vi', sessionId = null) => {
  const finalSessionId = sessionId || channelName;

  if (activeAgoraAgents.has(finalSessionId)) {
    const existingAgentId = activeAgoraAgents.get(finalSessionId);
    console.log(`[Agora] Agent đã tồn tại cho session ${finalSessionId}, bỏ qua start lặp.`);
    return {
      success: true,
      agentName: `existing-${finalSessionId}`,
      data: { agent_id: existingAgentId, status: 'RUNNING', reused: true }
    };
  }

  if (startingAgoraAgents.has(finalSessionId)) {
    console.log(`[Agora] Agent đang được khởi động cho session ${finalSessionId}, bỏ qua start lặp.`);
    return {
      success: true,
      agentName: `starting-${finalSessionId}`,
      data: { agent_id: null, status: 'STARTING', reused: true }
    };
  }

  startingAgoraAgents.set(finalSessionId, true);

  try {
    const appId = process.env.AGORA_APP_ID;
    const customerId = process.env.AGORA_CUSTOMER_ID;
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
    const ngrokUrl = process.env.NGROK_URL;

    const agentName = `shoptalk-${channelName.slice(0, 8)}-${Date.now()}`;

    // Sinh token cho agent
    const { RtcTokenBuilder, RtcRole } = require('agora-token');
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600;
    const agentToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      process.env.AGORA_APP_CERTIFICATE,
      channelName,
      agentUid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    );

    const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
    const lang = normalizeLanguage(language);
    const asrLanguage = lang === 'en' ? 'en-US' : 'vi-VN';
    const ttsVoice = lang === 'en' ? 'en-US-JennyNeural' : 'vi-VN-NamMinhNeural';
    const voicePrompt = getSystemPromptForLanguage(lang, 'voice');
    const webhookSessionId = sessionId || channelName;

    if (webhookSessionId) {
      sessionLanguages.set(webhookSessionId, lang);
    }

    const greetingMessage = lang === 'en'
      ? 'Hello! Welcome to ShopTalk. I am Mia, your fashion consultant. What style are you looking for today — casual, office, or loungewear?'
      : 'Dạ, ShopTalk xin chào anh/chị! Em là Mia, nhân viên tư vấn thời trang của shop. Hôm nay anh chị đang tìm kiểu gì ạ — đi chơi, đi làm, hay mặc nhà?';

    const failureMessage = lang === 'en'
      ? 'Sorry, we are having a brief connection issue. Please wait a moment.'
      : 'Dạ, em xin lỗi, đường truyền đang gặp chút vấn đề. Anh chị vui lòng đợi em một xíu ạ.';

    const silenceContent = lang === 'en'
      ? 'Are you still there?'
      : 'Dạ không biết anh chị còn ở đó không ạ?';

    // KHÔNG dùng pipeline_id — dùng config độc lập hoàn toàn
    const body = {
      name: agentName,
      properties: {
        channel: channelName,
        token: agentToken,
        agent_rtc_uid: String(agentUid),
        remote_rtc_uids: ['*'],
        enable_string_uid: false,
        asr: {
          vendor: 'ares',
          language: asrLanguage,
          params: {}
        },
        llm: {
          vendor: 'custom',
          url: `${ngrokUrl}/api/agora/llm-webhook?sessionId=${encodeURIComponent(webhookSessionId)}&language=${lang}`,
          params: { model: 'llama-3.3-70b-versatile' },
          failure_message: failureMessage,
          greeting_message: greetingMessage,
          system_messages: [
            { role: 'system', content: voicePrompt }
          ]
        },
        tts: {
          vendor: 'microsoft',
          credential_name: 'Azure_Voice',
          params: {
            voice_name: ttsVoice,
            key: process.env.AZURE_TTS_KEY,
            region: process.env.AZURE_TTS_REGION
          }
        },
        parameters: {
          silence_config: {
            action: 'think',
            content: silenceContent,
            timeout_ms: 10000
          }
        },
        idle_timeout: 120,
        advanced_features: {
          enable_rtm: true,
          enable_sal: false
        }
      }
    };

    console.log(`[Agora] 📡 Starting agent "${agentName}" | Channel: "${channelName}" | ASR: ${asrLanguage} | Lang: ${lang}`);
    console.log(`[Agora] 🔗 LLM Webhook: ${ngrokUrl}/api/agora/llm-webhook`);

    const response = await fetch(
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[Agora] ❌ Lỗi gọi API Join:', JSON.stringify(data));
      startingAgoraAgents.delete(finalSessionId);
      return { success: false, message: JSON.stringify(data), data };
    }

    console.log(`[Agora] ✅ SUCCESS! Agent joined channel`);
    console.log(`[Agora] 📥 Agent ID: ${data.agent_id}`);
    console.log(`[Agora] 📥 Status: ${data.status}`);

    if (data.agent_id) {
      activeAgoraAgents.set(finalSessionId, data.agent_id);
      console.log(`[Agora Map] Mapped session ID ${finalSessionId} to Agent ID ${data.agent_id}`);
    }

    startingAgoraAgents.delete(finalSessionId);
    return { success: true, agentName, data };

  } catch (error) {
    console.error('[Agora] ❌ Exception:', error.message);
    startingAgoraAgents.delete(finalSessionId);
    return { success: false, message: error.message };
  }
};

// ─── Sandbox / Mock Chat Flow cho Hackathon Demo khi không có API Key LLM ───
/**
 * Xử lý hội thoại demo hoàn toàn offline — không cần DB, Blockchain hay API Key.
 * Dùng createMockOrder() để tạo đơn giả, trả về QR ảnh giả trông như thật.
 */
const mockChatFlow = async (sessionMessages, userMessage, sessionId = null, language = 'vi') => {
  const lang = language === 'en' ? 'en' : 'vi';
  const lowercaseMsg = userMessage.toLowerCase();
  let reply = '';
  let qrCodeImage = null;
  let orderId = null;
  let productName = null;
  let amount = null;

  // ─── Xem hàng / Danh sách sản phẩm ─────────────────────────────────────────
  if (
    lowercaseMsg.includes('kho') ||
    lowercaseMsg.includes('san pham') ||
    lowercaseMsg.includes('sản phẩm') ||
    lowercaseMsg.includes('có gì') ||
    lowercaseMsg.includes('co gi') ||
    lowercaseMsg.includes('bán gì') ||
    lowercaseMsg.includes('ban gi') ||
    lowercaseMsg.includes('xem hàng') ||
    lowercaseMsg.includes('danh sach') ||
    lowercaseMsg.includes('catalog') ||
    lowercaseMsg.includes('product') ||
    lowercaseMsg.includes('inventory') ||
    lowercaseMsg.includes('stock') ||
    lowercaseMsg.includes('items') ||
    lowercaseMsg.includes('what do you sell') ||
    lowercaseMsg.includes('what do you have') ||
    lowercaseMsg.includes('list')
  ) {
    const CATALOG_REPLY = {
      vi: `Dạ bên em đang có các sản phẩm sau anh/chị ơi! 🛍️

📱 **Điện thoại:**
- Solana Mobile Saga Phone — **499.99 USDC** (còn 5 chiếc)
- Solana Mobile Saga v2 — **0.1 USDC** (demo, còn 10 chiếc)

📦 **Phụ kiện điện thoại:**
- Ốp lưng Saga Phone trong suốt — **8 USDC**
- Cáp sạc USB-C 1m — **5 USDC**
- Củ sạc nhanh 65W GaN — **18 USDC**
- Tai nghe TWS Blockchain Edition — **35 USDC**

👕 **Thời trang:**
- ShopTalk T-Shirt — **15 USDC**
- Áo hoodie Crypto Dev — **28 USDC**
- Mũ lưỡi trai ShopTalk — **12 USDC**

🔐 **Phụ kiện Crypto:**
- Ledger Nano S Plus — **79 USDC**
- Phantom Wallet Keychain — **6 USDC**
- Sticker Pack Web3 — **3 USDC**
- Balo Laptop Crypto — **45 USDC**

Anh/chị quan tâm sản phẩm nào ạ? 😊`,
      en: `Hi there! Here are the products we currently have! 🛍️

📱 **Phones:**
- Solana Mobile Saga Phone — **499.99 USDC** (5 left)
- Solana Mobile Saga v2 — **0.1 USDC** (demo, 10 left)

📦 **Phone accessories:**
- Saga Phone clear case — **8 USDC**
- USB-C cable 1m — **5 USDC**
- 65W GaN fast charger — **18 USDC**
- TWS Blockchain Edition earbuds — **35 USDC**

👕 **Fashion:**
- ShopTalk T-Shirt — **15 USDC**
- Crypto Dev hoodie — **28 USDC**
- ShopTalk cap — **12 USDC**

🔐 **Crypto accessories:**
- Ledger Nano S Plus — **79 USDC**
- Phantom Wallet Keychain — **6 USDC**
- Web3 Sticker Pack — **3 USDC**
- Crypto Laptop Backpack — **45 USDC**

Which product are you interested in? 😊`
    };
    reply = CATALOG_REPLY[lang];
  }

  // ─── Mua hàng / Đặt đơn ─────────────────────────────────────────────────────
  else if (
    lowercaseMsg.includes('mua') ||
    lowercaseMsg.includes('đặt hàng') ||
    lowercaseMsg.includes('dat hang') ||
    lowercaseMsg.includes('chốt') ||
    lowercaseMsg.includes('chot') ||
    lowercaseMsg.includes('order') ||
    lowercaseMsg.includes('saga') ||
    lowercaseMsg.includes('ao') ||
    lowercaseMsg.includes('mu ') ||
    lowercaseMsg.includes('ledger') ||
    lowercaseMsg.includes('tai nghe') ||
    lowercaseMsg.includes('op lung') ||
    lowercaseMsg.includes('ốp lưng') ||
    lowercaseMsg.includes('cap sac') ||
    lowercaseMsg.includes('balo') ||
    lowercaseMsg.includes('sticker') ||
    lowercaseMsg.includes('buy') ||
    lowercaseMsg.includes('shirt') ||
    lowercaseMsg.includes('hoodie') ||
    lowercaseMsg.includes('cap') ||
    lowercaseMsg.includes('case') ||
    lowercaseMsg.includes('charger') ||
    lowercaseMsg.includes('earbuds') ||
    lowercaseMsg.includes('keychain') ||
    lowercaseMsg.includes('backpack')
  ) {
    productName = 'Solana Mobile Saga v2 (Demo)';
    amount = 0.1;

    if (lowercaseMsg.includes('saga phone') || lowercaseMsg.includes('saga v1') || (lowercaseMsg.includes('saga') && !lowercaseMsg.includes('v2'))) {
      productName = 'Solana Mobile Saga Phone'; amount = 499.99;
    } else if (lowercaseMsg.includes('ledger')) {
      productName = 'Ledger Nano S Plus'; amount = 79.00;
    } else if (lowercaseMsg.includes('tai nghe') || lowercaseMsg.includes('earbuds')) {
      productName = 'Tai nghe TWS Blockchain Edition'; amount = 35.00;
    } else if (lowercaseMsg.includes('hoodie') || lowercaseMsg.includes('ao')) {
      productName = 'Áo hoodie Crypto Dev'; amount = 28.00;
    } else if (lowercaseMsg.includes('t-shirt') || lowercaseMsg.includes('tshirt') || lowercaseMsg.includes('shirt')) {
      productName = 'ShopTalk T-Shirt'; amount = 15.00;
    } else if (lowercaseMsg.includes('mu') || lowercaseMsg.includes('mũ') || lowercaseMsg.includes('cap')) {
      productName = 'Mũ lưỡi trai ShopTalk'; amount = 12.00;
    } else if (lowercaseMsg.includes('balo') || lowercaseMsg.includes('backpack')) {
      productName = 'Balo Laptop Crypto'; amount = 45.00;
    } else if (lowercaseMsg.includes('op lung') || lowercaseMsg.includes('ốp lưng') || lowercaseMsg.includes('case')) {
      productName = 'Ốp lưng Saga Phone trong suốt'; amount = 8.00;
    } else if (lowercaseMsg.includes('cap sac') || lowercaseMsg.includes('cáp sạc') || lowercaseMsg.includes('charger') || lowercaseMsg.includes('cable')) {
      productName = 'Cáp sạc USB-C 1m'; amount = 5.00;
    } else if (lowercaseMsg.includes('sticker')) {
      productName = 'Sticker Pack Web3'; amount = 3.00;
    } else if (lowercaseMsg.includes('keychain') || lowercaseMsg.includes('phantom')) {
      productName = 'Phantom Wallet Keychain'; amount = 6.00;
    }

    try {
      const mockOrder = createMockOrder(productName, amount);
      orderId = mockOrder.id;
      qrCodeImage = mockOrder.qr_code;
      if (sessionId) {
        orderSessions.set(mockOrder.id, sessionId);
        console.log(`[Mock Chat] Mapped mock order ID ${mockOrder.id} to session ID ${sessionId}`);
      }

      if (lang === 'en') {
        reply = `Order created successfully! 🎉

- 📦 **Product**: ${mockOrder.product_name}
- 💵 **Amount**: ${mockOrder.amount} USDC (Devnet)
- 🔖 **Order ID**: \`${mockOrder.id}\`

📲 Below is the Solana Pay QR Code. Please open your **Phantom/Solflare** wallet (remember to switch to **Devnet** network) and scan this QR code to complete the payment!

⏰ The QR code is valid for **15 minutes**. If it expires, you can message me to generate a new one.`;
      } else {
        reply = `Dạ em đã tạo đơn hàng thành công cho anh/chị rồi ạ! 🎉

- 📦 **Sản phẩm**: ${mockOrder.product_name}
- 💵 **Số tiền**: ${mockOrder.amount} USDC (Devnet)
- 🔖 **Mã đơn hàng**: \`${mockOrder.id}\`

📲 Dưới đây là mã QR Code thanh toán Solana Pay. Anh/chị vui lòng mở ví **Phantom/Solflare** (nhớ chọn mạng **Devnet**) rồi quét mã này để hoàn tất thanh toán nhé!

⏰ Mã QR có hiệu lực trong **15 phút**, nếu hết hạn anh/chị có thể nhắn lại để em tạo mới ạ.`;
      }
    } catch (mockErr) {
      reply = lang === 'en'
        ? `System error during order creation: ${mockErr.message}`
        : `Lỗi hệ thống khi tạo đơn hàng: ${mockErr.message}`;
    }
  }

  // ─── Hướng dẫn thanh toán ────────────────────────────────────────────────────
  else if (
    lowercaseMsg.includes('thanh toán') ||
    lowercaseMsg.includes('thanh toan') ||
    lowercaseMsg.includes('chuyển tiền') ||
    lowercaseMsg.includes('chuyen tien') ||
    lowercaseMsg.includes('qr') ||
    lowercaseMsg.includes('phantom') ||
    lowercaseMsg.includes('solflare') ||
    lowercaseMsg.includes('payment') ||
    lowercaseMsg.includes('pay') ||
    lowercaseMsg.includes('how to pay')
  ) {
    const PAYMENT_REPLY = {
      vi: `Dạ để thanh toán anh/chị làm theo các bước sau nhé:

1️⃣ Mở app **Phantom** hoặc **Solflare** trên điện thoại
2️⃣ Chuyển sang mạng **Devnet** (vào Settings → Network → Devnet)
3️⃣ Đảm bảo có **USDC Devnet** trong ví (lấy miễn phí tại faucet.solana.com)
4️⃣ Quét mã QR em đã gửi ở trên
5️⃣ Xác nhận giao dịch — tiền sẽ chuyển trong vài giây!

Nếu anh/chị cần hỗ trợ thêm cứ nhắn em nhé 😊`,
      en: `To pay, please follow these steps:

1️⃣ Open the **Phantom** or **Solflare** app on your phone
2️⃣ Switch to the **Devnet** network (go to Settings → Network → Devnet)
3️⃣ Ensure you have **Devnet USDC** in your wallet (get it for free at faucet.solana.com)
4️⃣ Scan the QR code I sent above
5️⃣ Confirm the transaction — payment completes in seconds!

If you need any further assistance, feel free to message me! 😊`
    };
    reply = PAYMENT_REPLY[lang];
  }
  else {
    const DEFAULT_REPLY = {
      vi: `Dạ cửa hàng **ShopTalk** xin chào anh/chị! 👋

Em là trợ lý AI bán hàng tự động của ShopTalk. Em có thể giúp anh/chị:
- 🔍 **Xem danh sách sản phẩm** (gõ: "xem hàng" hoặc "có gì bán")
- 🛒 **Đặt hàng** (gõ tên sản phẩm + "mua")
- 💳 **Hướng dẫn thanh toán** USDC qua Solana Pay

Anh/chị cần em hỗ trợ gì ạ? 😊`,
      en: `Welcome to **ShopTalk**! 👋

I am your automated AI Sales Assistant. I can help you with:
- 🔍 **View product catalog** (type: "catalog" or "what do you sell")
- 🛒 **Place an order** (type product name + "buy")
- 💳 **Payment guide** for USDC via Solana Pay

How can I help you today? 😊`
    };
    reply = DEFAULT_REPLY[lang];
  }

  sessionMessages.push({ role: 'assistant', content: reply });

  return {
    success: true,
    reply,
    escalate: false,
    qrCodeImage,
    orderId,
    productName,
    amount
  };
};

const triggerAgentSpeak = async (sessionId, text) => {
  try {
    const agentId = activeAgoraAgents.get(sessionId);
    if (!agentId) {
      console.warn(`[Agora] Không tìm thấy agentId cho sessionId: ${sessionId}, không thể phát tiếng nói.`);
      return false;
    }

    const appId = process.env.AGORA_APP_ID;
    const customerId = process.env.AGORA_CUSTOMER_ID;
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

    if (!appId || !customerId || !customerSecret) {
      console.warn('[Agora] Thiếu cấu hình credentials, không thể gọi speak API.');
      return false;
    }

    const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

    console.log(`[Agora Speak] Gửi yêu cầu speak đến Agent ${agentId} cho session ${sessionId}: "${text}"`);

    const response = await fetch(
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/speak`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          priority: 'INTERRUPT',
          interruptable: true
        })
      }
    );

    if (!response.ok) {
      const errData = await response.text();
      console.error('[Agora Speak] Lỗi API speak:', errData);
      return false;
    }

    console.log('[Agora Speak] Kích hoạt Agent phát tiếng nói thành công.');
    return true;
  } catch (error) {
    console.error('[Agora Speak] Exception:', error.message);
    return false;
  }
};

const getSessionHistory = (sessionId) => {
  if (!chatSessions.has(sessionId)) return [];
  return chatSessions.get(sessionId);
};

module.exports = {
  groq,
  chat,
  generateAgoraToken,
  startAgoraAgent,
  createMockOrder,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_VOICE,
  OPENAI_TOOLS,
  executeTool,
  orderSessions,
  activeAgoraAgents,
  triggerAgentSpeak,
  getSessionHistory,
  emitEscalationEvent,
  checkEscalation,
  normalizeLanguage,
  getSystemPromptForLanguage,
  sessionLanguages,
  SYSTEM_PROMPT_EN,
  SYSTEM_PROMPT_VOICE_EN,
  mockChatFlow
};
