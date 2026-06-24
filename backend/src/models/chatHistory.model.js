const db = require('../config/db');

class ChatHistoryModel {
  /**
   * Thêm tin nhắn mới vào lịch sử chat
   * @param {string} sessionId - UUID của session chứa tin nhắn
   * @param {string} sender - Người gửi ("user" / "ai" / "agent")
   * @param {string} type - Loại tin nhắn ("text" / "voice")
   * @param {string} content - Nội dung văn bản hoặc transcript giọng nói
   * @param {string|null} [audioUrl=null] - Link file audio ghi âm (nếu có)
   * @returns {Promise<Object>} Tin nhắn vừa được lưu
   */
  static async addMessage(sessionId, sender, type, content, audioUrl = null) {
    const queryText = `
      INSERT INTO chat_history (session_id, sender, type, content, audio_url, timestamp)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    try {
      const res = await db.query(queryText, [sessionId, sender, type, content, audioUrl]);
      return res.rows[0];
    } catch (error) {
      console.error('Lỗi trong ChatHistoryModel.addMessage:', error.message);
      throw error;
    }
  }

  /**
   * Lấy toàn bộ lịch sử tin nhắn của một session theo thứ tự thời gian tăng dần
   * @param {string} sessionId - UUID của session cần truy vấn
   * @returns {Promise<Array>} Danh sách các tin nhắn trong session
   */
  static async getBySession(sessionId) {
    const queryText = `
      SELECT * FROM chat_history
      WHERE session_id = $1
      ORDER BY timestamp ASC;
    `;
    try {
      const res = await db.query(queryText, [sessionId]);
      return res.rows;
    } catch (error) {
      console.error(`Lỗi trong ChatHistoryModel.getBySession với session ID ${sessionId}:`, error.message);
      throw error;
    }
  }
}

module.exports = ChatHistoryModel;
