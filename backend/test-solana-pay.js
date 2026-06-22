const { pool } = require('./src/config/db');
const { createOrder } = require('./src/models/order.model');
const { createPaymentRequest, generateQRCode } = require('./src/services/solanaPay.service');
const fs = require('fs');
const path = require('path');
const { Keypair } = require('@solana/web3.js');
const http = require('http');

async function testSolanaPay() {
  console.log('=== KHỞI CHẠY KIỂM THỬ TÍCH HỢP SOLANA PAY & QR CODE ===\n');

  try {
    // 1. Sinh reference key ngẫu nhiên bằng Keypair
    const referenceKey = Keypair.generate().publicKey.toBase58();

    // 2. Tạo đơn hàng mẫu trong Database
    const mockOrder = await createOrder({
      reference: referenceKey,
      product_name: 'Solana Mobile Saga v2 (USDC Devnet)',
      amount: 0.1,
      seller_wallet: '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ',
      status: 'pending'
    });
    console.log('✅ Bước 1: Tạo đơn hàng mẫu thành công trong Database:');
    console.log(`   - ID Đơn hàng: ${mockOrder.id}`);
    console.log(`   - Solana Reference: ${mockOrder.reference}`);
    console.log(`   - Số tiền: ${mockOrder.amount} USDC`);

    // 3. Tạo Solana Pay Link
    const paymentUrl = createPaymentRequest(mockOrder);
    console.log('\n✅ Bước 2: Tạo Solana Pay Transaction Request URL thành công:');
    console.log(`   - URL: ${paymentUrl}`);

    // 4. Tạo QR code base64
    const qrCodeImage = await generateQRCode(paymentUrl);
    console.log('\n✅ Bước 3: Tạo QR Code dạng base64 (Data URI) thành công.');

    // 5. Lưu QR code thành file HTML để kiểm thử visual
    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Kiểm thử Solana Pay QR Code</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background-color: #0b0e14;
      color: #f0f2f5;
      margin: 0;
    }
    .card {
      background: #151b26;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 450px;
      border: 1px solid #243042;
    }
    h2 {
      color: #9945FF; /* Solana Purple */
      margin-top: 0;
      margin-bottom: 20px;
    }
    .qr-container {
      background: white;
      padding: 15px;
      border-radius: 12px;
      display: inline-block;
      margin-bottom: 20px;
    }
    img {
      display: block;
      width: 300px;
      height: 300px;
    }
    p {
      color: #8f9cae;
      font-size: 14px;
      line-height: 1.5;
    }
    .url-text {
      background: #1f2735;
      padding: 10px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 11px;
      word-break: break-all;
      color: #14F195; /* Solana Green */
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>Solana Pay QR Code (USDC)</h2>
    <div class="qr-container">
      <img src="${qrCodeImage}" alt="Solana Pay QR" />
    </div>
    <p><strong>Sản phẩm:</strong> ${mockOrder.product_name}</p>
    <p><strong>Số tiền:</strong> ${mockOrder.amount} USDC</p>
    <div class="url-text">${paymentUrl}</div>
    <p>💡 Hãy bật ví Solana di động của bạn (Phantom / Solflare), đổi sang mạng <strong>Devnet</strong>, quét mã QR trên để thực hiện giao dịch thử nghiệm.</p>
  </div>
</body>
</html>
    `;

    const htmlPath = path.join(__dirname, 'test-qr.html');
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`\n✅ Bước 4: Đã lưu file HTML hiển thị QR Code tại: ${htmlPath}`);
    console.log('\n🎉 Hãy mở file test-qr.html và quét mã QR để thanh toán.');

    // 6. Bắt đầu vòng lặp kiểm tra trạng thái đơn hàng từ Database (đã được paymentWatcher tự động xác thực)
    console.log('\n⏳ Đang lắng nghe thanh toán (Kiểm tra trạng thái mỗi 2 giây)...');
    
    const checkInterval = setInterval(async () => {
      const options = {
        hostname: 'localhost',
        port: process.env.PORT || 3000,
        path: `/orders/${mockOrder.id}`,
        method: 'GET'
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', async () => {
          try {
            // Xử lý khi phản hồi lỗi
            if (res.statusCode >= 400) {
              try {
                const errResult = JSON.parse(data);
                console.log(`\n⚠️ Lỗi từ server (status ${res.statusCode}):`, errResult.message || data);
              } catch (_) {
                console.log(`\n⚠️ Lỗi từ server (status ${res.statusCode}):`, data);
              }
              return;
            }

            const result = JSON.parse(data);
            if (result.success && result.data && result.data.status === 'paid') {
              console.log('\n\n🎉 [THÀNH CÔNG] ĐƠN HÀNG ĐÃ ĐƯỢC XÁC NHẬN THANH TOÁN TRÊN BLOCKCHAIN!');
              console.log(`   - ID Đơn hàng: ${result.data.id}`);
              console.log(`   - Chữ ký Giao dịch: ${result.data.tx_signature}`);
              console.log(`   - Trạng thái DB: ${result.data.status}`);
              
              clearInterval(checkInterval);
              await pool.end();
              process.exit(0);
            } else {
              process.stdout.write('.');
            }
          } catch (e) {
            console.error('\n❌ Lỗi parse dữ liệu từ server:', e.message);
          }
        });
      });

      req.on('error', (err) => {
        console.error('\n❌ Lỗi kết nối tới Server Backend (Hãy đảm bảo npm start đang chạy):', err.message);
      });

      req.end();
    }, 2000);

  } catch (error) {
    console.error('\n❌ Thử nghiệm thất bại. Lỗi xảy ra:', error.message);
    await pool.end();
  }
}

testSolanaPay();
