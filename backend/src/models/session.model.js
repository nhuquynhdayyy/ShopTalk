const db = require('../config/db');

class SessionModel {
  /**
   * Hàm chuyển đổi trường user_meta kiểu JSONB từ database thành Object Javascript chuẩn
   * @param {Object} session - Dòng dữ liệu thô của session từ database
   * @returns {Object|null} Session đã được xử lý trường user_meta
   */
  static parseJSONBFields(session) {
    if (!session) return null;
    if (session.user_meta !== undefined) {
      if (typeof session.user_meta === 'string') {
        try {
          session.user_meta = JSON.parse(session.user_meta);
        } catch (e) {
          session.user_meta = {};
        }
      } else if (session.user_meta === null) {
        session.user_meta = {};
      }
    }
    return session;
  }

  /**
   * Tạo một session mới
   * @param {string} type - Loại session ("text" hoặc "voice")
   * @param {Object|string} user_meta - Thông tin metadata của người dùng
   * @returns {Promise<Object>} Session mới được tạo
   */
  static async create(type, user_meta) {
    const queryText = `
      INSERT INTO sessions (type, status, user_meta, created_at)
      VALUES ($1, 'active', $2, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const userMetaValue = user_meta ? (typeof user_meta === 'string' ? user_meta : JSON.stringify(user_meta)) : '{}';
    try {
      const res = await db.query(queryText, [type, userMetaValue]);
      return SessionModel.parseJSONBFields(res.rows[0]);
    } catch (error) {
      console.error('Lỗi trong SessionModel.create:', error.message);
      throw error;
    }
  }

  /**
   * Cập nhật trạng thái của session
   * @param {string} id - UUID của session
   * @param {string} status - Trạng thái mới ("active", "escalated", "closed")
   * @returns {Promise<Object|null>} Session đã cập nhật hoặc null nếu không tìm thấy
   */
  static async updateStatus(id, status) {
    const queryText = `
      UPDATE sessions
      SET status = $2
      WHERE id = $1
      RETURNING *;
    `;
    try {
      const res = await db.query(queryText, [id, status]);
      return SessionModel.parseJSONBFields(res.rows[0]);
    } catch (error) {
      console.error(`Lỗi trong SessionModel.updateStatus với ID ${id}:`, error.message);
      throw error;
    }
  }

  /**
   * Đóng session (Cập nhật status sang 'closed' và lưu closed_at)
   * @param {string} id - UUID của session
   * @returns {Promise<Object|null>} Session đã được đóng hoặc null
   */
  static async close(id) {
    const queryText = `
      UPDATE sessions
      SET status = 'closed', closed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    try {
      const res = await db.query(queryText, [id]);
      return SessionModel.parseJSONBFields(res.rows[0]);
    } catch (error) {
      console.error(`Lỗi trong SessionModel.close với ID ${id}:`, error.message);
      throw error;
    }
  }
}

module.exports = SessionModel;
