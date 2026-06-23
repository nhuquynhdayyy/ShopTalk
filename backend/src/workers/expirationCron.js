const cron = require('node-cron');
const { getExpiredPendingOrders, updateOrderStatus } = require('../models/order.model');

let expirationTask = null;
let isSweeping = false;

const runExpirationSweep = async () => {
  if (isSweeping) {
    return { skipped: true, expiredCount: 0 };
  }

  isSweeping = true;

  try {
    const expiredOrders = await getExpiredPendingOrders();

    for (const order of expiredOrders) {
      await updateOrderStatus(order.id, 'expired');
      console.log(`[ExpirationCron] Order #${order.id} expired after payment timeout.`);
    }

    return {
      skipped: false,
      expiredCount: expiredOrders.length,
    };
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
