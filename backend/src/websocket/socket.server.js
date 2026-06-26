const { Server } = require('socket.io');

let io = null;
const liveHandoffSessions = new Map();

const getSessionRoom = (sessionId) => `session:${sessionId}`;

const buildLiveMessagePayload = ({ sessionId, sender, message, id, timestamp = new Date().toISOString() }) => ({
  sessionId,
  sender,
  message: String(message || '').trim(),
  id: id || `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  timestamp,
});

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

const handleJoinSession = (socket, payload = {}) => {
  const sessionId = payload.sessionId;
  if (!sessionId) return false;

  socket.join(getSessionRoom(sessionId));
  socket.data = socket.data || {};
  socket.data.sessionId = sessionId;
  socket.data.role = payload.role || socket.data.role || 'client';
  return true;
};

const handleAcceptEscalation = (socket, payload = {}) => {
  if (!io) return false;
  const sessionId = payload.sessionId;
  if (!sessionId) return false;

  const room = getSessionRoom(sessionId);
  socket.join(room);
  socket.data = socket.data || {};
  socket.data.sessionId = sessionId;
  socket.data.role = 'staff';

  const handoff = {
    sessionId,
    acceptedBy: payload.staffName || payload.staffId || 'staff',
    acceptedAt: new Date().toISOString(),
  };
  liveHandoffSessions.set(sessionId, handoff);
  io.to(room).emit('staff_joined', handoff);
  return true;
};

const handleLiveMessage = (socket, payload = {}) => {
  if (!io) return false;
  const sessionId = payload.sessionId || socket.data?.sessionId;
  const message = payload.message || payload.text || payload.content;
  if (!sessionId || !message || !String(message).trim()) return false;

  const livePayload = buildLiveMessagePayload({
    sessionId,
    sender: payload.sender || socket.data?.role || 'user',
    message,
    id: payload.id,
    timestamp: payload.timestamp,
  });

  io.to(getSessionRoom(sessionId)).emit('live_message', livePayload);
  return true;
};

const isSessionInHandoff = (sessionId) => {
  return liveHandoffSessions.has(sessionId);
};

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

    socket.on('join_session', (payload) => {
      handleJoinSession(socket, payload);
    });

    socket.on('accept_escalation', (payload) => {
      handleAcceptEscalation(socket, payload);
    });

    socket.on('live_message', (payload) => {
      handleLiveMessage(socket, payload);
    });

    socket.on('agent_message', (payload) => {
      const sessionId = payload?.sessionId || socket.data?.sessionId;
      if (sessionId) {
        io.to(getSessionRoom(sessionId)).emit('agent_message', payload);
      }
    });

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

const __resetLiveHandoffForTest = () => {
  liveHandoffSessions.clear();
};

module.exports = {
  initSocket,
  getIo,
  emitSocketEvent,
  emitOrderPaid,
  emitTranscriptReceived,
  emitEscalationRequest,
  emitPaymentReminder,
  handleJoinSession,
  handleAcceptEscalation,
  handleLiveMessage,
  isSessionInHandoff,
  __setIoForTest,
  __resetLiveHandoffForTest
};
