/**
 * Định nghĩa Tool: log_feedback
 * Mô tả: Ghi nhận ý kiến đóng góp, phản hồi (feedback) của khách hàng về đơn hàng hoặc dịch vụ.
 */

module.exports = {
  type: "function",
  function: {
    name: "log_feedback",
    description: "Ghi nhận ý kiến đóng góp, phản hồi (feedback) của khách hàng về đơn hàng hoặc dịch vụ.",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "Mã đơn hàng cần ghi nhận phản hồi (nếu có)."
        },
        feedback_text: {
          type: "string",
          description: "Nội dung phản hồi từ khách hàng."
        }
      },
      required: ["feedback_text"]
    }
  }
};
