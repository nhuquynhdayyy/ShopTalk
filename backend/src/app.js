const express = require('express');
const cors = require('cors');
const path = require('path');

// Load cấu hình các biến môi trường từ file .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ordersRouter = require('./routes/orders.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Đăng ký các middleware cơ bản
app.use(cors()); // Cho phép gọi API xuyên miền (CORS) phục vụ cho Frontend
app.use(express.json()); // Hỗ trợ đọc dữ liệu JSON gửi lên trong req.body

// Đăng ký route quản lý đơn hàng
app.use('/orders', ordersRouter);

// Endpoint mặc định kiểm tra trạng thái hoạt động của Server
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ShopTalk Backend API đang hoạt động bình thường.'
  });
});

// Khởi chạy server Express
app.listen(PORT, () => {
  console.log(`🚀 Server backend đã khởi chạy thành công tại cổng ${PORT}`);
  console.log(`👉 API Đơn hàng: http://localhost:${PORT}/orders`);
});

module.exports = app;
