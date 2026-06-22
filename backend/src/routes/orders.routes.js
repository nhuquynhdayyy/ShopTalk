const express = require('express');
const router = express.Router();
const { Keypair } = require('@solana/web3.js');
const { createOrder, getOrderById, getAllOrders, updateOrderStatus } = require('../models/order.model');
const { verifyPayment } = require('../services/solanaPay.service');

/**
 * Route: GET /orders
 * Mô tả: Lấy toàn bộ danh sách đơn hàng từ database.
 * Trả về: 200 OK cùng danh sách đơn hàng.
 */
router.get('/', async (req, res) => {
  try {
    const orders = await getAllOrders();
    return res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Lỗi khi xử lý GET /orders:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi lấy danh sách đơn hàng'
    });
  }
});

/**
 * Route: POST /orders
 * Mô tả: Nhận thông tin và tạo đơn hàng mới, sinh mã reference Solana Pay ngẫu nhiên.
 * Body truyền vào: { product_name, amount, seller_wallet }
 * Trả về: 201 Created cùng thông tin đơn hàng vừa tạo, hoặc 400 Bad Request nếu thiếu dữ liệu.
 */
router.post('/', async (req, res) => {
  try {
    const { product_name, amount, seller_wallet } = req.body;

    // Kiểm tra dữ liệu đầu vào bắt buộc
    if (!product_name || amount === undefined || amount === null || !seller_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu các trường bắt buộc: product_name, amount, seller_wallet'
      });
    }

    // Sinh reference key ngẫu nhiên dùng thư viện @solana/web3.js
    const referenceKey = Keypair.generate().publicKey.toBase58();

    // Gọi hàm tạo order lưu xuống DB
    const newOrder = await createOrder({
      reference: referenceKey,
      product_name,
      amount,
      seller_wallet,
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo đơn hàng thành công',
      data: newOrder
    });
  } catch (error) {
    console.error('Lỗi khi xử lý POST /orders:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi tạo đơn hàng'
    });
  }
});

/**
 * Route: GET /orders/:id
 * Mô tả: Truy vấn và trả về chi tiết đơn hàng theo ID (UUID).
 * URL Params: id (UUID của đơn hàng)
 * Trả về: 200 OK cùng thông tin đơn hàng, hoặc 404 Not Found nếu không tồn tại.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Tìm kiếm đơn hàng theo ID
    const order = await getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: `Không tìm thấy đơn hàng với ID: ${id}`
      });
    }

    return res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error(`Lỗi khi xử lý GET /orders/${req.params.id}:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi tìm kiếm đơn hàng'
    });
  }
});

/**
 * Route: GET /orders/:id/check-payment
 * Mô tả: Thực hiện kiểm tra và xác thực giao dịch thanh toán Solana Pay trên blockchain.
 * Nếu hợp lệ, cập nhật trạng thái đơn hàng sang 'paid' và lưu lại chữ ký giao dịch.
 */
router.get('/:id/check-payment', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Tìm đơn hàng
    const order = await getOrderById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: `Không tìm thấy đơn hàng với ID: ${id}`
      });
    }

    // Nếu đơn hàng đã ở trạng thái paid, trả về thành công luôn
    if (order.status === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Đơn hàng đã được thanh toán thành công.',
        data: order
      });
    }

    // 2. Gọi service đối soát giao dịch thanh toán
    const verification = await verifyPayment(order.reference, order.amount, order.seller_wallet);

    if (!verification.success) {
      // Chưa có giao dịch hoặc RPC đang bị rate limit → 202 Accepted (tiếp tục chờ)
      if (verification.error === 'PAYMENT_NOT_FOUND' || verification.error === 'RATE_LIMITED') {
        return res.status(202).json({
          success: false,
          error: verification.error,
          message: verification.message
        });
      }
      // Lỗi xác thực thực sự → 400 Bad Request
      return res.status(400).json({
        success: false,
        error: verification.error,
        message: verification.message
      });
    }

    // 3. Đối soát thành công: Cập nhật cơ sở dữ liệu
    const updatedOrder = await updateOrderStatus(id, 'paid', verification.signature);

    return res.status(200).json({
      success: true,
      message: 'Xác nhận thanh toán đơn hàng thành công!',
      data: updatedOrder
    });

  } catch (error) {
    console.error(`Lỗi khi check-payment cho đơn hàng ${req.params.id}:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi xác thực thanh toán'
    });
  }
});

module.exports = router;

