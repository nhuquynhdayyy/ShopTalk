const { Server } = require('socket.io');

let io = null;

const emitSocketEvent = (eventName, payload) => {
  if (!io) {
    console.warn(`[Socket.io] Chưa khởi tạo, bỏ qua event "${eventName}".`);
    return false;
  }

  io.emit(eventName, payload);
  return true;
};

const emitOrderPaid = (order) => {
  const payload = {
    orderId: order.id,
    reference: order.reference,
    amount: Number(order.amount),
    productName: order.product_name,
    txSignature: order.tx_signature,
    paidAt: new Date().toISOString(),
  };

  return emitSocketEvent('order_paid', payload);
};

const emitTranscriptReceived = ({ sessionId, sender, transcript, type = 'voice', id, timestamp = new Date().toISOString() }) => (
  emitSocketEvent('transcript_received', {
    sessionId,
    sender,
    transcript,
    type,
    id,
    timestamp,
  })
);

const emitEscalationRequest = ({ sessionId, message, reason = 'manual_request', timestamp = new Date().toISOString() }) => (
  emitSocketEvent('escalation_request', {
    sessionId,
    message,
    reason,
    timestamp,
  })
);

const emitPaymentReminder = ({ orderId, amount, productName, minutesWaiting, timestamp = new Date().toISOString() }) => (
  emitSocketEvent('payment_reminder', {
    orderId,
    amount: Number(amount),
    productName,
    minutesWaiting,
    timestamp,
  })
);

/**
 * Khởi tạo Socket.io Server gắn liền với HTTP Server
 * @param {Object} server - Instance của HTTP server Express
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Cho phép kết nối từ mọi nguồn (bao gồm cả port 5173 của frontend)
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] 🔌 Client mới đã kết nối: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[Socket.io] ❌ Client đã ngắt kết nối: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Lấy instance của Socket.io đã được khởi tạo
 * @returns {Object|null}
 */
const getIo = () => {
  return io;
};

const __setIoForTest = (mockIo) => {
  io = mockIo;
};

module.exports = {
  initSocket,
  getIo,
  emitSocketEvent,
  emitOrderPaid,
  emitTranscriptReceived,
  emitEscalationRequest,
  emitPaymentReminder,
  __setIoForTest
};
