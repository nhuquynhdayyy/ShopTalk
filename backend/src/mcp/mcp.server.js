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

      // Trả về JSON cho LLM theo chuẩn MCP
      return {
        content: [{ type: "text", text: resultStr }]
      };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool create_order:", error);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }]
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
      return { content: [{ type: "text", text: resultStr }] };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool check_inventory:", error);
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
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
      return { content: [{ type: "text", text: resultStr }] };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool generate_payment_qr:", error);
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
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
      return { content: [{ type: "text", text: resultStr }] };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool get_reviews:", error);
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
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
      return { content: [{ type: "text", text: resultStr }] };
    } catch (error) {
      console.error("[MCP] Lỗi thực thi tool log_feedback:", error);
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
    }
  }
);

// Quản lý kết nối SSE
let currentTransport = null;

const handleSse = async (req, res) => {
  console.log(`[MCP] Client connected via SSE | Method: ${req.method}`);
  if (Object.keys(req.body || {}).length > 0) {
    console.log(`[MCP] Request Body in SSE connection:`, JSON.stringify(req.body, null, 2));
  }
  const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000';
  currentTransport = new SSEServerTransport(`${webhookUrl}/mcp/messages`, res);
  await server.connect(currentTransport);
  console.log(`[MCP] SSE Transport đã kết nối thành công! Messages Endpoint: ${webhookUrl}/mcp/messages`);
};

const handleMessages = async (req, res) => {
  if (!currentTransport) {
    return res.status(400).send("No active SSE connection");
  }
  await currentTransport.handlePostMessage(req, res);
};

module.exports = {
  handleSse,
  handleMessages
};
