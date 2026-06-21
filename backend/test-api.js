const http = require('http');
const app = require('./src/app');
const { pool } = require('./src/config/db');

// Khởi động server test trên cổng 3001
const PORT = 3001;
const server = http.createServer(app);

// Hàm helper gửi HTTP request sử dụng thư viện http có sẵn của Node.js
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

server.listen(PORT, async () => {
  console.log(`=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG REST API TRÊN CỔNG ${PORT} ===\n`);

  try {
    // 1. Kiểm thử POST /orders (Tạo đơn hàng thành công)
    console.log('1. Kiểm thử POST /orders (Đầy đủ tham số)...');
    const orderPayload = {
      product_name: 'Solana Mobile Saga Phone',
      amount: 499.99,
      seller_wallet: 'Bv3n1H1XU2Rz2k2eK1tqJj6Tuxy9rSwP8gM99fKkZpQy'
    };

    const postResponse = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, orderPayload);

    console.log('Trạng thái phản hồi:', postResponse.statusCode);
    console.log('Dữ liệu trả về:', JSON.stringify(postResponse.body, null, 2));

    if (postResponse.statusCode !== 201 || !postResponse.body.success) {
      throw new Error('POST /orders không trả về mã 201 hoặc success = false!');
    }

    const createdOrder = postResponse.body.data;
    console.log('✅ POST /orders thành công. Reference key được sinh ra:', createdOrder.reference);

    // 2. Kiểm thử POST /orders với tham số bị thiếu (Kiểm tra validation 400)
    console.log('\n2. Kiểm thử POST /orders (Thiếu trường amount để test lỗi 400)...');
    const badPayload = {
      product_name: 'Solana Mobile Saga Phone',
      seller_wallet: 'Bv3n1H1XU2Rz2k2eK1tqJj6Tuxy9rSwP8gM99fKkZpQy'
    };

    const badResponse = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, badPayload);

    console.log('Trạng thái phản hồi (mong đợi 400):', badResponse.statusCode);
    console.log('Thông điệp lỗi:', badResponse.body.error);

    if (badResponse.statusCode !== 400) {
      throw new Error('POST /orders không trả về mã 400 khi thiếu thông tin!');
    }
    console.log('✅ Validation 400 hoạt động chính xác.');

    // 3. Kiểm thử GET /orders (Lấy danh sách tất cả đơn hàng)
    console.log('\n3. Kiểm thử GET /orders (Lấy toàn bộ đơn hàng)...');
    const getListResponse = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orders',
      method: 'GET'
    });

    console.log('Trạng thái phản hồi:', getListResponse.statusCode);
    console.log('Số lượng đơn hàng lấy được:', getListResponse.body.data ? getListResponse.body.data.length : 0);

    if (getListResponse.statusCode !== 200 || !getListResponse.body.success) {
      throw new Error('GET /orders không hoạt động!');
    }
    console.log('✅ GET /orders thành công.');

    // 4. Kiểm thử GET /orders/:id (Lấy chi tiết đơn hàng vừa tạo)
    console.log(`\n4. Kiểm thử GET /orders/${createdOrder.id} (Đơn hàng vừa tạo)...`);
    const getResponse = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/orders/${createdOrder.id}`,
      method: 'GET'
    });

    console.log('Trạng thái phản hồi:', getResponse.statusCode);
    console.log('Dữ liệu trả về:', JSON.stringify(getResponse.body, null, 2));

    if (getResponse.statusCode !== 200 || !getResponse.body.success) {
      throw new Error('GET /orders/:id không hoạt động!');
    }
    console.log('✅ GET /orders/:id thành công.');

    // 5. Kiểm thử GET /orders/:id với ID không tồn tại (Kiểm tra lỗi 404)
    const fakeId = '00000000-0000-0000-0000-000000000000';
    console.log(`\n5. Kiểm thử GET /orders/${fakeId} (ID không tồn tại để test lỗi 404)...`);
    const notFoundResponse = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/orders/${fakeId}`,
      method: 'GET'
    });

    console.log('Trạng thái phản hồi (mong đợi 404):', notFoundResponse.statusCode);
    console.log('Thông điệp lỗi:', notFoundResponse.body.error);

    if (notFoundResponse.statusCode !== 404) {
      throw new Error('GET /orders/:id không trả về mã 404 khi ID không tồn tại!');
    }
    console.log('✅ Trả về 404 hoạt động chính xác.');

    console.log('\n🎉 TOÀN BỘ CÁC ĐIỂM CUỐI REST API ĐÃ ĐƯỢC KIỂM THỬ THÀNH CÔNG!');

  } catch (error) {
    console.error('\n❌ Phát hiện lỗi trong quá trình kiểm thử:', error.message);
  } finally {
    // Đóng server test
    server.close(() => {
      console.log('Test server đã dừng.');
    });
    // Đóng pool kết nối DB
    await pool.end();
  }
});

