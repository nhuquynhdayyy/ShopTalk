const Groq = require('groq-sdk');
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
const { Keypair } = require('@solana/web3.js');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { checkInventory, normalize } = require('./inventory.service');
const axios = require('axios');
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
5. CLOSE (Chốt đơn): KHI KHÁCH ĐỒNG Ý MUA, nhảy thẳng đến bước này. BẮT BUỘC xin Họ và tên, Số điện thoại liên hệ, và Địa chỉ giao hàng. Có đủ cả 3 thông tin này mới được gọi \`create_order\`.
6. POST-SALE (Tóm tắt và Sau bán): Khi tạo đơn thành công, BẠN PHẢI TÓM TẮT LẠI thông tin đơn hàng (Tên SP, Tổng tiền, Tên người nhận, Số điện thoại, Địa chỉ) để khách kiểm tra. Sau đó cảm ơn và mời khách quét mã QR. Dùng \`log_feedback\` nếu có phản hồi.
Quy tắc ứng xử quan trọng:
1. Luôn lịch sự, xưng hô thân mật phù hợp (ví dụ: dạ, em, anh/chị...).
2. Chỉ tư vấn và bán các sản phẩm có thực trong kho. TUYỆT ĐỐI không hứa hẹn hoặc giới thiệu các sản phẩm không tồn tại hoặc hết hàng. Luôn dùng công cụ \`check_inventory\` để xác thực trước khi trả lời về giá hoặc số lượng.
3. Khi khách đồng ý mua, hãy hỏi rõ thông tin (tên sản phẩm, số lượng, địa chỉ ví nhận nếu cần) và gọi công cụ \`create_order\` để tạo đơn hàng.
4. Sau khi tạo đơn hàng thành công, gọi ngay công cụ \`generate_payment_qr\` để lấy ảnh QR Code thanh toán Solana Pay, hiển thị thông tin này cho khách hàng và hướng dẫn họ dùng ví Phantom/Solflare (đã chuyển sang mạng Devnet) quét mã để hoàn tất.
5. Luôn nhắc nhở khách rằng giao dịch được thanh toán bằng đồng USDC trên mạng Solana Devnet.
6. Bạn là AI Agent bán hàng chính thức. TUYỆT ĐỐI không được chủ động giới thiệu, đề xuất khách hàng liên hệ nhân viên hỗ trợ hoặc tự ý chuyển giao cuộc nói chuyện sang người thật trừ khi khách hàng trực tiếp yêu cầu từ khóa khiếu nại hoặc trực tiếp đòi gặp người thật. Nếu khách hàng hỏi mua sản phẩm hoặc hỏi các câu thông thường, hãy kiên trì tư vấn và hướng dẫn đặt hàng.

LƯU Ý QUAN TRỌNG: 
- Khi gọi 'create_order', bạn phải tự lấy tên sản phẩm và giá tiền (amount) từ thông tin bạn đã kiểm tra trước đó trong lịch sử trò chuyện.
- Nếu người dùng đồng ý mua (nói "có", "mua luôn"...), hãy thực hiện gọi 'create_order' ngay lập tức với các thông số đã biết.

QUY TẮC LINH HOẠT (QUAN TRỌNG NHẤT):
- Bạn KHÔNG bắt buộc phải đi tuần tự từ 1 đến 6. 
- Nếu khách đồng ý mua ở bước 2, hãy BỎ QUA hoàn toàn bước 3 và 4, nhảy thẳng đến bước 5 (Xin Tên, Số điện thoại và Địa chỉ) ngay lập tức. Đừng lải nhải thêm.

QUY TẮC CỐT LÕI:
1. Luôn xưng dạ em, gọi khách là anh/chị. Ngắn gọn, súc tích.
2. Luôn nhắc khách thanh toán bằng USDC trên mạng Solana Devnet.
3. Sau khi đã gọi tool tạo mã QR thanh toán (hoặc khi QR đã hiển thị), AI phải tuyệt đối im lặng và không được đặt thêm bất kỳ câu hỏi nào. Hãy để khách hàng tập trung thao tác chuyển khoản.
4. AI chỉ được nói tiếp khi nhận được tín hiệu order_paid (thành công) hoặc tín hiệu payment_reminder (nhắc nhở).`;

const SYSTEM_PROMPT_EN = `You are a smart AI Sales Agent for the "ShopTalk" store.
Your mission is to guide customers using a 6-stage Sales Funnel, but you MUST be HIGHLY FLEXIBLE based on the actual situation:

6-STAGE SALES FUNNEL (Mental Framework):
1. QUALIFY: Greet and understand customer needs.
2. RECOMMEND: Use \`check_inventory\` to find products. Never invent products.
3. OBJECTION: IF the customer worries about price/quality, use \`get_reviews\` to provide feedback.
4. UPSELL: IF appropriate, suggest related accessories.
5. CLOSE: WHEN THE CUSTOMER AGREES TO BUY, jump straight to this step. YOU MUST ask for their Name, Phone Number, and Shipping Address. Only call \`create_order\` when you have all three.
6. POST-SALE: Once the order is created, YOU MUST SUMMARIZE the order details (Product Name, Total Amount, Customer Name, Phone Number, Address) for the customer to review. Then thank them and invite them to scan the QR code. Use \`log_feedback\` if they provide feedback.

FLEXIBILITY RULES (MOST IMPORTANT):
- You DO NOT have to follow steps 1 to 6 sequentially.
- If the customer agrees to buy at step 2, SKIP steps 3 and 4 entirely. Jump straight to step 5 (Ask for Name, Phone Number, and Address) immediately. Do not ramble.

CORE RULES:
1. Always be polite, professional, and concise.
2. Remind customers that payments are in USDC on the Solana Devnet.
3. After calling the tool to generate the payment QR code (or when the QR code is displayed), the AI must remain absolutely silent and must not ask any further questions. Let the customer focus on the transaction.
4. The AI is only allowed to speak again when it receives the order_paid signal (success) or the payment_reminder signal.`;

// ─── State: Lưu trữ lịch sử hội thoại (Context) ──────────────────────────────────
// Map lưu trữ: sessionId -> Array of messages
const chatSessions = new Map();

// Map lưu trữ: sessionId -> agentId
const activeAgoraAgents = new Map();

// Map lưu trữ: orderId -> sessionId
const orderSessions = new Map();

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

const executeTool = async (name, args, sessionId = null) => {
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
        const sellerWallet = args.seller_wallet || process.env.SELLER_WALLET || '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ';

        const newOrder = await createOrder({
          reference: referenceKey,
          product_name: args.product_name,
          amount: args.amount,
          seller_wallet: sellerWallet,
          status: 'pending',
          customer_name: args.customer_name || null,
          customer_phone: args.customer_phone || null,
          customer_address: args.customer_address || null,
          items_list: args.items_list || null
        });

        if (newOrder && sessionId) {
          orderSessions.set(newOrder.id, sessionId);
          console.log(`[Order Map] Mapped order ID ${newOrder.id} to session ID ${sessionId}`);
        }

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
    'noi voi nguoi that',
    'nói với người thật',
    'yêu cầu nhân viên',
    'gặp admin',
    'chat với người thật'
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
      function_call: null,
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
    // modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    modelName = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
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
    return mockChatFlow(sessionMessages, userMessage, sessionId);
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
        const toolResult = await executeTool(name, args, sessionId);

        // Lưu thông tin phục vụ trả về trực tiếp cho UI nếu có
        let cleanToolResultStr = toolResult;
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
      const { text_reply, function_call } = parseReplyContent(assistantMessage.content);
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
      const cleanReply = assistantMessage.content.replace(/<function=.*?>.*?<\/function>/gs, '').trim();
      const { text_reply, function_call } = parseReplyContent(assistantMessage.content);
      return {
        success: true,
        reply: cleanReply,
        function_call,
        escalate: checkEscalation(userMessage)
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
          language: 'vi-VN',
          params: {}
        },
        llm: {
          vendor: 'custom',
          url: `${ngrokUrl}/api/agora/llm-webhook?sessionId=${encodeURIComponent(sessionId || channelName)}`,
          params: { model: 'llama-3.1-8b-instant' },
          failure_message: 'Dạ, em xin lỗi, đường truyền đang gặp chút vấn đề. Anh chị vui lòng đợi em một xíu ạ.',
          greeting_message: 'Dạ, ShopTalk xin chào anh/chị! Em là nhân viên tư vấn ảo của cửa hàng. Anh chị đang quan tâm đến mẫu điện thoại Solana Saga hay phụ kiện nào bên em ạ?',
          system_messages: [
            { role: 'system', content: SYSTEM_PROMPT }
          ]
        },
        tts: {
          vendor: 'microsoft',
          credential_name: 'Azure_Voice',
          params: {
            voice_name: 'vi-VN-NamMinhNeural',
            key: process.env.AZURE_TTS_KEY,
            region: process.env.AZURE_TTS_REGION
          }
        },
        parameters: {
          silence_config: {
            action: 'think',
            content: 'Dạ không biết anh chị còn ở đó không ạ?',
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

    console.log(`[Agora] 📡 Starting agent "${agentName}" | Channel: "${channelName}" | ASR: vi-VN`);
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
      return { success: false, message: JSON.stringify(data), data };
    }

    console.log(`[Agora] ✅ SUCCESS! Agent joined channel`);
    console.log(`[Agora] 📥 Agent ID: ${data.agent_id}`);
    console.log(`[Agora] 📥 Status: ${data.status}`);

    if (data.agent_id) {
      const finalSessionId = sessionId || channelName;
      activeAgoraAgents.set(finalSessionId, data.agent_id);
      console.log(`[Agora Map] Mapped session ID ${finalSessionId} to Agent ID ${data.agent_id}`);
    }

    return { success: true, agentName, data };

  } catch (error) {
    console.error('[Agora] ❌ Exception:', error.message);
    return { success: false, message: error.message };
  }
};

// ─── Sandbox / Mock Chat Flow cho Hackathon Demo khi không có API Key LLM ───
/**
 * Xử lý hội thoại demo hoàn toàn offline — không cần DB, Blockchain hay API Key.
 * Dùng createMockOrder() để tạo đơn giả, trả về QR ảnh giả trông như thật.
 */
const mockChatFlow = async (sessionMessages, userMessage, sessionId = null) => {
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
    // 1. Xác định sản phẩm và giá từ tin nhắn
    let productName = 'Solana Mobile Saga v2 (Demo)';
    let amount = 0.1;

    if (lowercaseMsg.includes('saga phone') || lowercaseMsg.includes('saga v1') || (lowercaseMsg.includes('saga') && !lowercaseMsg.includes('v2'))) {
      productName = 'Solana Mobile Saga Phone'; amount = 499.99;
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

    // 2. Thực hiện tạo đơn hàng vào DB (Logic từ nhánh main)
    try {
      const referenceKey = Keypair.generate().publicKey.toBase58();
      const newOrder = await createOrder({
        reference: referenceKey,
        product_name: productName,
        amount: amount,
        seller_wallet: process.env.SELLER_WALLET || '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ',
        status: 'pending',
        customer_name: 'Mock Customer',
        customer_phone: '0987654321',
        customer_address: 'Mock Address'
      });
      orderId = newOrder.id;
      if (sessionId) {
        orderSessions.set(newOrder.id, sessionId);
        console.log(`[Mock Chat] Mapped real order ID ${newOrder.id} to session ID ${sessionId}`);
      }

      // Sinh luôn mã QR Code thanh toán
      const paymentUrl = createPaymentRequest(newOrder);
      qrCodeImage = await generateQRCode(paymentUrl);

      reply = `Dạ em đã tạo đơn hàng thành công cho anh/chị rồi ạ! 
- **Sản phẩm**: ${newOrder.product_name}
- **Số tiền**: ${newOrder.amount} USDC (Devnet)
- **Mã đơn hàng**: \`${newOrder.id}\`

Dưới đây là mã QR Code thanh toán Solana Pay. Anh/chị vui lòng dùng ví Phantom/Solflare quét mã này nhé!`;
    } catch (err) {
      console.warn('[AI Agent] Lỗi tạo đơn thực tế, chuyển sang chế độ mock order fallback:', err.message);
      try {
        // Tạo mock order — không cần DB hay Blockchain
        const mockOrder = createMockOrder(productName, amount);
        orderId = mockOrder.id;
        qrCodeImage = mockOrder.qr_code;
        if (sessionId) {
          orderSessions.set(mockOrder.id, sessionId);
          console.log(`[Mock Chat] Mapped mock order ID ${mockOrder.id} to session ID ${sessionId}`);
        }

        reply = `Dạ em đã tạo đơn hàng thành công cho anh/chị rồi ạ! 🎉

- 📦 **Sản phẩm**: ${mockOrder.product_name}
- 💵 **Số tiền**: ${mockOrder.amount} USDC (Devnet)
- 🔖 **Mã đơn hàng**: \`${mockOrder.id}\`

📲 Dưới đây là mã QR Code thanh toán Solana Pay. Anh/chị vui lòng mở ví **Phantom/Solflare** (nhớ chọn mạng **Devnet**) rồi quét mã này để hoàn tất thanh toán nhé!

⏰ Mã QR có hiệu lực trong **15 phút**, nếu hết hạn anh/chị có thể nhắn lại để em tạo mới ạ.`;
      } catch (mockErr) {
        reply = `Lỗi hệ thống khi tạo đơn hàng: ${err.message}`;
      }
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

module.exports = {
  groq,
  chat,
  generateAgoraToken,
  startAgoraAgent,
  createMockOrder,
  SYSTEM_PROMPT,
  OPENAI_TOOLS,
  executeTool,
  orderSessions,
  activeAgoraAgents,
  triggerAgentSpeak
};
