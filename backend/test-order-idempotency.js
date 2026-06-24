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
        return {
          rows: [
            {
              id: 'existing-order',
              tx_signature: params[0],
              status: 'paid',
            },
          ],
        };
      }

      if (sql.includes('UPDATE orders')) {
        throw new Error('Duplicate signatures must not reach UPDATE');
      }

      return { rows: [] };
    },
  },
};

const { updateOrderStatus } = require('./src/models/order.model');

(async () => {
  const result = await updateOrderStatus('new-order', 'paid', 'duplicate-signature');

  assert.strictEqual(result, null);
  assert.strictEqual(queries.length, 1);
  assert.ok(queries[0].sql.includes('WHERE tx_signature = $1'));
  assert.deepStrictEqual(queries[0].params, ['duplicate-signature']);

  console.log('PASS order.model idempotency duplicate signature case');
})();
