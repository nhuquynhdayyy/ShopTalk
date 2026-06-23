const { Keypair } = require('@solana/web3.js');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const axios = require('axios');
const { checkInventory } = require('./inventory.service');
const { createOrder, getOrderById } = require('../models/order.model');
const { createPaymentRequest, generateQRCode } = require('./solanaPay.service');
const { getIo } = require('../websocket/socket.server');

// ─── Cấu hình Persona (System Prompt) ───────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là một nhân viên bán hàng (Sales Agent) chuyên nghiệp, niềm nở và thân thiện của cửa hàng "ShopTalk".
Nhiệm vụ của bạn là: tư vấn thông tin sản phẩm, kiểm tra tồn kho, tạo đơn hàng và hướng dẫn khách thanh toán bằng USDC qua Solana (mạng Devnet).

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

Hãy giúp khách hàng có một trải nghiệm mua sắm tuyệt vời!`;

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
const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "check_inventory",
      description: "Kiểm tra tồn kho và giá bán của một sản phẩm từ database.",
      parameters: {
        type: "object",
        properties: {
          product_name: {
            type: "string",
            description: "Tên sản phẩm khách hàng đang quan tâm."
          }
        },
        required: ["product_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description: "Tạo một đơn hàng mới trong hệ thống cơ sở dữ liệu.",
      parameters: {
        type: "object",
        properties: {
          product_name: {
            type: "string",
            description: "Tên sản phẩm khách hàng muốn mua."
          },
          amount: {
            type: "number",
            description: "Tổng số tiền thanh toán tính bằng USDC (ví dụ: 0.1)."
          },
          seller_wallet: {
            type: "string",
            description: "Địa chỉ ví nhận tiền của người bán. Mặc định là: 5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ"
          }
        },
        required: ["product_name", "amount", "seller_wallet"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_payment_qr",
      description: "Tạo link thanh toán chuẩn Solana Pay và chuyển thành ảnh QR Code dạng base64.",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "Mã UUID của đơn hàng vừa tạo cần thanh toán."
          }
        },
        required: ["order_id"]
      }
    }
  }
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
          status: 'pending'
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
          payment_url: paymentUrl,
          qr_code: qrCodeImage,
          message: "Sinh mã QR Code thành công. Vui lòng hiển thị ảnh này cho người dùng quét thanh toán."
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
  const lowercaseText = text.toLowerCase();
  const escalationKeywords = [
    'khiếu nại',
    'nói chuyện với người thật',
    'lỗi sản phẩm',
    'hoàn tiền',
    'nhân viên thật',
    'gặp người thật',
    'gặp nhân viên',
    'gặp chủ shop',
    'chuyển sang người thật',
    'nhân viên hỗ trợ',
    'support',
    'nói với người thật',
    'yêu cầu nhân viên',
    'gặp admin',
    'chat với người thật'
  ];
  return escalationKeywords.some(keyword => lowercaseText.includes(keyword));
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

      for (const toolCall of assistantMessage.tool_calls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        // Thực thi tool
        const toolResult = await executeTool(name, args);

        // Lưu thông tin phục vụ trả về trực tiếp cho UI nếu có
        if (name === 'generate_payment_qr') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success) {
              qrCodeImage = parsed.qr_code;
              orderId = parsed.order_id;
            }
          } catch (_) { }
        }
        if (name === 'create_order') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success) {
              orderId = parsed.order_id;
              if (parsed.qr_code) {
                qrCodeImage = parsed.qr_code;
              }
            }
          } catch (_) { }
        }

        // Đưa kết quả tool vào history
        sessionMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: name,
          content: toolResult
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

      const { text_reply, function_call } = parseReplyContent(assistantMessage.content);
      return {
        success: true,
        reply: text_reply,
        function_call,
        escalate: checkEscalation(userMessage),
        qrCodeImage,
        orderId
      };
    } else {
      // Không có tool call, lưu câu trả lời vào history và trả về
      sessionMessages.push(assistantMessage);

      const { text_reply, function_call } = parseReplyContent(assistantMessage.content);
      return {
        success: true,
        reply: text_reply,
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

  return token;
};

/**
 * Gọi REST API tới Agora Conversational AI Engine để mời Agent tham gia kênh RTC
 * @param {string} channelName - Tên kênh RTC
 * @param {number} agentUid - UID của AI Agent (ví dụ: 999)
 */
const startAgoraAgent = async (channelName, agentUid = 999) => {
  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!appId || !customerId || !customerSecret) {
    console.error('[Agora] ❌ Thiếu thông tin cấu hình trong .env (AGORA_APP_ID, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET)');
    return { success: false, message: 'Thiếu cấu hình Agora' };
  }

  // Kiểm tra BACKEND_PUBLIC_URL — Agora cần URL công khai để gọi webhook LLM
  const backendPublicUrl = process.env.BACKEND_PUBLIC_URL;
  if (!backendPublicUrl || backendPublicUrl.includes('localhost')) {
    console.error('[Agora] ❌ BACKEND_PUBLIC_URL chưa được cấu hình hoặc vẫn là localhost.');
    console.error('[Agora] ➡️  Hãy chạy: ngrok http 3000');
    console.error('[Agora] ➡️  Sau đó cập nhật BACKEND_PUBLIC_URL=https://xxxx.ngrok-free.app trong .env');
    return {
      success: false,
      message: 'BACKEND_PUBLIC_URL chưa được cấu hình. Agora cần URL công khai để gọi callback LLM. Hãy dùng ngrok: ngrok http 3000'
    };
  }

  // 1. Tạo Token cho Agent tham gia
  const token = generateAgoraToken(channelName, 999);
  const authHeader = 'Basic ' + Buffer.from(customerId + ':' + customerSecret).toString('base64');

  // Log an toàn
  const maskedId = customerId.slice(0, 4) + '...' + customerId.slice(-4);
  const maskedSecret = customerSecret.slice(0, 4) + '...' + customerSecret.slice(-4);
  console.log(`[Agora API] Auth: CustomerId=${maskedId}, Secret=${maskedSecret}`);

  // 2. LLM Webhook URL — Agora sẽ gọi về đây để lấy phản hồi AI
  const llmWebhookUrl = `${backendPublicUrl.replace(/\/$/, '')}/api/agora/llm-webhook`;
  console.log('[Check] Webhook URL gửi đi:', llmWebhookUrl);

  // v2 API endpoint — dùng agent_id top-level, để Dashboard Custom Config xử lý llm/asr/tts
  const apiUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`;

  // Cấu trúc body tối giản nhưng đầy đủ 'Vendor'
  const body = {
    agent_id: process.env.AGORA_AGENT_ID,
    properties: {
      channel: channelName,
      token: token,
      agent_rtc_uid: "999",
      remote_rtc_uids: ["*"],
      // Phải có định danh vendor dù dùng cấu hình Dashboard
      asr: { vendor: "ares" },
      tts: { vendor: "openai" }, 
      llm: { vendor: "openai" } 
    }
  };

  console.log('[Check] UID in Token: 999 | Channel:', channelName);
  console.log(`[Agora API] POST ${apiUrl}`);
  console.log(`[Agora API] Body (agent_id: ${body.agent_id}):`, JSON.stringify(body, null, 2));

  try {
    console.log(`[Agora] 📡 Gửi request start agent join channel "${channelName}"...`);
    const response = await axios.post(apiUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      }
    });
    console.log(`[Agora] 🚀 Mời AI Agent thành công! Response:`, JSON.stringify(response.data));
    return { success: true, data: response.data };
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('[Agora] ❌ Lỗi gọi API Join:', errorMsg);
    return { success: false, message: errorMsg };
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
    // 1. Xác định sản phẩm và giá từ tin nhắn (Logic từ nhánh feature)
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
        seller_wallet: '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ',
        status: 'pending'
      });
      orderId = newOrder.id;

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
  orderId
};
};

module.exports = {
  chat,
  generateAgoraToken,
  startAgoraAgent,
  createMockOrder
};
