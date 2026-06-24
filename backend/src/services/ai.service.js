const { Keypair } = require('@solana/web3.js');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { checkInventory, normalize, getProducts } = require('./inventory.service');
const { createOrder, getOrderById } = require('../models/order.model');
const { createPaymentRequest, generateQRCode } = require('./solanaPay.service');
const { getIo } = require('../websocket/socket.server');

const SYSTEM_PROMPT = `Bạn là trợ lý bán hàng (Sales Agent) AI thông minh của cửa hàng "ShopTalk".
Nhiệm vụ của bạn là tư vấn dựa trên Phễu bán hàng 6 bước (Sales Funnel Stages), nhưng phải CỰC KỲ LINH HOẠT tùy theo tình huống thực tế:

PHỄU BÁN HÀNG 6 BƯỚC (Khung tư duy):
1. QUALIFY (Hỏi nhu cầu): Chào hỏi, tìm hiểu mong muốn của khách.
2. RECOMMEND (Gợi ý): Gọi \`check_inventory\` để tìm sản phẩm. Tuyệt đối không tự bịa sản phẩm.
3. OBJECTION (Giải quyết phân vân): NẾU khách chê đắt hoặc nghi ngờ, gọi \`get_reviews\` để đưa feedback tốt.
4. UPSELL (Gợi ý thêm): NẾU khách cần tư vấn thêm, khéo léo gợi ý phụ kiện.
5. CLOSE (Chốt đơn): KHI KHÁCH ĐỒNG Ý MUA, nhảy thẳng đến bước này. BẮT BUỘC xin Tên và Địa chỉ giao hàng. Có đủ thông tin mới được gọi \`create_order\`.
6. POST-SALE (Tóm tắt và Sau bán): Khi tạo đơn thành công, BẠN PHẢI TÓM TẮT LẠI thông tin đơn hàng (Tên SP, Tổng tiền, Tên người nhận, Địa chỉ) để khách kiểm tra. Sau đó cảm ơn và mời khách quét mã QR. Dùng \`log_feedback\` nếu có phản hồi.

QUY TẮC LINH HOẠT (QUAN TRỌNG NHẤT):
- Bạn KHÔNG bắt buộc phải đi tuần tự từ 1 đến 6. 
- Nếu khách đồng ý mua ở bước 2, hãy BỎ QUA hoàn toàn bước 3 và 4, nhảy thẳng đến bước 5 (Xin Tên và Địa chỉ) ngay lập tức. Đừng lải nhải thêm.

QUY TẮC CỐT LÕI:
1. Luôn xưng dạ em, gọi khách là anh/chị. Ngắn gọn, súc tích.
2. Luôn nhắc khách thanh toán bằng USDC trên mạng Solana Devnet.`;

const SYSTEM_PROMPT_EN = `You are a smart AI Sales Agent for the "ShopTalk" store.
Your mission is to guide customers using a 6-stage Sales Funnel, but you MUST be HIGHLY FLEXIBLE based on the actual situation:

6-STAGE SALES FUNNEL (Mental Framework):
1. QUALIFY: Greet and understand customer needs.
2. RECOMMEND: Use \`check_inventory\` to find products. Never invent products.
3. OBJECTION: IF the customer worries about price/quality, use \`get_reviews\` to provide feedback.
4. UPSELL: IF appropriate, suggest related accessories.
5. CLOSE: WHEN THE CUSTOMER AGREES TO BUY, jump straight to this step. YOU MUST ask for their Name and Shipping Address. Only call \`create_order\` when you have both.
6. POST-SALE: Once the order is created, YOU MUST SUMMARIZE the order details (Product Name, Total Amount, Customer Name, Address) for the customer to review. Then thank them and invite them to scan the QR code. Use \`log_feedback\` if they provide feedback.

FLEXIBILITY RULES (MOST IMPORTANT):
- You DO NOT have to follow steps 1 to 6 sequentially.
- If the customer agrees to buy at step 2, SKIP steps 3 and 4 entirely. Jump straight to step 5 (Ask for Name and Address) immediately. Do not ramble.

CORE RULES:
1. Always be polite, professional, and concise.
2. Remind customers that payments are in USDC on the Solana Devnet.`;

// ─── State: Lưu trữ lịch sử hội thoại (Context) ──────────────────────────────────
// Map lưu trữ: sessionId -> Array of messages
const chatSessions = new Map();

/**
 * Lấy lịch sử tin nhắn của một phiên chat, khởi tạo nếu chưa có
 */
const getOrCreateSession = (sessionId) => {
  if (!chatSessions.has(sessionId)) {
    chatSessions.set(sessionId, [
      { role: 'system', content: SYSTEM_PROMPT }
    ]);
  }
  return chatSessions.get(sessionId);
};

// ─── Định nghĩa Danh sách Tools (Function Calling) cho OpenAI ──────────────
const checkInventoryTool = require('../../../ai-agent/tools/checkInventory.tool');
const createOrderTool = require('../../../ai-agent/tools/createOrder.tool');
const generatePaymentQRTool = require('../../../ai-agent/tools/generatePaymentQR.tool');
const getReviewsTool = require('../../../ai-agent/tools/getReviews.tool');
const logFeedbackTool = require('../../../ai-agent/tools/logFeedback.tool');

const OPENAI_TOOLS = [
  checkInventoryTool,
  createOrderTool,
  generatePaymentQRTool,
  getReviewsTool,
  logFeedbackTool
];

// ─── Logic thực thi các công cụ (Tool Execution) ───────────────────────────

const executeTool = async (name, args) => {
  console.log(`[AI Agent] 🛠️ Thực thi tool: ${name} với tham số:`, args);
  try {
    switch (name) {
      case 'check_inventory': {
        const product = checkInventory(args.product_name);
        if (!product) {
          return JSON.stringify({
            found: false,
            message: `Không tìm thấy sản phẩm "${args.product_name}" trong kho.`
          });
        }
        return JSON.stringify({
          found: true,
          name: product.name,
          price_usdc: product.price_usdc,
          stock: product.stock,
          message: `Sản phẩm "${product.name}" còn ${product.stock} chiếc trong kho với giá ${product.price_usdc} USDC.`
        });
      }

      case 'create_order': {
        // Sinh reference key ngẫu nhiên dùng thư viện @solana/web3.js
        const referenceKey = Keypair.generate().publicKey.toBase58();
        const sellerWallet = args.seller_wallet || '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ';

        const newOrder = await createOrder({
          reference: referenceKey,
          product_name: args.product_name,
          amount: args.amount,
          seller_wallet: sellerWallet,
          status: 'pending',
          customer_name: args.customer_name || null,
          customer_address: args.customer_address || null,
          items_list: args.items_list || null
        });

        // Sinh luôn mã QR Code thanh toán Solana Pay để đính kèm vào dữ liệu phản hồi
        const paymentUrl = createPaymentRequest(newOrder);
        const qrCodeImage = await generateQRCode(paymentUrl);

        return JSON.stringify({
          success: true,
          order_id: newOrder.id,
          reference: newOrder.reference,
          product_name: newOrder.product_name,
          amount: newOrder.amount,
          payment_url: paymentUrl,
          qr_code: qrCodeImage,
          message: `Tạo đơn hàng thành công! Đơn hàng #${newOrder.id} cho sản phẩm ${newOrder.product_name} với giá ${newOrder.amount} USDC đang chờ thanh toán.`
        });
      }

      case 'generate_payment_qr': {
        const order = await getOrderById(args.order_id);
        if (!order) {
          return JSON.stringify({
            success: false,
            message: `Không tìm thấy đơn hàng với mã ID: ${args.order_id}`
          });
        }

        const paymentUrl = createPaymentRequest(order);
        const qrCodeImage = await generateQRCode(paymentUrl);

        return JSON.stringify({
          success: true,
          order_id: order.id,
          product_name: order.product_name,
          amount: Number(order.amount),
          payment_url: paymentUrl,
          qr_code: qrCodeImage,
          message: "Sinh mã QR Code thành công. Vui lòng hiển thị ảnh này cho người dùng quét thanh toán."
        });
      }

      case 'get_reviews': {
        console.log(`[AI Agent] 🔍 Lấy đánh giá cho sản phẩm: "${args.product_name}"`);
        const mockReviews = [
          { user: "Quỳnh Như", rating: 5, comment: "Sản phẩm xịn lắm ạ, dùng rất mượt và giao hàng siêu nhanh!" },
          { user: "Hải Nam", rating: 5, comment: "Đáng tiền nha mọi người, dịch vụ chăm sóc khách hàng của shop rất tốt." },
          { user: "Minh Thư", rating: 4, comment: "Đóng gói kỹ càng, chất lượng chuẩn chỉnh như mô tả." }
        ];
        return JSON.stringify({
          success: true,
          product_name: args.product_name,
          reviews: mockReviews,
          message: `Đã tìm thấy ${mockReviews.length} đánh giá tích cực từ khách hàng cho sản phẩm "${args.product_name}".`
        });
      }

      case 'log_feedback': {
        console.log(`[AI Agent] 📝 Ghi nhận phản hồi cho đơn hàng: "${args.order_id || 'N/A'}" | Nội dung: "${args.feedback_text}"`);
        return JSON.stringify({
          success: true,
          order_id: args.order_id || null,
          message: "Cảm ơn ý kiến đóng góp quý báu của anh/chị! Shop đã ghi nhận phản hồi và sẽ liên tục cải tiến dịch vụ ạ. ❤️"
        });
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
    'noi voi nguoi that', 'nói với người thật'
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
const emitEscalationEvent = (sessionId, userMessage) => {
  try {
    const io = getIo();
    if (io) {
      const payload = {
        sessionId,
        message: userMessage,
        timestamp: new Date().toISOString()
      };
      io.emit('escalation_request', payload);
      console.log(`[AI Agent] 🚨 Đã bắn sự kiện escalation_request cho sessionId: ${sessionId}`);
    } else {
      console.warn('[AI Agent] ⚠️ Socket.io chưa được khởi tạo, không thể bắn escalation event.');
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

// ─── Xử lý Hội thoại (Core Chat Engine) ───────────────────────────────────────

/**
 * Gửi tin nhắn và nhận phản hồi từ LLM
 * @param {string} sessionId - ID phiên chat để giữ context
 * @param {string} userMessage - Tin nhắn từ người dùng
 * @returns {Promise<Object>} { success, reply, escalate, qrCodeImage, orderId }
 */
const chat = async (sessionId, userMessage) => {
  // 1. Kiểm tra logic Escalation ngay trước khi gửi LLM
  if (checkEscalation(userMessage)) {
    // Bắn WebSocket event tới Dashboard để nhân viên biết có khách cần hỗ trợ
    emitEscalationEvent(sessionId, userMessage);
    return {
      success: true,
      reply: "Dạ em xin lỗi vì sự bất tiện này. Em sẽ chuyển ngay cuộc trò chuyện này sang nhân viên hỗ trợ thực tế để xử lý nhanh nhất cho anh/chị ạ! 🙏",
      escalate: true
    };
  }

  const sessionMessages = getOrCreateSession(sessionId);

  // Lưu tin nhắn của người dùng vào context
  sessionMessages.push({ role: 'user', content: userMessage });

  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;

  // Xác định API Key, Endpoint và Model sử dụng
  let apiKey = null;
  let apiUrl = 'https://api.openai.com/v1/chat/completions';
  let modelName = 'gpt-4o-mini';

  if (groqApiKey) {
    apiKey = groqApiKey;
    apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
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
    console.warn('[AI Agent] ⚠️ Cảnh báo: Không tìm thấy GROQ_API_KEY, OPENAI_API_KEY hoặc LLM_API_KEY. Khởi chạy chế độ Mock để demo...');
    return mockChatFlow(sessionMessages, userMessage);
  }

  try {
    // Gọi raw Completions API (Groq hoặc OpenAI)
    let response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: sessionMessages,
        tools: OPENAI_TOOLS,
        tool_choice: 'auto'
      })
    });

    let data = await response.json();

    if (data.error) {
      throw new Error(`API Error: ${data.error.message}`);
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

      for (const toolCall of assistantMessage.tool_calls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        // Thực thi tool
        const toolResult = await executeTool(name, args);

        // Lưu thông tin phục vụ trả về trực tiếp cho UI nếu có
        let cleanToolResultStr = toolResult;
        if (name === 'generate_payment_qr' || name === 'create_order') {
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

      // Gọi lại API lần thứ 2 với kết quả của tool
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: sessionMessages
        })
      });

      data = await response.json();
      if (data.error) {
        throw new Error(`Second-step API Error: ${data.error.message}`);
      }
      assistantMessage = data.choices[0].message;

      // Lưu câu trả lời cuối cùng vào history
      sessionMessages.push(assistantMessage);

      // Xóa cú pháp <function=...> rác nếu LLM bịa ra trong text
      const cleanReply = assistantMessage.content.replace(/<function=.*?>.*?<\/function>/gs, '').trim();

      return {
        success: true,
        reply: cleanReply,
        escalate: checkEscalation(cleanReply),
        qrCodeImage,
        orderId,
        productName,
        amount
      };
    } else {
      // Không có tool call, lưu câu trả lời vào history và trả về
      sessionMessages.push(assistantMessage);

      // Xóa cú pháp <function=...> rác nếu LLM bịa ra trong text
      const cleanReply = assistantMessage.content.replace(/<function=.*?>.*?<\/function>/gs, '').trim();

      return {
        success: true,
        reply: cleanReply,
        escalate: checkEscalation(cleanReply)
      };
    }

  } catch (error) {
    console.error('[AI Agent] ❌ Lỗi xử lý LLM Chat:', error.message);
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
    Number(uid) || 0,
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
  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const groqApiKey = process.env.GROQ_API_KEY;
  const webhookUrl = process.env.WEBHOOK_URL;

  if (!appId || !customerId || !customerSecret) {
    console.warn('[Agora] ⚠️ Thiếu thông tin xác thực Agora REST API trong .env. Bỏ qua gọi API thực tế.');
    return {
      success: false,
      message: 'Thiếu credentials Agora để gọi API thực tế. Hãy điền AGORA_CUSTOMER_ID và AGORA_CUSTOMER_SECRET.'
    };
  }

  if (!groqApiKey) {
    console.warn('[Agora] ⚠️ Thiếu GROQ_API_KEY trong .env. Agent sẽ không thể sử dụng LLM.');
  }

  const isEnglish = language === 'en';
  const asrLanguage = isEnglish ? "en-US" : "vi-VN";
  const ttsVoice = isEnglish ? "en-US-AriaNeural" : "vi-VN-HoaiMyNeural";
  // Lấy danh sách sản phẩm thực tế để nhúng vào Prompt cho Voice AI (Prompt Injection)
  const products = getProducts();
  const productListStr = products.map(p => `- ${p.name}: ${p.price_usdc} USDC`).join("\n");

  const systemPrompt = isEnglish
    ? `You are a sales assistant for ShopTalk. Be brief and helpful. We ONLY sell these products:\n${productListStr}\n\nCRITICAL: Your responses are spoken via Text-to-Speech. NEVER output JSON or <function> tags in your text.\nWHEN THE USER BUYS: You MUST ask for their full name and shipping address. After they provide it, use the built-in \`create_order\` tool via standard function calling (do NOT output raw text for the tool).`
    : `Bạn là nhân viên bán hàng của ShopTalk. Trả lời ngắn gọn, vui vẻ, tự nhiên như người thật.
Tuyệt đối KHÔNG tự bịa sản phẩm. Cửa hàng HIỆN CHỈ CÓ các sản phẩm sau:
${productListStr}
Nếu khách hỏi giá hoặc cần mua, hãy tư vấn dựa trên danh sách trên.

CHÚ Ý QUAN TRỌNG: Câu trả lời của bạn sẽ được chuyển thành giọng nói (Text-to-Speech).
- BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC sinh ra bất kỳ đoạn mã JSON nào, hay in cú pháp như <function=...> trong câu trả lời văn bản. 
- Chỉ dùng ngôn ngữ tự nhiên để nói chuyện với khách.

KHI KHÁCH CHỐT MUA: Bạn BẮT BUỘC PHẢI HỎI tên và địa chỉ giao hàng của khách. 
Sau khi khách cung cấp đủ Tên và Địa chỉ, BẠN PHẢI GỌI TOOL \`create_order\` bằng cơ chế function calling chuẩn (Tuyệt đối không in tên tool ra text).

NẾU KHÁCH YÊU CẦU ĐỔI THÔNG TIN (sửa tên, đổi địa chỉ, thêm/bớt món): Hãy vui vẻ đồng ý và GỌI LẠI TOOL \`create_order\` lần nữa với toàn bộ thông tin mới để tạo đơn hàng cập nhật cho khách.`;

  let finalSystemPrompt = systemPrompt;
  if (sessionId && chatSessions.has(sessionId)) {
    const history = chatSessions.get(sessionId).filter(m => m.role !== 'system');
    if (history.length > 0) {
      const historyText = history.map(m => `${m.role === 'user' ? 'Khách hàng' : 'Bạn (AI)'}: ${m.content}`).join('\n');
      finalSystemPrompt += `\n\n--- LỊCH SỬ CHAT TEXT TRƯỚC ĐÓ CỦA KHÁCH HÀNG ---\n${historyText}\n--- KẾT THÚC LỊCH SỬ ---\nHãy tiếp tục cuộc trò chuyện (tư vấn/chốt đơn) dựa trên ngữ cảnh trên một cách tự nhiên nhất.`;
    }
  }

  // Tạo Token cho Agent
  const tokenData = generateAgoraToken(channelName, agentUid);
  const token = typeof tokenData === 'string' ? tokenData : tokenData.token;

  // Encode Basic Auth
  const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

  // Tên agent unique
  const agentName = `shoptalk-${channelName}-${Date.now()}`;

  // Request body theo Agora API v2 flat format (đúng spec)
  const requestBody = {
    name: agentName,
    properties: {
      channel: channelName,
      token: token,
      agent_rtc_uid: String(agentUid),
      remote_rtc_uids: ["*"],
      advanced_features: {
        enable_tools: true
      },
      asr: {
        vendor: process.env.AZURE_SPEECH_KEY ? "microsoft" : "ares",
        language: asrLanguage,
        ...(process.env.AZURE_SPEECH_KEY && {
          params: {
            key: process.env.AZURE_SPEECH_KEY,
            region: process.env.AZURE_SPEECH_REGION || "southeastasia"
          }
        })
      },
      llm: {
        url: "https://api.groq.com/openai/v1/chat/completions",
        api_key: groqApiKey,
        system_messages: [{ role: "system", content: finalSystemPrompt }],
        params: { model: "llama-3.3-70b-versatile", max_tokens: 300 },
        mcp_servers: [
          {
            name: "shoptalk",
            endpoint: `${webhookUrl}/mcp/sse`,
            transport: "sse"
          }
        ]
      },
      tts: {
        vendor: process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "microsoft",
        params: process.env.ELEVENLABS_API_KEY
          ? {
            voice_id: "EXAVITQu4vr4xnSDxMaL", // Giọng nữ Sarah (Free Premade)
            key: process.env.ELEVENLABS_API_KEY
          }
          : {
            voice_name: ttsVoice,
            ...(process.env.AZURE_SPEECH_KEY && {
              key: process.env.AZURE_SPEECH_KEY,
              region: process.env.AZURE_SPEECH_REGION || "southeastasia"
            })
          }
      }
    }
  };

  try {
    console.log(`[Agora] 📡 Starting agent "${agentName}" | Channel: "${channelName}" | ASR: ${asrLanguage}`);
    if (webhookUrl) console.log(`[Agora] 🔗 Webhook: ${webhookUrl}/api/agent-tools`);

    const resp = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(requestBody)
    });

    const result = await resp.json();

    if (resp.ok) {
      console.log(`[Agora] ✅ SUCCESS! Agent joined channel`);
      console.log(`[Agora] 📥 Agent ID: ${result.agent_id}`);
      console.log(`[Agora] 📥 Status: ${result.status}`);
    } else {
      console.error(`[Agora] ❌ FAILED (HTTP ${resp.status})`);
      console.error(`[Agora] Error:`, JSON.stringify(result, null, 2));
    }

    return {
      success: resp.ok,
      agentName,
      data: result
    };
  } catch (error) {
    console.error('[Agora] ❌ Exception:', error.message);
    return {
      success: false,
      agentName,
      message: error.message
    };
  }
};

// ─── Sandbox / Mock Chat Flow cho Hackathon Demo khi không có API Key LLM ───
/**
 * Xử lý hội thoại demo hoàn toàn offline — không cần DB, Blockchain hay API Key.
 * Dùng createMockOrder() để tạo đơn giả, trả về QR ảnh giả trông như thật.
 */
const mockChatFlow = async (sessionMessages, userMessage) => {
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
    lowercaseMsg.includes('danh sach')
  ) {
    reply = `Dạ bên em đang có các sản phẩm sau anh/chị ơi! 🛍️

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

Anh/chị quan tâm sản phẩm nào ạ? 😊`;
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
    lowercaseMsg.includes('sticker')
  ) {
    // Xác định sản phẩm và giá từ tin nhắn
    productName = 'Solana Mobile Saga v2 (Demo)';
    amount = 0.1;

    if (lowercaseMsg.includes('saga phone') || lowercaseMsg.includes('saga v1') || (lowercaseMsg.includes('saga') && !lowercaseMsg.includes('v2'))) {
      productName = 'Solana Mobile Saga Phone'; amount = 499.99;
    } else if (lowercaseMsg.includes('saga v2') || lowercaseMsg.includes('saga')) {
      productName = 'Solana Mobile Saga v2'; amount = 0.1;
    } else if (lowercaseMsg.includes('ledger')) {
      productName = 'Ledger Nano S Plus'; amount = 79.00;
    } else if (lowercaseMsg.includes('tai nghe')) {
      productName = 'Tai nghe TWS Blockchain Edition'; amount = 35.00;
    } else if (lowercaseMsg.includes('hoodie') || lowercaseMsg.includes('ao')) {
      productName = 'Áo hoodie Crypto Dev'; amount = 28.00;
    } else if (lowercaseMsg.includes('t-shirt') || lowercaseMsg.includes('tshirt')) {
      productName = 'ShopTalk T-Shirt'; amount = 15.00;
    } else if (lowercaseMsg.includes('mu') || lowercaseMsg.includes('mũ')) {
      productName = 'Mũ lưỡi trai ShopTalk'; amount = 12.00;
    } else if (lowercaseMsg.includes('balo')) {
      productName = 'Balo Laptop Crypto'; amount = 45.00;
    } else if (lowercaseMsg.includes('op lung') || lowercaseMsg.includes('ốp lưng')) {
      productName = 'Ốp lưng Saga Phone trong suốt'; amount = 8.00;
    } else if (lowercaseMsg.includes('cap sac') || lowercaseMsg.includes('cáp sạc')) {
      productName = 'Cáp sạc USB-C 1m'; amount = 5.00;
    } else if (lowercaseMsg.includes('sticker')) {
      productName = 'Sticker Pack Web3'; amount = 3.00;
    } else if (lowercaseMsg.includes('keychain') || lowercaseMsg.includes('phantom')) {
      productName = 'Phantom Wallet Keychain'; amount = 6.00;
    }

    // Tạo mock order — không cần DB hay Blockchain
    const mockOrder = createMockOrder(productName, amount);
    orderId = mockOrder.id;
    qrCodeImage = mockOrder.qr_code;

    reply = `Dạ em đã tạo đơn hàng thành công cho anh/chị rồi ạ! 🎉

- 📦 **Sản phẩm**: ${mockOrder.product_name}
- 💵 **Số tiền**: ${mockOrder.amount} USDC (Devnet)
- 🔖 **Mã đơn hàng**: \`${mockOrder.id}\`

📲 Dưới đây là mã QR Code thanh toán Solana Pay. Anh/chị vui lòng mở ví **Phantom/Solflare** (nhớ chọn mạng **Devnet**) rồi quét mã này để hoàn tất thanh toán nhé!

⏰ Mã QR có hiệu lực trong **15 phút**, nếu hết hạn anh/chị có thể nhắn lại để em tạo mới ạ.`;
  }

  // ─── Hướng dẫn thanh toán ────────────────────────────────────────────────────
  else if (
    lowercaseMsg.includes('thanh toán') ||
    lowercaseMsg.includes('thanh toan') ||
    lowercaseMsg.includes('chuyển tiền') ||
    lowercaseMsg.includes('chuyen tien') ||
    lowercaseMsg.includes('qr') ||
    lowercaseMsg.includes('phantom') ||
    lowercaseMsg.includes('solflare')
  ) {
    reply = `Dạ để thanh toán anh/chị làm theo các bước sau nhé:

1️⃣ Mở app **Phantom** hoặc **Solflare** trên điện thoại
2️⃣ Chuyển sang mạng **Devnet** (vào Settings → Network → Devnet)
3️⃣ Đảm bảo có **USDC Devnet** trong ví (lấy miễn phí tại faucet.solana.com)
4️⃣ Quét mã QR em đã gửi ở trên
5️⃣ Xác nhận giao dịch — tiền sẽ chuyển trong vài giây!

Nếu anh/chị cần hỗ trợ thêm cứ nhắn em nhé 😊`;
  }

  // ─── Giới thiệu / Chào hỏi mặc định ────────────────────────────────────────
  else {
    reply = `Dạ cửa hàng **ShopTalk** xin chào anh/chị! 👋

Em là trợ lý AI bán hàng tự động của ShopTalk. Em có thể giúp anh/chị:
- 🔍 **Xem danh sách sản phẩm** (gõ: "xem hàng" hoặc "có gì bán")
- 🛒 **Đặt hàng** (gõ tên sản phẩm + "mua")
- 💳 **Hướng dẫn thanh toán** USDC qua Solana Pay

Anh/chị cần em hỗ trợ gì ạ? 😊`;
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

module.exports = {
  chat,
  generateAgoraToken,
  startAgoraAgent,
  createMockOrder,
  executeTool
};
