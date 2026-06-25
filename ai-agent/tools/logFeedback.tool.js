/**
 * Tool: logFeedback
 * Nhiệm vụ: Lưu phản hồi / góp ý của khách hàng vào bảng `chat_history`
 * Thảo Nguyên - feature/ai-agora-v2
 */

// ─── Tool Definition (dùng cho LLM Tool Calling) ─────────────────────────────

const logFeedbackToolDefinition = {
  type: "function",
  function: {
    name: "log_feedback",
    description:
      "Lưu phản hồi hoặc góp ý của khách hàng vào lịch sử chat. " +
      "Dùng khi khách khen, chê, hoặc có góp ý về sản phẩm / dịch vụ của shop.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "ID của session chat hiện tại",
        },
        feedback_type: {
          type: "string",
          enum: ["positive", "negative", "suggestion", "complaint", "consultation", "other"],
          description: "Loại phản hồi",
        },
        content: {
          type: "string",
          description: "Nội dung phản hồi của khách hàng (ghi nguyên văn hoặc tóm tắt)",
        },
        product_sku: {
          type: "string",
          description: "SKU sản phẩm liên quan (nếu có)",
        },
        rating: {
          type: "number",
          minimum: 1,
          maximum: 5,
          description: "Điểm đánh giá từ 1–5 (nếu khách có cho điểm)",
        },
      },
      required: ["feedback_type", "content"],
    },
  },
};

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Xử lý tool call log_feedback từ AI Agent
 * @param {object} args - Tham số từ LLM
 * @param {object} deps - Dependencies (db pool, logger...)
 * @returns {object} - Kết quả trả về cho LLM
 */
async function logFeedbackHandler(args, deps = {}) {
  const { session_id, feedback_type, content, product_sku, rating } = args;
  const { db, logger } = deps;

  // ── Mock mode (khi chưa có DB) ─────────────────────────────────────────────
  if (!db) {
    const mockResult = {
      success: true,
      message: "[MOCK] Feedback đã được ghi nhận thành công.",
      logged: {
        session_id,
        feedback_type,
        content,
        product_sku: product_sku || null,
        rating: rating || null,
        timestamp: new Date().toISOString(),
      },
    };
    if (logger) logger.info("[logFeedback] MOCK:", mockResult.logged);
    else console.log("[logFeedback] MOCK:", mockResult.logged);
    return mockResult;
  }

  // ── Production mode ────────────────────────────────────────────────────────
  try {
    // Kiểm tra session tồn tại
    const sessionCheck = await db.query(
      "SELECT id FROM sessions WHERE id = $1",
      [session_id]
    );
    if (sessionCheck.rowCount === 0) {
      return {
        success: false,
        message: `Session ${session_id} không tồn tại.`,
      };
    }

    // Chuẩn bị metadata feedback
    const feedbackMeta = {
      feedback_type,
      rating: rating || null,
      product_sku: product_sku || null,
    };

    // Lưu vào chat_history với sender = "ai", type = "text"
    // Content chứa cả feedback data dưới dạng JSON
    const insertQuery = `
      INSERT INTO chat_history (id, session_id, sender, type, content, timestamp)
      VALUES (gen_random_uuid(), $1, 'ai', 'text', $2, NOW())
      RETURNING id, timestamp
    `;

    // Lưu nội dung kèm metadata dưới dạng JSON string
    const contentWithMeta = JSON.stringify({
      type: 'feedback',
      text: content,
      meta: feedbackMeta,
    });

    const result = await db.query(insertQuery, [session_id, contentWithMeta]);
    const { id: record_id, timestamp } = result.rows[0];

    if (logger) {
      logger.info(`[logFeedback] Saved feedback ${record_id} for session ${session_id}`);
    }

    return {
      success: true,
      message: "Cảm ơn bạn đã chia sẻ phản hồi! Shop sẽ ghi nhận và cải thiện ạ 😊",
      record_id,
      timestamp,
    };
  } catch (error) {
    const errMsg = error.message || "Unknown error";
    if (logger) logger.error("[logFeedback] Error:", errMsg);
    else console.error("[logFeedback] Error:", errMsg);

    return {
      success: false,
      message: "Có lỗi khi lưu phản hồi, bạn vui lòng thử lại sau nhé ạ.",
      error: errMsg,
    };
  }
}

// ─── Response formatter (AI đọc kết quả tool) ────────────────────────────────

/**
 * Format kết quả tool thành text để AI hiểu và trả lời khách
 * @param {object} result - Kết quả từ handler
 * @returns {string}
 */
function formatLogFeedbackResult(result) {
  if (result.success) {
    return result.message;
  }
  return `Không thể lưu phản hồi: ${result.message}`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  definition: logFeedbackToolDefinition,
  handler: logFeedbackHandler,
  formatResult: formatLogFeedbackResult,
};