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
          description: "Địa chỉ ví nhận tiền của người bán. Mặc định là: 5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ"
        },
        customer_name: {
          type: "string",
          description: "Họ và tên của khách hàng nhận đơn hàng."
        },
        customer_address: {
          type: "string",
          description: "Địa chỉ giao nhận hàng của khách hàng."
        },
        items_list: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              quantity: { type: "number" },
              price_usdc: { type: "number" }
            },
            required: ["name", "quantity", "price_usdc"]
          },
          description: "Danh sách chi tiết các sản phẩm được mua trong đơn."
        }
      },
      required: ["product_name", "amount", "seller_wallet", "customer_name", "customer_address"]
    }
  }
};
