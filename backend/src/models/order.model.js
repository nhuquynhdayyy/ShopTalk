const db = require('../config/db');

/**
 * Định nghĩa cấu trúc dữ liệu và các hàm CRUD cho bảng orders (Đơn hàng)
 */

/**
 * Tạo một đơn hàng mới trong cơ sở dữ liệu
 * @param {Object} orderData - Dữ liệu của đơn hàng
 * @param {string} orderData.reference - Public key dùng làm reference cho Solana Pay (Unique, Not Null)
 * @param {string} orderData.product_name - Tên sản phẩm
 * @param {number|string} orderData.amount - Số tiền USDC cần thanh toán
 * @param {string} orderData.seller_wallet - Địa chỉ ví của người bán
 * @param {string} [orderData.status] - Trạng thái đơn hàng (mặc định: 'pending')
 * @param {Date} [orderData.expires_at] - Thời gian hết hạn (mặc định: 15 phút sau khi tạo)
 * @returns {Promise<Object>} Đơn hàng vừa tạo
 */
const createOrder = async (orderData) => {
  const { reference, product_name, amount, seller_wallet, status, expires_at } = orderData;
  
  // Sử dụng COALESCE trong PostgreSQL để tự động điền các giá trị mặc định nếu tham số truyền vào là null/undefined
  const queryText = `
    INSERT INTO orders (reference, product_name, amount, seller_wallet, status, expires_at)
    VALUES ($1, $2, $3, $4, COALESCE($5, 'pending'), COALESCE($6, CURRENT_TIMESTAMP + INTERVAL '15 minutes'))
    RETURNING *;
  `;
  
  const values = [
    reference,
    product_name,
    amount,
    seller_wallet,
    status || null,
    expires_at || null
  ];

  try {
    const res = await db.query(queryText, values);
    return res.rows[0];
  } catch (error) {
    console.error('Lỗi trong createOrder:', error.message);
    throw error;
  }
};

/**
 * Lấy thông tin đơn hàng theo ID (UUID)
 * @param {string} id - UUID của đơn hàng
 * @returns {Promise<Object|null>} Đơn hàng được tìm thấy hoặc null nếu không tồn tại
 */
const getOrderById = async (id) => {
  const queryText = 'SELECT * FROM orders WHERE id = $1;';
  
  try {
    const res = await db.query(queryText, [id]);
    return res.rows[0] || null;
  } catch (error) {
    console.error(`Lỗi trong getOrderById với ID ${id}:`, error.message);
    throw error;
  }
};

/**
 * Lấy thông tin đơn hàng theo Solana Pay Reference (Public key)
 * @param {string} reference - Solana Pay Reference Key
 * @returns {Promise<Object|null>} Đơn hàng được tìm thấy hoặc null nếu không tồn tại
 */
const getOrderByReference = async (reference) => {
  const queryText = 'SELECT * FROM orders WHERE reference = $1;';
  
  try {
    const res = await db.query(queryText, [reference]);
    return res.rows[0] || null;
  } catch (error) {
    console.error(`Lỗi trong getOrderByReference với reference ${reference}:`, error.message);
    throw error;
  }
};

/**
 * Cập nhật trạng thái và chữ ký giao dịch của đơn hàng theo ID
 * @param {string} id - UUID của đơn hàng cần cập nhật
 * @param {string} status - Trạng thái mới ('pending', 'paid', 'expired', 'payment_mismatch')
 * @param {string|null} [txSignature=null] - Chữ ký giao dịch blockchain Solana
 * @returns {Promise<Object|null>} Đơn hàng đã cập nhật hoặc null nếu không tìm thấy đơn hàng
 */
const updateOrderStatus = async (id, status, txSignature = null) => {
  const queryText = `
    UPDATE orders 
    SET status = $2, tx_signature = COALESCE($3, tx_signature)
    WHERE id = $1
    RETURNING *;
  `;
  
  try {
    const res = await db.query(queryText, [id, status, txSignature]);
    return res.rows[0] || null;
  } catch (error) {
    console.error(`Lỗi trong updateOrderStatus với ID ${id}:`, error.message);
    throw error;
  }
};

/**
 * Lấy danh sách tất cả các đơn hàng trong hệ thống (Sắp xếp mới nhất lên đầu)
 * @returns {Promise<Array>} Danh sách tất cả các đơn hàng
 */
const getAllOrders = async () => {
  const queryText = 'SELECT * FROM orders ORDER BY created_at DESC;';
  
  try {
    const res = await db.query(queryText);
    return res.rows;
  } catch (error) {
    console.error('Lỗi trong getAllOrders:', error.message);
    throw error;
  }
};

module.exports = {
  createOrder,
  getOrderById,
  getOrderByReference,
  updateOrderStatus,
  getAllOrders
};

