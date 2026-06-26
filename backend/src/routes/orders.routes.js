const express = require('express');
const router = express.Router();
const { Keypair } = require('@solana/web3.js');
const { createOrder, getOrderById, getAllOrders, updateOrderStatus } = require('../models/order.model');
const { verifyPayment } = require('../services/verify.service');

/**
 * Route: GET /orders
 * Mô tả: Lấy toàn bộ danh sách đơn hàng từ database.
 * Trả về: 200 OK cùng danh sách đơn hàng.
 */
router.get('/', async (req, res) => {
  try {
    const orders = await getAllOrders();
    const mappedOrders = orders.map(order => ({
      ...order,
      isWithdrawn: order.is_withdrawn || false
    }));
    return res.status(200).json({
      success: true,
      data: mappedOrders
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
    const { product_name, amount, seller_wallet, customer_name, customer_phone, customer_address } = req.body;

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
      status: 'pending',
      customer_name,
      customer_phone,
      customer_address
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
      data: {
        ...order,
        isWithdrawn: order.is_withdrawn || false
      }
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

    // 2. Gọi service đối soát giao dịch thanh toán (Hoặc giả lập nếu simulate=true)
    const isSimulation = req.query.simulate === 'true';
    let verification;
    if (isSimulation) {
      verification = {
        success: true,
        signature: 'simulated_tx_' + Math.random().toString(36).substring(2, 11)
      };
      console.log(`[Simulate] Đang giả lập thanh toán cho đơn hàng #${id}`);
    } else {
      verification = await verifyPayment(order.reference, order.amount, order.seller_wallet);
    }

    if (!verification.success) {
      if (verification.error === 'PAYMENT_MISMATCH') {
        const updatedOrder = await updateOrderStatus(id, 'payment_mismatch', verification.signature || null);
        return res.status(409).json({
          success: false,
          error: verification.error,
          message: verification.message,
          data: updatedOrder
        });
      }

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

/**
 * Route: PATCH /orders/:id/withdraw
 * Mô tả: Cập nhật trạng thái đơn hàng đã được rút tiền về ngân hàng (is_withdrawn = true).
 */
router.patch('/:id/withdraw', async (req, res) => {
  try {
    const { id } = req.params;
    const { updateOrderWithdrawalStatus } = require('../models/order.model');

    const updatedOrder = await updateOrderWithdrawalStatus(id, true);

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        error: `Không tìm thấy đơn hàng với ID: ${id}`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái rút tiền thành công!',
      data: updatedOrder
    });
  } catch (error) {
    console.error(`Lỗi khi PATCH /orders/${req.params.id}/withdraw:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi cập nhật trạng thái rút tiền'
    });
  }
});

module.exports = router;

