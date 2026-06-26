const { encodeURL } = require('@solana/pay');
const { PublicKey } = require('@solana/web3.js');
const QRCode = require('qrcode');
const BigNumber = require('bignumber.js');

/**
 * Tạo Solana Pay URL và chuyển đổi nó thành QR Code dưới dạng Image Buffer (PNG)
 * 
 * @param {number|string} amount - Số tiền thanh toán (SOL hoặc USDC tùy cấu hình, mặc định tính theo SOL)
 * @returns {Promise<{ url: string, qrBuffer: Buffer }>} Trả về object chứa url chuỗi và QR code Buffer
 */
async function generatePaymentQR(amount) {
  try {
    const merchantWalletStr = process.env.MERCHANT_WALLET;
    if (!merchantWalletStr || merchantWalletStr.includes('your_solana_wallet_address_here')) {
      throw new Error("Chưa cấu hình địa chỉ ví MERCHANT_WALLET hợp lệ trong file .env");
    }

    // 1. Khởi tạo PublicKey từ ví người bán
    const recipient = new PublicKey(merchantWalletStr);

    // 2. Định dạng số tiền bằng BigNumber (yêu cầu từ @solana/pay)
    const solAmount = new BigNumber(amount);

    // 3. Các thông tin bổ sung cho giao dịch
    const label = 'ShopTalk Store';
    const message = `Thanh toan don hang ${amount} SOL`;
    const memo = `ST-${Date.now()}`; // Mã tham chiếu duy nhất

    // 4. Tạo Solana Pay URL chuẩn: solana:<wallet>?amount=<amount>&label=<label>&message=<message>
    const url = encodeURL({
      recipient,
      amount: solAmount,
      label,
      message,
      memo
    });

    console.log(`[Solana Pay] Đã tạo URL thanh toán: ${url.toString()}`);

    // 5. Generate QR code từ URL thành Image Buffer (PNG)
    const qrBuffer = await QRCode.toBuffer(url.toString(), {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',  // Màu của QR code
        light: '#FFFFFF'  // Màu nền
      }
    });

    return {
      url: url.toString(),
      qrBuffer
    };
  } catch (error) {
    console.error("Lỗi trong quá trình tạo Solana Pay QR:", error);
    throw error;
  }
}

module.exports = {
  generatePaymentQR
};
