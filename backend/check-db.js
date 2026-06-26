const db = require('./src/config/db');
async function run() {
  try {
    const res = await db.query('SELECT id, status, product_name, amount, tx_signature, customer_name, customer_phone FROM orders ORDER BY created_at DESC LIMIT 5;');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
