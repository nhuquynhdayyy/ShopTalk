const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { z } = require("zod");
const { executeTool } = require("../services/ai.service");
const { getIo } = require("../websocket/socket.server");

// Khởi tạo MCP Server chuẩn
const server = new McpServer({
  name: "shoptalk-mcp",
  version: "1.0.0"
});

// ─── Helper: Format JSON thành câu tự nhiên cho TTS ─────────────────────────
/**
 * Chuyển đổi response JSON từ tool thành câu tiếng Việt tự nhiên
 * để phù hợp với Text-to-Speech (TTS) trong voice call
 */
const formatToolResponseForVoice = (toolName, resultStr) => {
  try {
    const result = JSON.parse(resultStr);
    
    switch (toolName) {
      case 'create_order':
        if (result.success) {
          return `Dạ em đã tạo đơn hàng thành công cho anh chị rồi ạ! Sản phẩm ${result.product_name}, tổng số tiền ${result.amount} USDC. Mã đơn hàng là ${result.order_id}. Em sẽ gửi mã QR thanh toán cho anh chị ngay bây giờ nhé!`;
        } else {
          return `Em xin lỗi anh chị, không thể tạo đơn hàng được: ${result.error || 'Lỗi không xác định'}. Anh chị vui lòng thử lại sau ạ.`;
        }
      
      case 'check_inventory':
        if (result.found) {
          return `Dạ sản phẩm ${result.name} hiện đang còn ${result.stock} chiếc trong kho với giá ${result.price_usdc} USDC ạ.`;
        } else {
          return `Em xin lỗi anh chị, hiện tại sản phẩm này đang hết hàng hoặc không có trong kho ạ.`;
        }
      
      case 'generate_payment_qr':
        if (result.success) {
          return `Dạ mã QR thanh toán cho đơn hàng ${result.order_id} đã sẵn sàng ạ. Tổng số tiền cần thanh toán là ${result.amount} USDC. Anh chị vui lòng mở ví Phantom hoặc Solflare, chuyển sang mạng Devnet và quét mã QR để hoàn tất thanh toán nhé!`;
        } else {
          return `Em xin lỗi anh chị, không thể tạo mã QR thanh toán: ${result.message || 'Lỗi không xác định'}. Vui lòng thử lại sau ạ.`;
        }
      
      case 'get_reviews':
        if (result.success && result.reviews && result.reviews.length > 0) {
          const reviewSummary = result.reviews.slice(0, 3).map((review, idx) => 
            `Khách hàng ${review.user} đánh giá ${review.rating} sao: ${review.comment}`
          ).join('. ');
          return `Dạ sản phẩm ${result.product_name} có nhiều đánh giá tích cực lắm ạ. ${reviewSummary}.`;
        } else {
          return `Em xin lỗi anh chị, hiện chưa có đánh giá nào cho sản phẩm này ạ.`;
        }
      
      case 'log_feedback':
        if (result.success) {
          return `Dạ em cảm ơn anh chị đã đóng góp ý kiến! Shop đã ghi nhận phản hồi và sẽ liên tục cải thiện dịch vụ ạ.`;
        } else {
          return `Em xin lỗi anh chị, không thể ghi nhận phản hồi lúc này. Vui lòng thử lại sau ạ.`;
        }
      
      default:
        return result.message || resultStr;
    }
  } catch (error) {
    // Nếu không parse được JSON, trả về text gốc
    return resultStr;
  }
};

// Đăng ký Tool tạo đơn hàng
server.tool(
  "create_order",
  "Tạo đơn hàng mới",
  {
    product_name: z.string().describe("Tên tóm tắt của giỏ hàng (VD: 2 Sản phẩm)"),
    amount: z.coerce.number().describe("Tổng giá tiền (USDC)"),
    customer_name: z.string().describe("Tên khách hàng"),
    customer_address: z.string().describe("Địa chỉ giao hàng của khách hàng"),
    items_list: z.array(z.object({
      name: z.string().describe("Tên sản phẩm chi tiết"),
      quantity: z.number().describe("Số lượng"),
      price: z.number().describe("Giá mỗi sản phẩm")
    })).optional().describe("Danh sách chi tiết các sản phẩm trong đơn")
  },
  async ({ product_name, amount, customer_name, customer_address, items_list }) => {
    try {
      console.log(`[MCP] Đang thực thi tool create_order cho sản phẩm: ${product_name}`);
      // Thực thi logic backend (tạo DB, sinh QR Solana Pay)
      const resultStr = await executeTool("create_order", { product_name, amount, customer_name, customer_address, items_list });
      const result = JSON.parse(resultStr);

      if (result.success && result.qr_code) {
        const io = getIo();
        if (io) {
          // Bắn mã QR xuống Frontend thông qua WebSocket để thay thế cho Proxy cũ
          io.emit('show_qr_code', {
            sessionId: "default", 
            qrCodeImage: result.qr_code,
            orderId: result.order_id,
            productName: product_name,
            amount: amount,
            customerName: customer_name,
            customerAddress: customer_address,
            itemsList: items_list
          });
          console.log(`[MCP] 🚀 Đã bắn mã QR qua WebSocket!`);
        }
      }

      // Format response thành câu tự nhiên cho voice TTS
      const voiceFriendlyResponse = formatToolResponseForVoice("create_order", resultStr);
      
      return {
        content: [{ type: "text", text: voiceFriendlyResponse }]
      };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool create_order:", error);
      // Humanized error message cho TTS
      const errorMessage = `Em xin lỗi anh chị, hệ thống đang gặp sự cố khi tạo đơn hàng: ${error.message}. Vui lòng thử lại sau một chút ạ.`;
      return {
        content: [{ type: "text", text: errorMessage }]
      };
    }
  }
);

// Đăng ký Tool kiểm tra kho
server.tool(
  "check_inventory",
  "Kiểm tra tồn kho và giá bán của một sản phẩm từ database.",
  {
    product_name: z.string().describe("Tên sản phẩm khách hàng đang quan tâm.")
  },
  async ({ product_name }) => {
    try {
      console.log(`[MCP] Đang thực thi tool check_inventory cho sản phẩm: ${product_name}`);
      const resultStr = await executeTool("check_inventory", { product_name });
      const voiceFriendlyResponse = formatToolResponseForVoice("check_inventory", resultStr);
      return { content: [{ type: "text", text: voiceFriendlyResponse }] };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool check_inventory:", error);
      const errorMessage = `Em xin lỗi anh chị, không thể kiểm tra tồn kho lúc này: ${error.message}. Vui lòng thử lại sau ạ.`;
      return { content: [{ type: "text", text: errorMessage }] };
    }
  }
);

// Đăng ký Tool tạo mã QR thanh toán thủ công (nếu cần)
server.tool(
  "generate_payment_qr",
  "Tạo link thanh toán chuẩn Solana Pay và chuyển thành ảnh QR Code dạng base64.",
  {
    order_id: z.string().describe("Mã UUID của đơn hàng vừa tạo cần thanh toán.")
  },
  async ({ order_id }) => {
    try {
      console.log(`[MCP] Đang thực thi tool generate_payment_qr cho order: ${order_id}`);
      const resultStr = await executeTool("generate_payment_qr", { order_id });
      const voiceFriendlyResponse = formatToolResponseForVoice("generate_payment_qr", resultStr);
      return { content: [{ type: "text", text: voiceFriendlyResponse }] };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool generate_payment_qr:", error);
      const errorMessage = `Em xin lỗi anh chị, không thể tạo mã QR thanh toán lúc này: ${error.message}. Vui lòng thử lại sau ạ.`;
      return { content: [{ type: "text", text: errorMessage }] };
    }
  }
);

// Đăng ký Tool lấy đánh giá sản phẩm
server.tool(
  "get_reviews",
  "Lấy danh sách các đánh giá, phản hồi của khách hàng khác về một sản phẩm.",
  {
    product_name: z.string().describe("Tên sản phẩm khách hàng đang muốn xem đánh giá.")
  },
  async ({ product_name }) => {
    try {
      console.log(`[MCP] Đang thực thi tool get_reviews cho sản phẩm: ${product_name}`);
      const resultStr = await executeTool("get_reviews", { product_name });
      const voiceFriendlyResponse = formatToolResponseForVoice("get_reviews", resultStr);
      return { content: [{ type: "text", text: voiceFriendlyResponse }] };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool get_reviews:", error);
      const errorMessage = `Em xin lỗi anh chị, không thể lấy đánh giá sản phẩm lúc này: ${error.message}. Vui lòng thử lại sau ạ.`;
      return { content: [{ type: "text", text: errorMessage }] };
    }
  }
);

// Đăng ký Tool ghi nhận phản hồi khách hàng
server.tool(
  "log_feedback",
  "Ghi nhận ý kiến đóng góp, phản hồi (feedback) của khách hàng về đơn hàng hoặc dịch vụ.",
  {
    order_id: z.string().optional().describe("Mã đơn hàng cần ghi nhận phản hồi (nếu có)."),
    feedback_text: z.string().describe("Nội dung phản hồi từ khách hàng.")
  },
  async ({ order_id, feedback_text }) => {
    try {
      console.log(`[MCP] Đang thực thi tool log_feedback...`);
      const resultStr = await executeTool("log_feedback", { order_id, feedback_text });
      const voiceFriendlyResponse = formatToolResponseForVoice("log_feedback", resultStr);
      return { content: [{ type: "text", text: voiceFriendlyResponse }] };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool log_feedback:", error);
      const errorMessage = `Em xin lỗi anh chị, không thể ghi nhận phản hồi lúc này: ${error.message}. Nhưng em đã ghi chú lại và sẽ xử lý cho anh chị sớm nhất ạ.`;
      return { content: [{ type: "text", text: errorMessage }] };
    }
  }
);

// ─── Quản lý nhiều kết nối SSE đồng thời ─────────────────────────────────────
// Map để lưu trữ nhiều transport theo agentId/sessionId
const activeTransports = new Map(); // key: agentId/sessionId -> value: transport object

/**
 * Tạo unique ID cho mỗi SSE connection
 */
const generateConnectionId = () => {
  return `conn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Handle SSE connection từ Agora Agent
 * Hỗ trợ nhiều agents kết nối đồng thời
 */
const handleSse = async (req, res) => {
  // Lấy agentId từ query params hoặc tạo mới
  const agentId = req.query.agent_id || req.query.session_id || generateConnectionId();
  
  console.log(`[MCP] 🔌 Client connected via SSE | Agent ID: ${agentId} | Method: ${req.method}`);
  
  if (Object.keys(req.body || {}).length > 0) {
    console.log(`[MCP] Request Body:`, JSON.stringify(req.body, null, 2));
  }

  const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000';
  const transport = new SSEServerTransport(`${webhookUrl}/mcp/messages`, res);
  
  // Lưu transport vào Map
  activeTransports.set(agentId, {
    transport,
    connectedAt: new Date(),
    agentId
  });
  
  console.log(`[MCP] 📊 Active connections: ${activeTransports.size}`);

  // Cleanup khi connection đóng
  res.on('close', () => {
    activeTransports.delete(agentId);
    console.log(`[MCP] 🔌 Client disconnected | Agent ID: ${agentId}`);
    console.log(`[MCP] 📊 Active connections: ${activeTransports.size}`);
  });

  // Cleanup khi có lỗi
  res.on('error', (error) => {
    console.error(`[MCP] ❌ SSE Connection error for Agent ID ${agentId}:`, error.message);
    activeTransports.delete(agentId);
  });

  try {
    await server.connect(transport);
    console.log(`[MCP] ✅ SSE Transport connected | Agent ID: ${agentId} | Endpoint: ${webhookUrl}/mcp/messages`);
  } catch (error) {
    console.error(`[MCP] ❌ Failed to connect transport for Agent ID ${agentId}:`, error.message);
    activeTransports.delete(agentId);
    res.status(500).send("Failed to establish SSE connection");
  }
};

/**
 * Handle POST messages từ Agora Agent
 * Tìm đúng transport tương ứng với agent đang gọi
 */
const handleMessages = async (req, res) => {
  const agentId = req.query.agent_id || req.query.session_id;
  
  if (!agentId) {
    console.error("[MCP] ❌ Missing agent_id or session_id in request");
    return res.status(400).json({ 
      error: "Missing agent_id or session_id parameter",
      hint: "Add ?agent_id=<your_agent_id> to the request URL"
    });
  }

  const transportData = activeTransports.get(agentId);
  
  if (!transportData) {
    console.error(`[MCP] ❌ No active SSE connection for Agent ID: ${agentId}`);
    console.log(`[MCP] 📊 Available connections: ${Array.from(activeTransports.keys()).join(', ')}`);
    return res.status(400).json({ 
      error: `No active SSE connection for agent_id: ${agentId}`,
      availableAgents: Array.from(activeTransports.keys())
    });
  }

  try {
    await transportData.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`[MCP] ❌ Error handling message for Agent ID ${agentId}:`, error.message);
    res.status(500).json({ error: "Failed to handle message" });
  }
};

/**
 * Utility: Lấy danh sách các connections đang hoạt động
 * Hữu ích cho debug và monitoring
 */
const getActiveConnections = () => {
  return Array.from(activeTransports.entries()).map(([agentId, data]) => ({
    agentId,
    connectedAt: data.connectedAt,
    uptime: Date.now() - data.connectedAt.getTime()
  }));
};

module.exports = {
  handleSse,
  handleMessages,
  getActiveConnections
};
