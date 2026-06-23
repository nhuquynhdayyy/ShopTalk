import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Gửi tin nhắn chat tới AI Sales Agent
 * @param {string} message - Tin nhắn của người dùng
 * @param {string|null} sessionId - ID phiên chat hiện tại
 */
const sendChatMessage = async (message, sessionId = null) => {
  const response = await api.post('/chat', { message, sessionId });
  return response.data;
};

/**
 * Lấy toàn bộ danh sách đơn hàng
 */
const getOrders = async () => {
  const response = await api.get('/orders');
  return response.data;
};

/**
 * Gọi API để lấy token và appId tham gia kênh Agora
 * @param {string} channelName 
 * @param {number|string} uid 
 */
const getAgoraToken = async (channelName, uid) => {
  const response = await api.post('/agora/token', { channelName, uid });
  return response.data;
};

/**
 * Gọi API để kích hoạt Agent tham gia kênh Voice
 * @param {string} channelName 
 * @param {string} language ('vi' hoặc 'en')
 * @param {string} sessionId ID phiên để đồng bộ lịch sử chat text
 */
const startAgoraAgent = async (channelName, language = 'vi', sessionId = null) => {
  // Sinh UID ngẫu nhiên cho Agent (giả sử 999)
  const response = await api.post('/agora/start-agent', { 
    channelName, 
    agentUid: 999,
    language,
    sessionId
  });
  return response.data;
};

export default {
  api,
  sendChatMessage,
  getOrders,
  getAgoraToken,
  startAgoraAgent,
  API_BASE_URL
};
