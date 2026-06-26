require('dotenv').config();
const { generatePaymentQR } = require('./solanaPay');
const fs = require('fs');
const path = require('path');

// Sử dụng ví Solana public dummy nếu file .env chưa cấu hình địa chỉ ví thật
if (!process.env.MERCHANT_WALLET || process.env.MERCHANT_WALLET.length < 32 || process.env.MERCHANT_WALLET.includes('your_solana')) {
  process.env.MERCHANT_WALLET = 'HN7cAB1Scwqp36usMmgC5tZeg91GVRgx24CUXvcs6g7b'; // Ví test public HN7cAB1Scwqp36usMmgC5tZeg91GVRgx24CUXvcs6g7b
}

async function test() {
  try {
    console.log("--------------------------------------------------");
    console.log("🧪 ĐANG CHẠY TEST TẠO SOLANA PAY QR...");
    console.log(`Merchant Wallet: ${process.env.MERCHANT_WALLET}`);
    
    const amount = 0.5; // Test với 0.5 SOL
    const { url, qrBuffer } = await generatePaymentQR(amount);
    
    console.log(`\nURL Solana Pay được tạo:\n${url}`);
    
    // Lưu QR Buffer ra file ảnh png để trực tiếp kiểm tra
    const outputPath = path.join(__dirname, 'test-qr.png');
    fs.writeFileSync(outputPath, qrBuffer);
    
    console.log(`\n✅ Thành công! Đã lưu ảnh QR code tại: ${outputPath}`);
    console.log("--------------------------------------------------");
  } catch (err) {
    console.error("❌ Test thất bại với lỗi:", err);
  }
}

test();
