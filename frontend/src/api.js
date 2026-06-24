import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 12000
});

const tryEndpoints = async (method, endpoints, payload) => {
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = method === 'get'
        ? await http.get(endpoint)
        : await http.post(endpoint, payload);

      return response.data;
    } catch (error) {
      lastError = error;

      if (error.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError;
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
const sendChatMessage = (message, sessionId = null) => (
  tryEndpoints('post', ['/api/ai/chat', '/chat'], { message, sessionId })
);

const getOrders = () => (
  tryEndpoints('get', ['/api/orders', '/orders'])
);

const getOrderById = (orderId) => (
  tryEndpoints('get', [`/api/orders/${orderId}`, `/orders/${orderId}`])
);

export default {
  http,
  sendChatMessage,
  getOrders,
  getAgoraToken,
  startAgoraAgent,
  getOrderById,
  API_BASE_URL
};
