/**
 * test-debug-payment-flow.js
 * 
 * Script để debug toàn bộ payment flow và tìm vấn đề
 * 
 * Kiểm tra:
 * 1. Database có order pending không?
 * 2. Order có sessionId mapping không?
 * 3. Socket.io có khởi tạo không?
 * 4. Room có client nào join không?
 * 5. Event có được emit đúng room không?
 */

const { getPendingOrders, getOrderById, updateOrderStatus } = require('./src/models/order.model');
const { getIo } = require('./src/websocket/socket.server');

async function debugPaymentFlow() {
  console.log('\n🔍 ===== DEBUG PAYMENT FLOW =====\n');

  // 1. Kiểm tra pending orders
  console.log('1️⃣  Kiểm tra pending orders...');
  try {
    const pendingOrders = await getPendingOrders();
    console.log(`   ✅ Tìm thấy ${pendingOrders.length} đơn hàng pending:`);
    pendingOrders.forEach(order => {
      console.log(`      - Order #${order.id}`);
      console.log(`        Reference: ${order.reference}`);
      console.log(`        Amount: ${order.amount} USDC`);
      console.log(`        Product: ${order.product_name}`);
      console.log(`        Status: ${order.status}`);
      console.log(`        Created: ${order.created_at}`);
      console.log('');
    });

    if (pendingOrders.length === 0) {
      console.log('   ⚠️  KHÔNG CÓ đơn hàng pending!');
      console.log('   → Tạo đơn hàng mới qua chat hoặc voice để test');
      console.log('');
    }
  } catch (err) {
    console.error('   ❌ Lỗi khi lấy pending orders:', err.message);
  }

  // 2. Kiểm tra orderSessions mapping
  console.log('2️⃣  Kiểm tra orderSessions mapping...');
  try {
    const { orderSessions } = require('./src/services/ai.service');
    console.log(`   ✅ OrderSessions có ${orderSessions.size} mappings:`);
    for (const [orderId, sessionId] of orderSessions.entries()) {
      console.log(`      - Order ${orderId} → Session ${sessionId}`);
    }
    if (orderSessions.size === 0) {
      console.log('   ⚠️  KHÔNG CÓ mapping nào!');
      console.log('   → Đơn hàng phải được tạo qua AI agent để có sessionId');
    }
    console.log('');
  } catch (err) {
    console.error('   ❌ Lỗi khi lấy orderSessions:', err.message);
  }

  // 3. Kiểm tra Socket.io
  console.log('3️⃣  Kiểm tra Socket.io server...');
  const io = getIo();
  if (!io) {
    console.error('   ❌ Socket.io CHƯA được khởi tạo!');
    console.log('   → Backend server phải được start trước: npm start');
    console.log('');
  } else {
    console.log('   ✅ Socket.io đã khởi tạo');
    
    // Lấy danh sách rooms
    const sockets = await io.fetchSockets();
    console.log(`   ✅ Có ${sockets.length} clients đang kết nối:`);
    
    sockets.forEach((socket, index) => {
      console.log(`      Client ${index + 1}:`);
      console.log(`        Socket ID: ${socket.id}`);
      console.log(`        Rooms: ${Array.from(socket.rooms).join(', ')}`);
      console.log(`        Data:`, socket.data);
    });

    if (sockets.length === 0) {
      console.log('   ⚠️  KHÔNG CÓ client nào kết nối!');
      console.log('   → Mở frontend (http://localhost:5173) để connect');
    }
    console.log('');
  }

  // 4. Test emit event
  console.log('4️⃣  Test emit payment_confirmed event...');
  if (!io) {
    console.log('   ⏭️  Bỏ qua (Socket.io chưa init)');
  } else {
    try {
      const { orderSessions } = require('./src/services/ai.service');
      const pendingOrders = await getPendingOrders();
      
      if (pendingOrders.length > 0 && orderSessions.size > 0) {
        // Lấy order đầu tiên có sessionId
        const testOrder = pendingOrders.find(order => orderSessions.has(order.id));
        
        if (testOrder) {
          const sessionId = orderSessions.get(testOrder.id);
          const room = `session:${sessionId}`;
          
          console.log(`   🧪 Test với order #${testOrder.id}`);
          console.log(`      SessionId: ${sessionId}`);
          console.log(`      Room: ${room}`);
          
          // Emit vào room
          io.to(room).emit('payment_confirmed', {
            orderId: testOrder.id,
            sessionId: sessionId,
            test: true
          });
          
          console.log('   ✅ Đã emit event vào room');
          console.log('   → Kiểm tra browser console xem có nhận event không');
          console.log('');
        } else {
          console.log('   ⚠️  Không tìm thấy order nào có sessionId mapping');
          console.log('   → Tạo đơn hàng mới qua chat để có sessionId');
          console.log('');
        }
      } else {
        console.log('   ⏭️  Không có order hoặc sessionId để test');
        console.log('');
      }
    } catch (err) {
      console.error('   ❌ Lỗi khi test emit:', err.message);
    }
  }

  // 5. Recommendations
  console.log('📋 ===== KHUYẾN NGHỊ =====\n');
  
  const pendingOrders = await getPendingOrders();
  const { orderSessions } = require('./src/services/ai.service');
  const io = getIo();
  const sockets = io ? await io.fetchSockets() : [];

  const issues = [];
  
  if (!io) {
    issues.push('❌ Socket.io chưa khởi tạo → Start backend server: npm start');
  }
  
  if (pendingOrders.length === 0) {
    issues.push('⚠️  Không có pending orders → Tạo đơn hàng qua chat/voice');
  }
  
  if (orderSessions.size === 0) {
    issues.push('⚠️  Không có sessionId mapping → Đơn hàng phải tạo qua AI agent');
  }
  
  if (sockets.length === 0) {
    issues.push('⚠️  Không có client kết nối → Mở frontend (http://localhost:5173)');
  }

  if (issues.length > 0) {
    console.log('⚠️  VẤN ĐỀ PHÁT HIỆN:');
    issues.forEach(issue => console.log(`   ${issue}`));
    console.log('');
  } else {
    console.log('✅ Mọi thứ đều OK! Payment flow sẵn sàng.');
    console.log('');
    console.log('🧪 NEXT STEPS:');
    console.log('   1. Mở browser console (F12)');
    console.log('   2. Quan sát logs: [Socket] payment_confirmed');
    console.log('   3. QR modal sẽ tự động đóng khi event được emit');
    console.log('');
  }

  console.log('===== END DEBUG =====\n');
  process.exit(0);
}

// Đợi 2 giây để server khởi động
setTimeout(() => {
  debugPaymentFlow().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}, 2000);

console.log('⏳ Đang đợi server khởi động...\n');
