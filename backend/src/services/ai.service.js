const { Keypair } = require('@solana/web3.js');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { checkInventory } = require('./inventory.service');
const { createOrder, getOrderById } = require('../models/order.model');
const { createPaymentRequest, generateQRCode } = require('./solanaPay.service');

// ─── Cấu hình Persona (System Prompt) ───────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là một nhân viên bán hàng (Sales Agent) chuyên nghiệp, niềm nở và thân thiện của cửa hàng "ShopTalk".
Nhiệm vụ của bạn là: tư vấn thông tin sản phẩm, kiểm tra tồn kho, tạo đơn hàng và hướng dẫn khách thanh toán bằng USDC qua Solana (mạng Devnet).

Quy tắc ứng xử quan trọng:
1. Luôn lịch sự, xưng hô thân mật phù hợp (ví dụ: dạ, em, anh/chị...).
2. Chỉ tư vấn và bán các sản phẩm có thực trong kho. TUYỆT ĐỐI không hứa hẹn hoặc giới thiệu các sản phẩm không tồn tại hoặc hết hàng. Luôn dùng công cụ \`check_inventory\` để xác thực trước khi trả lời về giá hoặc số lượng.
3. Khi khách đồng ý mua, hãy hỏi rõ thông tin (tên sản phẩm, số lượng, địa chỉ ví nhận nếu cần) và gọi công cụ \`create_order\` để tạo đơn hàng.
4. Sau khi tạo đơn hàng thành công, gọi ngay công cụ \`generate_payment_qr\` để lấy ảnh QR Code thanh toán Solana Pay, hiển thị thông tin này cho khách hàng và hướng dẫn họ dùng ví Phantom/Solflare (đã chuyển sang mạng Devnet) quét mã để hoàn tất.
5. Luôn nhắc nhở khách rằng giao dịch được thanh toán bằng đồng USDC trên mạng Solana Devnet.

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
    type: " his_tool", // Sẽ đổi thành type: "function" lúc gọi
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
    'lỗi',
    'nhân viên thật',
    'gặp người thật',
    'gặp nhân viên',
    'chuyển sang người thật',
    'nhân viên hỗ trợ',
    'support'
  ];
  return escalationKeywords.some(keyword => lowercaseText.includes(keyword));
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
    return {
      success: true,
      reply: "Dạ em xin lỗi vì sự bất tiện này. Em sẽ chuyển ngay cuộc trò chuyện này sang nhân viên hỗ trợ thực tế để xử lý nhanh nhất cho anh/chị ạ!",
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
          } catch (_) {}
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
          } catch (_) {}
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

      return {
        success: true,
        reply: assistantMessage.content,
        escalate: checkEscalation(assistantMessage.content),
        qrCodeImage,
        orderId
      };
    } else {
      // Không có tool call, lưu câu trả lời vào history và trả về
      sessionMessages.push(assistantMessage);
      
      return {
        success: true,
        reply: assistantMessage.content,
        escalate: checkEscalation(assistantMessage.content)
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

  if (!appId || !customerId || !customerSecret) {
    console.warn('[Agora] ⚠️ Thiếu thông tin xác thực Agora REST API trong .env. Bỏ qua gọi API thực tế.');
    return {
      success: false,
      message: 'Thiếu credentials Agora để gọi API thực tế. Hãy điền AGORA_CUSTOMER_ID và AGORA_CUSTOMER_SECRET.'
    };
  }

  // 1. Tạo Token cho Agent tham gia
  const token = generateAgoraToken(channelName, agentUid);

  // 2. Encode Basic Auth credentials
  const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

  try {
    console.log(`[Agora] 📡 Gửi request start agent join channel "${channelName}"...`);
    const resp = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        properties: {
          channel: channelName,
          token: token,
          agent_rtc_uid: String(agentUid),
          remote_rtc_uids: ["*"] // Lắng nghe toàn bộ user trong kênh
        }
      })
    });

    const result = await resp.json();
    return {
      success: resp.ok,
      data: result
    };
  } catch (error) {
    console.error('[Agora] ❌ Lỗi kết nối tới Agora Conversational AI Engine:', error.message);
    return {
      success: false,
      message: error.message
    };
  }
};

// ─── Sandbox / Mock Chat Flow cho Hackathon Demo khi không có API Key LLM ───
const mockChatFlow = async (sessionMessages, userMessage) => {
  const lowercaseMsg = userMessage.toLowerCase();
  let reply = "";
  let qrCodeImage = null;
  let orderId = null;

  if (lowercaseMsg.includes('kho') || lowercaseMsg.includes('sản phẩm') || lowercaseMsg.includes('có gì') || lowercaseMsg.includes('bán gì')) {
    reply = "Dạ bên em đang sẵn kho sản phẩm cực hot: **Solana Mobile Saga v2** với giá đặc biệt cho demo là **0.1 USDC** (đang còn 10 chiếc). Anh/chị có muốn đặt mua luôn không ạ?";
  } 
  else if (lowercaseMsg.includes('mua') || lowercaseMsg.includes('đặt hàng') || lowercaseMsg.includes('saga')) {
    // Tự động tạo đơn hàng mẫu cho demo
    try {
      const referenceKey = Keypair.generate().publicKey.toBase58();
      const newOrder = await createOrder({
        reference: referenceKey,
        product_name: 'Solana Mobile Saga v2 (Mock)',
        amount: 0.1,
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

Dưới đây là mã QR Code thanh toán Solana Pay. Anh/chị vui lòng mở ví Phantom/Solflare (nhớ chọn mạng Devnet) quét mã này để chuyển tiền nhé!`;
    } catch (err) {
      reply = `Lỗi hệ thống khi tạo đơn hàng: ${err.message}`;
    }
  } 
  else if (lowercaseMsg.includes('thanh toán') || lowercaseMsg.includes('chuyển tiền')) {
    reply = "Dạ anh/chị chỉ cần dùng ví Phantom hoặc Solflare trên điện thoại, quét mã QR mà em gửi ở trên, rồi ấn Xác nhận chuyển tiền là xong ạ. Giao dịch sẽ được cập nhật tự động sau vài giây trên blockchain Devnet.";
  } 
  else {
    reply = "Dạ cửa hàng ShopTalk xin chào anh/chị! Em có thể giúp gì cho anh/chị hôm nay ạ? Bên em đang có điện thoại **Solana Mobile Saga v2** sẵn hàng đó ạ!";
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
  startAgoraAgent
};
