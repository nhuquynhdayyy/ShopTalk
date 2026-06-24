const cron = require('node-cron');
const {
  getPaymentReminderCandidates,
  markPaymentReminderSent,
} = require('../models/order.model');
const { emitPaymentReminder } = require('../websocket/socket.server');

const REMINDER_AFTER_MINUTES = 5;

let reminderTask = null;
let isSweeping = false;

const runPaymentReminderSweep = async (minutesWaiting = REMINDER_AFTER_MINUTES) => {
  if (isSweeping) {
    return { skipped: true, remindedCount: 0 };
  }

  isSweeping = true;

  try {
    const orders = await getPaymentReminderCandidates(minutesWaiting);
    let remindedCount = 0;

    for (const order of orders) {
      const updatedOrder = await markPaymentReminderSent(order.id);
      if (!updatedOrder) continue;

      emitPaymentReminder({
        orderId: updatedOrder.id,
        amount: Number(updatedOrder.amount),
        productName: updatedOrder.product_name,
        minutesWaiting,
        timestamp: new Date().toISOString(),
      });
      remindedCount += 1;
    }

    return { skipped: false, remindedCount };
  } finally {
    isSweeping = false;
  }
};

const startPaymentReminderWorker = () => {
  if (reminderTask) return reminderTask;

  reminderTask = cron.schedule('* * * * *', async () => {
    try {
      const result = await runPaymentReminderSweep();
      if (result.remindedCount > 0) {
        console.log(`[PaymentReminder] ÄÃ£ gá»­i ${result.remindedCount} nháº¯c thanh toÃ¡n.`);
      }
    } catch (error) {
      console.error('[PaymentReminder] Lá»—i khi quÃ©t Ä‘Æ¡n cáº§n nháº¯c:', error.message);
    }
  });

  console.log('[PaymentReminder] Worker nháº¯c thanh toÃ¡n Ä‘Ã£ khá»Ÿi Ä‘á»™ng.');
  return reminderTask;
};

const stopPaymentReminderWorker = () => {
  if (!reminderTask) return;

  reminderTask.stop();
  reminderTask = null;
  console.log('[PaymentReminder] Worker nháº¯c thanh toÃ¡n Ä‘Ã£ dá»«ng.');
};

module.exports = {
  REMINDER_AFTER_MINUTES,
  runPaymentReminderSweep,
  startPaymentReminderWorker,
  stopPaymentReminderWorker,
};
