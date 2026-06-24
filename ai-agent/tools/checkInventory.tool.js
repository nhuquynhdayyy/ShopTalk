/**
 * Định nghĩa Tool: check_inventory
 * Mô tả: Kiểm tra số lượng sản phẩm còn lại và giá bán của sản phẩm trong kho.
 */

module.exports = {
  type: "function",
  function: {
    name: "check_inventory",
    description: "Kiểm tra tồn kho, giá bán, và lấy chi tiết sản phẩm (selling points, description, size, color) để tư vấn.",
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
};
