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
  getOrderById,
  API_BASE_URL
};
