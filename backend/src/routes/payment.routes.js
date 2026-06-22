const express = require('express');
const router = express.Router();
const { getOrderById } = require('../models/order.model');
const { createPaymentRequest, generateQRCode } = require('../services/solanaPay.service');

/**
 * Route: GET /payment/qr/:orderId
 * Mô tả: Lấy thông tin đơn hàng, tạo link thanh toán Solana Pay và sinh ảnh QR Code.
 * Trả về: 200 OK gồm { paymentUrl, qrCodeImage }
 */
router.get('/qr/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1. Tìm đơn hàng trong cơ sở dữ liệu
    const order = await getOrderById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: `Không tìm thấy đơn hàng với ID: ${orderId}`,
      });
    }

    // 2. Tạo đường dẫn thanh toán Solana Pay
    const paymentUrl = createPaymentRequest(order);

    // 3. Chuyển đổi đường dẫn thành ảnh QR Code dạng base64
    const qrCodeImage = await generateQRCode(paymentUrl);

    return res.status(200).json({
      success: true,
      data: {
        paymentUrl,
        qrCodeImage,
      },
    });
  } catch (error) {
    console.error(`Lỗi khi tạo QR Code thanh toán cho đơn hàng ${req.params.orderId}:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi khởi tạo thanh toán',
    });
  }
});

module.exports = router;
