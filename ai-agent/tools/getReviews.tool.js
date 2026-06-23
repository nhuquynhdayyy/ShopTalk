/**
 * Định nghĩa Tool: get_reviews
 * Mô tả: Lấy danh sách các đánh giá, phản hồi của khách hàng khác về một sản phẩm.
 */

module.exports = {
  type: "function",
  function: {
    name: "get_reviews",
    description: "Lấy danh sách các đánh giá, phản hồi của khách hàng khác về một sản phẩm.",
    parameters: {
      type: "object",
      properties: {
        product_name: {
          type: "string",
          description: "Tên sản phẩm khách hàng đang muốn xem đánh giá."
        }
      },
      required: ["product_name"]
    }
  }
};
