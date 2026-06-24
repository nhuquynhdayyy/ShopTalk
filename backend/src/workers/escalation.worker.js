const SessionModel = require('../models/session.model');
const ChatHistoryModel = require('../models/chatHistory.model');
const { emitEscalationRequest } = require('../websocket/socket.server');

const processEscalation = async ({
  sessionId,
  message,
  reason = 'manual_request',
  sender = 'user',
  timestamp = new Date().toISOString(),
}) => {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  if (!message || !String(message).trim()) {
    throw new Error('message is required');
  }

  const cleanMessage = String(message).trim();
  const session = await SessionModel.updateStatus(sessionId, 'escalated');
  const history = await ChatHistoryModel.addMessage(sessionId, sender, 'text', cleanMessage);

  emitEscalationRequest({
    sessionId,
    message: cleanMessage,
    reason,
    timestamp,
  });

  return { session, history };
};

module.exports = { processEscalation };
