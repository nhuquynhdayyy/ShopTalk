const ChatHistoryModel = require('../models/chatHistory.model');
const { emitTranscriptReceived } = require('../websocket/socket.server');

const recordTranscript = async ({
  sessionId,
  sender = 'user',
  transcript,
  audioUrl = null,
  timestamp = new Date().toISOString(),
}) => {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  if (!transcript || !String(transcript).trim()) {
    throw new Error('transcript is required');
  }

  const savedMessage = await ChatHistoryModel.addMessage(
    sessionId,
    sender,
    'voice',
    String(transcript).trim(),
    audioUrl
  );

  emitTranscriptReceived({
    sessionId,
    sender,
    transcript: savedMessage.content,
    type: savedMessage.type || 'voice',
    timestamp,
  });

  return savedMessage;
};

module.exports = { recordTranscript };
