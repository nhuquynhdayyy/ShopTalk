const { encodeURL } = require('@solana/pay');
const { PublicKey } = require('@solana/web3.js');
const BigNumber = require('bignumber.js');
const QRCode = require('qrcode');
const { USDC_DEVNET_MINT } = require('../config/solana');

/**
 * Tạo link thanh toán chuẩn Solana Pay (Transaction Request URL)
 * @param {Object} order - Thông tin đơn hàng lấy từ Database
 * @param {string} order.reference - Khóa tham chiếu duy nhất (Solana PublicKey dạng Base58)
 * @param {string|number} order.amount - Số lượng USDC cần thanh toán (ví dụ: 10.50)
 * @param {string} order.seller_wallet - Địa ví của người bán nhận tiền
 * @param {string} order.product_name - Tên sản phẩm thanh toán
 * @returns {string} Chuỗi liên kết thanh toán Solana Pay
 */
const createPaymentRequest = (order) => {
  try {
    const { reference, amount, seller_wallet, product_name } = order;

    const recipientPubKey = new PublicKey(seller_wallet);
    const referencePubKey = new PublicKey(reference);
    const splTokenPubKey = new PublicKey(USDC_DEVNET_MINT);
    
    // Đối với Solana Pay, số lượng tiền phải là một đối tượng BigNumber đại diện cho giá trị thực tế của token (không nhân với decimals)
    const paymentAmount = new BigNumber(amount);

    const paymentUrl = encodeURL({
      recipient: recipientPubKey,
      amount: paymentAmount,
      splToken: splTokenPubKey,
      reference: referencePubKey,
      label: 'ShopTalk Store', // Nhãn hiển thị trên ví người dùng
      message: `Thanh toán: ${product_name}`, // Tin nhắn chi tiết
    });

    return paymentUrl.toString();
  } catch (error) {
    console.error('Lỗi khi sinh Solana Pay URL:', error.message);
    throw error;
  }
};

/**
 * Sinh mã QR Code dạng base64 (Data URI) từ liên kết thanh toán
 * @param {string} url - Solana Pay Payment URL
 * @returns {Promise<string>} Chuỗi base64 của ảnh QR Code PNG
 */
const generateQRCode = async (url) => {
  try {
    // Chuyển URL thành mã QR dạng base64 có thể đưa trực tiếp vào thẻ img src
    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 350,
    });
    return qrDataUrl;
  } catch (error) {
    console.error('Lỗi khi sinh mã QR Code:', error.message);
    throw error;
  }
};

module.exports = {
  createPaymentRequest,
  generateQRCode,
};
