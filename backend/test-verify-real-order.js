require('dotenv').config();
const { Pool } = require('pg');
const { verifyPayment } = require('./src/services/verify.service');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const orderId = process.argv[2];

  let query = 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 1';
  let params = [];

  if (orderId) {
    query = 'SELECT * FROM orders WHERE id = $1';
    params = [orderId];
  }

  const { rows } = await pool.query(query, params);

  if (rows.length === 0) {
    console.error('❌ Không tìm thấy order.');
    process.exit(1);
  }

  const order = rows[0];
  console.log('📦 Order đang kiểm tra:');
  console.log('   id        :', order.id);
  console.log('   reference :', order.reference);
  console.log('   amount    :', order.amount);
  console.log('   seller    :', order.seller_wallet);
  console.log('   status    :', order.status);
  console.log('');

  console.log('🔍 Đang gọi verifyPayment...\n');
  const result = await verifyPayment(order);

  console.log('📋 Kết quả:');
  console.log(JSON.stringify(result, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});