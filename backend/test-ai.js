const http = require('http');

const PORT = 3000; // Cổng của backend server đang chạy

// Helper gửi request POST lên API chat
function postChat(message, sessionId = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ message, sessionId });
    
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('=== KHỞI CHẠY KIỂM THỬ AI SALES AGENT CHAT API ===\n');

  try {
    let sessionId = null;

    // 1. Kiểm thử chào hỏi đầu tiên (Khởi tạo session)
    console.log('Bước 1: Gửi lời chào khởi tạo phiên hội thoại...');
    let res = await postChat("Xin chào, shop bán gì thế?");
    console.log('Trạng thái API:', res.success ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI');
    console.log('Session ID mới:', res.sessionId);
    console.log('AI phản hồi:\n', res.reply);
    console.log('--------------------------------------------------\n');
    
    sessionId = res.sessionId;

    // 2. Hỏi sản phẩm tồn kho (Sử dụng check_inventory tool / mock)
    console.log('Bước 2: Hỏi thăm tồn kho điện thoại Saga...');
    res = await postChat("Bên mình còn điện thoại Saga v2 không ạ?", sessionId);
    console.log('AI phản hồi:\n', res.reply);
    console.log('--------------------------------------------------\n');

    // 3. Đặt mua hàng (Sử dụng create_order + generate_payment_qr tool / mock)
    console.log('Bước 3: Gửi yêu cầu mua hàng...');
    res = await postChat("Mình muốn mua 1 cái điện thoại Solana Saga v2 nhé.", sessionId);
    console.log('AI phản hồi:\n', res.reply);
    if (res.qrCodeImage) {
      console.log('✅ Đã nhận được mã QR Code hình ảnh (Base64) thành công!');
      console.log(`   - ID Đơn hàng vừa tạo: ${res.orderId}`);
    } else {
      console.log('⚠️ Không đính kèm mã QR Code.');
    }
    console.log('--------------------------------------------------\n');

    // 4. Test logic Escalation (Khiếu nại / Lỗi)
    console.log('Bước 4: Gửi tin nhắn khiếu nại để kiểm tra cờ chuyển giao (Escalation)...');
    res = await postChat("Đơn hàng hôm trước bị lỗi rồi, cho tôi gặp người thật để khiếu nại!", sessionId);
    console.log('AI phản hồi:\n', res.reply);
    console.log('Cờ escalate nhận được:', res.escalate ? '🚨 TRUE (Chuyển tiếp thành công!)' : '❌ FALSE');
    console.log('--------------------------------------------------\n');

    console.log('🎉 TOÀN BỘ BƯỚC KIỂM THỬ CHAT AI AGENT ĐÃ HOÀN TẤT THÀNH CÔNG!');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình kiểm thử:', error.message);
  }
}

// Chạy test
runTests();
