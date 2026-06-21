const express = require('express');
const router = express.Router();
const { Keypair } = require('@solana/web3.js');
const { createOrder, getOrderById, getAllOrders } = require('../models/order.model');

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

module.exports = router;

