const cron = require('node-cron');
const db = require('../config/db');

let expirationTask = null;
let isSweeping = false;

const runExpirationSweep = async () => {
  if (isSweeping) {
    return { skipped: true, expiredCount: 0 };
  }

  isSweeping = true;

  try {
    const queryText = `
      UPDATE orders
      SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at <= NOW()
      RETURNING id, product_name;
    `;
    const res = await db.query(queryText);

    if (res.rowCount > 0) {
      console.log(`[ExpirationCron] Successfully expired ${res.rowCount} pending orders.`);
      
      const ProductModel = require('../models/product.model');
      for (const order of res.rows) {
        try {
          const product = await ProductModel.findByNameOrSku(order.product_name);
          if (product) {
            const updatedProduct = await ProductModel.incrementStock(product.id, 1);
            console.log(`[ExpirationCron] Restored stock for product "${product.name}" (SKU: ${product.sku}) because order #${order.id} expired. New stock: ${updatedProduct.stock}`);
          }
        } catch (stockErr) {
          console.error(`[ExpirationCron] Lỗi khi hoàn lại stock cho đơn hàng #${order.id}:`, stockErr.message);
        }
      }
    }

    return {
      skipped: false,
      expiredCount: res.rowCount,
    };
  } catch (error) {
    console.error('[ExpirationCron] Error in runExpirationSweep:', error.message);
    throw error;
  } finally {
    isSweeping = false;
  }
};

const startExpirationCron = () => {
  if (expirationTask) return expirationTask;

  expirationTask = cron.schedule('* * * * *', async () => {
    try {
      await runExpirationSweep();
    } catch (error) {
      console.error('[ExpirationCron] Failed to expire pending orders:', error.message);
    }
  });

  console.log('[ExpirationCron] Started. Pending orders expire every 1 minute.');
  return expirationTask;
};

const stopExpirationCron = () => {
  if (!expirationTask) return;

  expirationTask.stop();
  expirationTask = null;
  console.log('[ExpirationCron] Stopped.');
};

module.exports = {
  runExpirationSweep,
  startExpirationCron,
  stopExpirationCron,
};
