/**
 * test-emit-payment-confirmed.js
 * 
 * Script để test emit event payment_confirmed qua Socket.io
 * Dùng để kiểm tra xem frontend có nhận và xử lý đúng event này không
 * 
 * Cách dùng:
 * 1. Start backend server: npm start
 * 2. Trong terminal khác, chạy script này: node test-emit-payment-confirmed.js
 * 3. Quan sát frontend để xem QR modal có tự động đóng không
 */

const { getIo } = require('./src/websocket/socket.server');

// Đợi 3 giây để đảm bảo server đã khởi động xong
setTimeout(() => {
  const io = getIo();

  if (!io) {
    console.error('❌ Socket.io chưa được khởi tạo!');
    console.error('   → Đảm bảo backend server đã chạy: npm start');
    process.exit(1);
  }

  console.log('\n🧪 TEST: Emit event payment_confirmed\n');

  // Test Case 1: Emit với orderId cụ thể
  const testOrderId = 'test-order-' + Date.now();
  
  console.log('📤 Emitting payment_confirmed event...');
  console.log('   Order ID:', testOrderId);
  console.log('   Timestamp:', new Date().toISOString());
  
  io.emit('payment_confirmed', {
    orderId: testOrderId,
    timestamp: new Date().toISOString()
  });

  console.log('\n✅ Event đã được emit!');
  console.log('\n📋 Hướng dẫn kiểm tra:');
  console.log('   1. Mở frontend (http://localhost:5173)');
  console.log('   2. Mở DevTools Console (F12)');
  console.log('   3. Tạo đơn hàng để QR modal hiện ra');
  console.log('   4. Chạy lại script này');
  console.log('   5. Quan sát QR modal có tự động đóng không');
  console.log('\n💡 Expected logs trong browser console:');
  console.log('   [Socket] payment_confirmed event received: {...}');
  console.log('   [Socket] payment_confirmed: Kiểm tra orderId: {...}');
  console.log('   [Socket] payment_confirmed: Đóng QR modal và hiển thị thông báo thành công');
  console.log('\n');

  process.exit(0);
}, 3000);

console.log('⏳ Đang đợi server khởi động...');
