/**
 * Định nghĩa Tool: create_order
 * Mô tả: Tạo một đơn hàng mới trong cơ sở dữ liệu.
 */

module.exports = {
  type: "function",
  function: {
    name: "create_order",
    description: "Tạo một đơn hàng mới trong hệ thống cơ sở dữ liệu.",
    parameters: {
      type: "object",
      properties: {
        product_name: {
          type: "string",
          description: "Tên sản phẩm chính khách hàng muốn mua."
        },
        amount: {
          type: "number",
          description: "Tổng số tiền thanh toán tính bằng USDC (ví dụ: 0.1)."
        },
        seller_wallet: {
          type: "string",
          description: "Địa chỉ ví nhận tiền của người bán (tùy chọn — hệ thống tự điền nếu bỏ trống)."
        },
        customer_name: {
          type: "string",
          description: "Họ và tên của khách hàng nhận đơn hàng."
        },
        customer_phone: {
          type: "string",
          description: "Số điện thoại liên hệ của khách hàng nhận đơn hàng."
        },
        customer_address: {
          type: "string",
          description: "Địa chỉ giao nhận hàng của khách hàng."
        }
      },
      required: ["product_name", "amount", "customer_name", "customer_phone", "customer_address"]
    }
  }
};
