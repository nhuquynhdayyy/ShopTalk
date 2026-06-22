const express = require('express');
const cors = require('cors');
const path = require('path');

// Load cấu hình các biến môi trường từ file .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ordersRouter = require('./routes/orders.routes');
const paymentRouter = require('./routes/payment.routes');
const aiRouter = require('./routes/ai.routes');
const { startPaymentWatcher, stopPaymentWatcher } = require('./workers/paymentWatcher');

const http = require('http');
const { initSocket } = require('./websocket/socket.server');

const app = express();
const PORT = process.env.PORT || 3000;

// Đăng ký các middleware cơ bản
app.use(cors({
  origin: '*', // Cho phép gọi API xuyên miền (CORS) phục vụ cho Frontend
  methods: ['GET', 'POST']
})); 
app.use(express.json()); // Hỗ trợ đọc dữ liệu JSON gửi lên trong req.body

// Đăng ký route quản lý đơn hàng
app.use('/orders', ordersRouter);
app.use('/payment', paymentRouter);
app.use('/', aiRouter);

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
});

// Graceful shutdown — dừng watcher trước khi tắt process
const shutdown = () => {
  console.log('\n[App] Đang tắt server...');
  stopPaymentWatcher();
  server.close(() => {
    console.log('[App] Server đã dừng hoàn toàn.');
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;

