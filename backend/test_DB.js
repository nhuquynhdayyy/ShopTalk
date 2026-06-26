require('dotenv').config();
const db = require('./src/config/db');

(async () => {
  try {
    const result = await db.pool.query('SELECT NOW() as current_time, version()');
    console.log('✅ Kết nối DB thành công!');
    console.log('Thời gian server DB:', result.rows[0].current_time);
    console.log('Version:', result.rows[0].version);
    process.exit(0);
  } catch (err) {
    console.error('❌ Kết nối DB thất bại:', err.message);
    process.exit(1);
  }
})();