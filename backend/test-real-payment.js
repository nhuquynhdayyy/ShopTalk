require('dotenv').config();
const { Pool } = require('pg');
const { Keypair } = require('@solana/web3.js');
const QRCode = require('qrcode');
const { randomUUID } = require('crypto');

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const sellerWallet = process.env.SELLER_WALLET;
  if (!sellerWallet) {
    console.error('❌ Thiếu SELLER_WALLET trong .env');
    process.exit(1);
  }

  const amount = 1.0; // USDC test - đổi số tiền nếu muốn
  const referenceKeypair = Keypair.generate();
  const reference = referenceKeypair.publicKey.toBase58();
  const orderId = randomUUID();

  // 1. Insert order pending vào DB
  // ⚠️ Đổi tên cột / câu lệnh nếu order.model.js của bạn khác cấu trúc bảng `orders` đã chốt
  await pool.query(
    `INSERT INTO orders (id, reference, product_name, amount, seller_wallet, status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW() + INTERVAL '15 minutes')`,
    [orderId, reference, 'Test Real Payment', amount, sellerWallet]
  );

  console.log('✅ Đã tạo order pending:');
  console.log('   orderId   :', orderId);
  console.log('   reference :', reference);
  console.log('   amount    :', amount, 'USDC');
  console.log('   seller    :', sellerWallet);

  // 2. Build Solana Pay Transfer Request URL (theo chuẩn solana-pay spec)
  const params = new URLSearchParams({
    amount: amount.toString(),
    'spl-token': USDC_DEVNET_MINT,
    reference,
    label: 'ShopTalk Test',
    message: 'Thanh toan don test',
  });
  const url = `solana:${sellerWallet}?${params.toString()}`;

  console.log('\n🔗 Solana Pay URL:');
  console.log(url);

  // 3. Xuất QR code ra file PNG
  const qrPath = 'test-payment-qr.png';
  await QRCode.toFile(qrPath, url, { width: 400 });
  console.log(`\n📷 Đã lưu QR vào: ${qrPath}`);
  console.log('   → Mở file này, dùng Phantom MOBILE quét QR (đảm bảo Phantom mobile cũng đang ở Devnet mode).');

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});