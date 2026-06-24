const assert = require('assert');
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/config/db.js');
const queries = [];

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (queryText) => {
      queries.push(queryText);
      return {
        rowCount: 2,
        rows: [
          { id: 'expired-order-1' },
          { id: 'expired-order-2' },
        ],
      };
    },
  },
};

const { runExpirationSweep } = require('./src/workers/expirationCron');

(async () => {
  const result = await runExpirationSweep();

  assert.deepStrictEqual(result, {
    skipped: false,
    expiredCount: 2,
  });

  assert.strictEqual(queries.length, 1);
  assert.ok(queries[0].includes("SET status = 'expired'"));
  assert.ok(queries[0].includes("WHERE status = 'pending'"));
  assert.ok(queries[0].includes('expires_at <= NOW()'));

  console.log('PASS expirationCron expired pending orders case');
})();
