const assert = require('assert');
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/config/db.js');
const queries = [];
const paramsLog = [];

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (queryText, params) => {
      queries.push(queryText);
      paramsLog.push(params);
      
      if (queryText.includes('UPDATE orders')) {
        return {
          rowCount: 1,
          rows: [
            { id: 'expired-order-1', product_name: 'AT-001' }
          ],
        };
      }
      if (queryText.includes('SELECT * FROM products')) {
        return {
          rowCount: 1,
          rows: [
            { id: 'product-uuid-1', sku: 'AT-001', name: 'Áo Thun', stock: 10 }
          ],
        };
      }
      if (queryText.includes('UPDATE products')) {
        return {
          rowCount: 1,
          rows: [
            { id: 'product-uuid-1', sku: 'AT-001', name: 'Áo Thun', stock: 11 }
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  },
};

const { runExpirationSweep } = require('./src/workers/expirationCron');

(async () => {
  const result = await runExpirationSweep();

  assert.deepStrictEqual(result, {
    skipped: false,
    expiredCount: 1,
  });

  // Có tổng cộng 3 query: Update order, Select product, Update product stock
  assert.strictEqual(queries.length, 3);
  
  // Kiểm tra query 1: Expiration sweep
  assert.ok(queries[0].includes("SET status = 'expired'"));
  assert.ok(queries[0].includes('RETURNING id, product_name'));
  
  // Kiểm tra query 2: Product lookup
  assert.ok(queries[1].includes('SELECT * FROM products'));
  assert.deepStrictEqual(paramsLog[1], ['AT-001', 'AT-001']);
  
  // Kiểm tra query 3: Stock increment
  assert.ok(queries[2].includes('UPDATE products'));
  assert.ok(queries[2].includes('stock = stock + $2'));
  assert.deepStrictEqual(paramsLog[2], ['product-uuid-1', 1]);

  console.log('PASS expirationCron expired pending orders case with stock restoration');
})();
