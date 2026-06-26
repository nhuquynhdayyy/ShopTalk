/**
 * Cấu hình Agora Conversational AI Agent
 * Được nạp từ các biến môi trường trong file .env
 */

module.exports = {
  // App ID lấy từ Agora Console (Project Management)
  appId: process.env.AGORA_APP_ID || '',

  // App Certificate lấy từ Agora Console (Project Detail -> Security)
  // Dùng để tạo token bảo mật cho Agent tham gia cuộc gọi
  appCertificate: process.env.AGORA_APP_CERTIFICATE || '',

  // Customer ID & Customer Secret dùng để gọi REST API (Agora Console -> Account -> RESTful API)
  customerId: process.env.AGORA_CUSTOMER_ID || '',
  customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',

  // Model LLM được cấu hình để phục vụ hội thoại
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini'
};
