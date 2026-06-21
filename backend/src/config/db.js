const { Pool } = require('pg');
const path = require('path');

// Tải cấu hình biến môi trường từ file .env ở thư mục gốc của backend
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('CẢNH BÁO: Biến môi trường DATABASE_URL chưa được định nghĩa trong file .env');
}

// Khởi tạo connection pool kết nối đến database
const pool = new Pool({
  connectionString: connectionString,
  max: 20, // Số lượng kết nối tối đa trong pool
  idleTimeoutMillis: 30000, // Thời gian rảnh của một kết nối trước khi đóng (ms)
  connectionTimeoutMillis: 5000, // Thời gian tối đa chờ kết nối thành công (ms)
});

// Lắng nghe sự kiện lỗi ngoài ý muốn của các client đang rảnh
pool.on('error', (err) => {
  console.error('Lỗi kết nối database đột ngột:', err);
});

module.exports = {
  /**
   * Hàm thực hiện truy vấn SQL rút gọn dùng Pool
   * @param {string} text - Câu truy vấn SQL (Ví dụ: 'SELECT * FROM users WHERE id = $1')
   * @param {Array} params - Mảng tham số truyền vào tương ứng với $1, $2...
   * @returns {Promise<Object>} Kết quả trả về của truy vấn
   */
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (error) {
      console.error('Lỗi khi thực thi truy vấn SQL:', error.message);
      throw error;
    }
  },
  pool,
};
