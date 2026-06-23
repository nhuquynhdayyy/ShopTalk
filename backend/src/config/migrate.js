const { pool } = require('./db');

/**
 * Script migration khởi tạo cơ sở dữ liệu
 * Chạy bằng lệnh: node src/config/migrate.js từ thư mục backend/
 */
async function runMigration() {
  console.log('=== KHỞI CHẠY MIGRATION TẠO BẢNG "orders" ===');
  
  const sql = `
    -- Kích hoạt extension hỗ trợ tạo UUID ngẫu nhiên nếu chưa có
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Tạo bảng orders lưu thông tin giao dịch Solana Pay
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      reference VARCHAR(255) UNIQUE NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      amount DECIMAL(20, 6) NOT NULL,
      seller_wallet VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending' NOT NULL,
      tx_signature VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
      customer_name VARCHAR(255),
      customer_address TEXT,
      items_list JSONB,
      CONSTRAINT chk_status CHECK (status IN ('pending', 'paid', 'expired', 'payment_mismatch'))
    );

    -- Thêm các trường mới vào bảng orders nếu bảng đã tồn tại từ trước
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_list JSONB;
  `;

  try {
    await pool.query(sql);
    console.log('✅ Migration thành công! Bảng "orders" đã được thiết lập thành công.');
  } catch (error) {
    console.error('❌ Lỗi xảy ra trong quá trình chạy migration:', error.message);
    process.exit(1);
  } finally {
    // Đóng pool kết nối để tiến trình có thể kết thúc hoàn toàn
    await pool.end();
    console.log('=== KẾT THÚC MIGRATION ===');
  }
}

runMigration();
