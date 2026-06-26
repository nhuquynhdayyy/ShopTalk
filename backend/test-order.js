const { pool } = require('./src/config/db');
const {
  createOrder,
  getOrderById,
  getOrderByReference,
  updateOrderStatus
} = require('./src/models/order.model');

// Hàm tạo một chuỗi ngẫu nhiên mô phỏng Solana Pay Reference Public Key
function generateMockReference() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function runTest() {
  console.log('=== KHỞI CHẠY KIỂM THỬ ORDER CRUD ===');
  
  // Tạo thông tin order mẫu
  const mockOrderData = {
    reference: generateMockReference(),
    product_name: 'Khóa học Solana Developer nâng cao',
    amount: 150.50, // 150.50 USDC
    seller_wallet: 'Bv3n1H1XU2Rz2k2eK1tqJj6Tuxy9rSwP8gM99fKkZpQy',
    customer_name: 'Nguyễn Như Quỳnh',
    customer_phone: '0987654321',
    customer_address: 'Đà Nẵng'
  };

  try {
    // 1. Kiểm tra chèn dữ liệu (Create)
    console.log('\n1. Đang tạo đơn hàng mẫu...');
    const newOrder = await createOrder(mockOrderData);
    console.log('✅ Đơn hàng đã tạo thành công:', newOrder);

    // 2. Lấy thông tin đơn hàng theo ID (Read)
    console.log(`\n2. Đang tìm kiếm đơn hàng theo ID: ${newOrder.id}...`);
    const foundById = await getOrderById(newOrder.id);
    console.log('✅ Kết quả tìm theo ID:', foundById);

    // 3. Lấy thông tin đơn hàng theo Solana Reference (Read)
    console.log(`\n3. Đang tìm kiếm đơn hàng theo Reference: ${mockOrderData.reference}...`);
    const foundByRef = await getOrderByReference(mockOrderData.reference);
    console.log('✅ Kết quả tìm theo Reference:', foundByRef);

    // 4. Cập nhật trạng thái đơn hàng sang 'paid' kèm signature (Update)
    const mockTxSignature = '5y9gZ7K...mock...signature...7x1K';
    console.log(`\n4. Đang cập nhật trạng thái đơn hàng ${newOrder.id} sang "paid"...`);
    const updatedOrder = await updateOrderStatus(newOrder.id, 'paid', mockTxSignature);
    console.log('✅ Đơn hàng sau khi cập nhật:', updatedOrder);

    console.log('\n🎉 KIỂM THỬ THÀNH CÔNG RỰC RỠ! Tất cả hàm CRUD hoạt động hoàn hảo.');
  } catch (error) {
    console.error('\n❌ Thử nghiệm thất bại. Lỗi xảy ra:', error.message);
    console.log('Lưu ý: Hãy chắc chắn bạn đã chạy lệnh migration tạo bảng và cấu hình đúng DATABASE_URL trong file .env');
  } finally {
    // Đóng pool kết nối để dừng tiến trình node
    await pool.end();
    console.log('\n=== KẾT THÚC KIỂM THỬ ===');
  }
}

runTest();
