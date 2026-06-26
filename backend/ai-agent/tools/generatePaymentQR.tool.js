/**
 * Định nghĩa Tool: generate_payment_qr
 * Mô tả: Tạo link thanh toán Solana Pay và chuyển thành QR Code dạng base64.
 */

module.exports = {
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
};
