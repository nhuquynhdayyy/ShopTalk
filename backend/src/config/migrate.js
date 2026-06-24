const { pool } = require('./db');

/**
 * Script migration khởi tạo toàn bộ cơ sở dữ liệu mới cho ShopTalk
 * Chạy bằng lệnh: node src/config/migrate.js từ thư mục backend/
 */
async function runMigration() {
  console.log('🚀 Bắt đầu chạy hệ thống migration cơ sở dữ liệu...');

  try {
    // 1. Kích hoạt extension uuid-ossp
    console.log('🚀 Bắt đầu: Kích hoạt extension "uuid-ossp"...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    console.log('✅ Xong: Extension "uuid-ossp" đã sẵn sàng.');

    // 2. Tạo bảng sessions
    console.log('🚀 Bắt đầu: Tạo bảng "sessions"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        user_meta JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT chk_sessions_type CHECK (type IN ('text', 'voice')),
        CONSTRAINT chk_sessions_status CHECK (status IN ('active', 'escalated', 'closed'))
      );
    `);
    console.log('✅ Xong: Bảng "sessions" đã được tạo.');

    // 3. Tạo bảng chat_history
    console.log('🚀 Bắt đầu: Tạo bảng "chat_history"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL,
        sender VARCHAR(50) NOT NULL,
        type VARCHAR(50) NOT NULL,
        content TEXT,
        audio_url VARCHAR(500),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_chat_history_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        CONSTRAINT chk_chat_history_sender CHECK (sender IN ('user', 'ai', 'agent')),
        CONSTRAINT chk_chat_history_type CHECK (type IN ('text', 'voice'))
      );
    `);
    console.log('✅ Xong: Bảng "chat_history" đã được tạo.');

    // 4. Tạo bảng products
    console.log('🚀 Bắt đầu: Tạo bảng "products"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sku VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        price_usdc DECIMAL(20, 6) NOT NULL,
        price_vnd DECIMAL(20, 0),
        stock INT NOT NULL DEFAULT 0,
        size_options JSONB DEFAULT '[]'::jsonb,
        color_options JSONB DEFAULT '[]'::jsonb,
        description TEXT,
        selling_points JSONB DEFAULT '[]'::jsonb,
        reviews JSONB DEFAULT '[]'::jsonb,
        images JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Xong: Bảng "products" đã được tạo.');

    // 5. Tạo bảng orders (Giữ nguyên cấu trúc cũ và cập nhật các trường/index)
    console.log('🚀 Bắt đầu: Tạo hoặc cập nhật bảng "orders"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reference VARCHAR(255) UNIQUE NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        amount DECIMAL(20, 6) NOT NULL,
        seller_wallet VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' NOT NULL,
        tx_signature VARCHAR(255),
        payment_reminded_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
        customer_name VARCHAR(255),
        customer_phone VARCHAR(20),
        customer_address TEXT,
        items_list JSONB,
        CONSTRAINT chk_status CHECK (status IN ('pending', 'paid', 'expired', 'payment_mismatch'))
      );

      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_list JSONB;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reminded_at TIMESTAMP WITH TIME ZONE;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_signature_unique
        ON orders (tx_signature)
        WHERE tx_signature IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_orders_status_expires_at
        ON orders (status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
        ON orders (status, created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_payment_reminder
        ON orders (status, payment_reminded_at, created_at);
    `);
    console.log('✅ Xong: Bảng "orders" đã được thiết lập.');

    console.log('🎉 Toàn bộ quá trình migration đã hoàn tất thành công!');
  } catch (error) {
    console.error('❌ Lỗi xảy ra trong quá trình chạy migration:', error.message);
    process.exit(1);
  } finally {
    // Đóng pool kết nối để kết thúc tiến trình sạch sẽ
    await pool.end();
    console.log('🔌 Pool kết nối database đã đóng thành công.');
    console.log('✅ Xong tất cả!');
  }
}

runMigration();

