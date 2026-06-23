const assert = require('assert');
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/config/db.js');
const queries = [];

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (sql, params) => {
      queries.push({ sql, params });

      if (sql.includes('WHERE tx_signature = $1')) {
        return { rows: [] };
      }

      if (sql.includes('UPDATE orders')) {
        assert.ok(sql.includes("status <> 'paid'"));
        return { rows: [] };
      }

      return { rows: [] };
    },
  },
};

const { updateOrderStatus } = require('./src/models/order.model');

(async () => {
  const result = await updateOrderStatus('already-paid-order', 'expired');

  assert.strictEqual(result, null);
  assert.strictEqual(queries.length, 1);
  assert.ok(queries[0].sql.includes('UPDATE orders'));
  assert.deepStrictEqual(queries[0].params, ['already-paid-order', 'expired', null]);

  console.log('PASS order.model paid order is not overwritten case');
})();
