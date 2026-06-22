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

export default {
  api,
  sendChatMessage,
  getOrders,
  API_BASE_URL
};
