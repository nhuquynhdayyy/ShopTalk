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
  const { reference, product_name, amount, seller_wallet, status, expires_at, customer_name, customer_phone, customer_address, items_list } = orderData;
  
  // Sử dụng COALESCE trong PostgreSQL để tự động điền các giá trị mặc định nếu tham số truyền vào là null/undefined
  const queryText = `
    INSERT INTO orders (reference, product_name, amount, seller_wallet, status, expires_at, customer_name, customer_phone, customer_address, items_list)
    VALUES ($1, $2, $3, $4, COALESCE($5, 'pending'), COALESCE($6, CURRENT_TIMESTAMP + INTERVAL '15 minutes'), $7, $8, $9, $10)
    RETURNING *;
  `;
  
  const values = [
    reference,
    product_name,
    amount,
    seller_wallet,
    status || null,
    expires_at || null,
    customer_name || null,
    customer_phone || null,
    customer_address || null,
    items_list ? (typeof items_list === 'string' ? items_list : JSON.stringify(items_list)) : null
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
 * Lấy thông tin đơn hàng theo chữ ký giao dịch blockchain.
 * @param {string} txSignature - Chữ ký giao dịch Solana
 * @returns {Promise<Object|null>} Đơn hàng đã xử lý signature này hoặc null
 */
const getOrderByTxSignature = async (txSignature) => {
  if (!txSignature) return null;

  const queryText = 'SELECT * FROM orders WHERE tx_signature = $1;';

  try {
    const res = await db.query(queryText, [txSignature]);
    return res.rows[0] || null;
  } catch (error) {
    console.error(`Lỗi trong getOrderByTxSignature với signature ${txSignature}:`, error.message);
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
  if (txSignature) {
    const existingOrder = await getOrderByTxSignature(txSignature);
    if (existingOrder) {
      console.warn(`[Order] Bỏ qua cập nhật trùng tx_signature ${txSignature} cho đơn #${id}. Signature đã thuộc đơn #${existingOrder.id}`);
      return null;
    }
  }

  const queryText = `
    UPDATE orders 
    SET status = $2, tx_signature = COALESCE($3::varchar, tx_signature)
    WHERE id = $1
      AND status <> 'paid'
      AND (
        $2 <> 'paid'
        OR status IN ('pending', 'payment_mismatch', 'expired')
      )
      AND (
        $3::varchar IS NULL
        OR tx_signature IS NULL
        OR tx_signature = $3::varchar
      )
    RETURNING *;
  `;
  
  try {
    const res = await db.query(queryText, [id, status, txSignature]);
    const updatedOrder = res.rows[0] || null;
    if (updatedOrder) {
      try {
        const { getIo } = require('../websocket/socket.server');
        const io = getIo();
        if (io) {
          io.emit('order_status_updated', updatedOrder);
          console.log(`[Socket.io] 📢 Đã phát sự kiện 'order_status_updated' cho đơn hàng #${id}`);
        }
      } catch (wsErr) {
        console.error('[Socket.io] Lỗi khi phát sự kiện cập nhật trạng thái:', wsErr.message);
      }
    }
    return updatedOrder;
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

/**
 * Lấy danh sách các đơn hàng đang chờ thanh toán (status = 'pending') và chưa hết hạn
 * Dùng bởi paymentWatcher để tự động đối soát định kỳ
 * @returns {Promise<Array>} Danh sách đơn hàng pending chưa hết hạn
 */
const getPendingOrders = async () => {
  const queryText = `
    SELECT * FROM orders
    WHERE status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at ASC;
  `;

  try {
    const res = await db.query(queryText);
    return res.rows;
  } catch (error) {
    console.error('Lỗi trong getPendingOrders:', error.message);
    throw error;
  }
};

/**
 * Lấy danh sách đơn hàng pending đã quá hạn thanh toán.
 * @returns {Promise<Array>} Danh sách đơn pending có expires_at <= NOW()
 */
const getExpiredPendingOrders = async () => {
  const queryText = `
    SELECT * FROM orders
    WHERE status = 'pending'
      AND expires_at <= NOW()
    ORDER BY expires_at ASC;
  `;

  try {
    const res = await db.query(queryText);
    return res.rows;
  } catch (error) {
    console.error('Lỗi trong getExpiredPendingOrders:', error.message);
    throw error;
  }
};

/**
 * Láº¥y cÃ¡c Ä‘Æ¡n pending Ä‘Ã£ chá» tá»‘i thiá»ƒu N phÃºt vÃ  chÆ°a gá»­i nháº¯c thanh toÃ¡n.
 * @param {number} minutesWaiting - Sá»‘ phÃºt chá» trÆ°á»›c khi nháº¯c thanh toÃ¡n
 * @returns {Promise<Array>} Danh sÃ¡ch Ä‘Æ¡n cáº§n nháº¯c thanh toÃ¡n
 */
const getPaymentReminderCandidates = async (minutesWaiting = 5) => {
  const queryText = `
    SELECT * FROM orders
    WHERE status = 'pending'
      AND payment_reminded_at IS NULL
      AND created_at <= NOW() - ($1::int * INTERVAL '1 minute')
      AND expires_at > NOW()
    ORDER BY created_at ASC;
  `;

  try {
    const res = await db.query(queryText, [minutesWaiting]);
    return res.rows;
  } catch (error) {
    console.error('Lá»—i trong getPaymentReminderCandidates:', error.message);
    throw error;
  }
};

/**
 * ÄÃ¡nh dáº¥u Ä‘Æ¡n hÃ ng Ä‘Ã£ gá»­i nháº¯c thanh toÃ¡n.
 * @param {string} id - UUID cá»§a Ä‘Æ¡n hÃ ng
 * @returns {Promise<Object|null>} ÄÆ¡n hÃ ng Ä‘Ã£ cáº­p nháº­t hoáº·c null
 */
const markPaymentReminderSent = async (id) => {
  const queryText = `
    UPDATE orders
    SET payment_reminded_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND status = 'pending'
      AND payment_reminded_at IS NULL
    RETURNING *;
  `;

  try {
    const res = await db.query(queryText, [id]);
    return res.rows[0] || null;
  } catch (error) {
    console.error(`Lá»—i trong markPaymentReminderSent vá»›i ID ${id}:`, error.message);
    throw error;
  }
};

module.exports = {
  createOrder,
  getOrderById,
  getOrderByReference,
  getOrderByTxSignature,
  updateOrderStatus,
  getAllOrders,
  getPendingOrders,
  getExpiredPendingOrders,
  getPaymentReminderCandidates,
  markPaymentReminderSent,
};


