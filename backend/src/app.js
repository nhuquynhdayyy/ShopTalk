const express = require('express');
const cors = require('cors');
const path = require('path');

// Load cấu hình các biến môi trường từ file .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ordersRouter = require('./routes/orders.routes');
const paymentRouter = require('./routes/payment.routes');
const aiRouter = require('./routes/ai.routes');
const agentToolsRouter = require('./routes/agent-tools.routes');
const agoraRouter = require('./routes/agora.routes');
const webhookRouter = require('./routes/webhook.routes');
const { startPaymentWatcher, stopPaymentWatcher } = require('./workers/paymentWatcher');
const { startExpirationCron, stopExpirationCron } = require('./workers/expirationCron');
const { startPaymentReminderWorker, stopPaymentReminderWorker } = require('./workers/paymentReminder.worker');

const http = require('http');
const { initSocket } = require('./websocket/socket.server');

const app = express();
const PORT = process.env.PORT || 3000;

// Đăng ký các middleware cơ bản
app.use(cors({
  origin: '*', // Cho phép gọi API xuyên miền (CORS) phục vụ cho Frontend
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS']
})); 
app.use(express.json()); // Hỗ trợ đọc dữ liệu JSON gửi lên trong req.body

// Đăng ký route quản lý đơn hàng
app.use('/orders', ordersRouter);
app.use('/payment', paymentRouter);
app.use('/api/ai', aiRouter);
app.use('/api/agora', agoraRouter);
app.use('/api/agent-tools', agentToolsRouter);
app.use('/', webhookRouter);

// Endpoint mặc định kiểm tra trạng thái hoạt động của Server
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ShopTalk Backend API đang hoạt động bình thường.'
  });
});

// Tạo Server HTTP từ app Express
const server = http.createServer(app);

// Khởi tạo Socket.io Server
initSocket(server);

// Khởi chạy server HTTP
server.listen(PORT, () => {
  console.log(`🚀 Server backend đã khởi chạy thành công tại cổng ${PORT}`);
  console.log(`👉 API Đơn hàng: http://localhost:${PORT}/orders`);

  // Khởi động Payment Watcher sau khi server đã sẵn sàng
  startPaymentWatcher();
  startExpirationCron();
  startPaymentReminderWorker();
});

// Graceful shutdown — dừng watcher trước khi tắt process
const shutdown = () => {
  console.log('\n[App] Đang tắt server...');
  stopPaymentWatcher();
  stopExpirationCron();
  stopPaymentReminderWorker();
  server.close(() => {
    console.log('[App] Server đã dừng hoàn toàn.');
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
