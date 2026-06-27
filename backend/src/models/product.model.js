const db = require('../config/db');

class ProductModel {
  /**
   * Hàm chuyển đổi các trường dữ liệu kiểu JSONB từ database thành Object Javascript chuẩn
   * @param {Object} product - Dòng dữ liệu thô từ database
   * @returns {Object|null} Dòng dữ liệu đã xử lý các trường JSONB
   */
  static parseJSONBFields(product) {
    if (!product) return null;
    const jsonFields = ['size_options', 'color_options', 'selling_points', 'reviews', 'images', 'translations'];
    jsonFields.forEach(field => {
      if (product[field] !== undefined) {
        if (typeof product[field] === 'string') {
          try {
            product[field] = JSON.parse(product[field]);
          } catch (e) {
            product[field] = [];
          }
        } else if (product[field] === null) {
          product[field] = [];
        }
      }
    });
    return product;
  }

  /**
   * Lấy danh sách tất cả sản phẩm
   * @returns {Promise<Array>} Danh sách các sản phẩm dạng Object
   */
  static async findAll() {
    const queryText = 'SELECT * FROM products ORDER BY created_at DESC;';
    try {
      const res = await db.query(queryText);
      return res.rows.map(row => ProductModel.parseJSONBFields(row));
    } catch (error) {
      console.error('Lỗi trong ProductModel.findAll:', error.message);
      throw error;
    }
  }

  /**
   * Tìm sản phẩm theo SKU
   * @param {string} sku - Mã SKU của sản phẩm
   * @returns {Promise<Object|null>} Sản phẩm được tìm thấy dưới dạng Object hoặc null
   */
  static async findBySKU(sku) {
    const queryText = 'SELECT * FROM products WHERE sku = $1;';
    try {
      const res = await db.query(queryText, [sku]);
      return res.rows[0] ? ProductModel.parseJSONBFields(res.rows[0]) : null;
    } catch (error) {
      console.error(`Lỗi trong ProductModel.findBySKU với SKU ${sku}:`, error.message);
      throw error;
    }
  }

  /**
   * Cập nhật số lượng tồn kho của sản phẩm theo ID
   * @param {string} id - UUID của sản phẩm
   * @param {number} quantity - Số lượng tồn kho mới cần cập nhật
   * @returns {Promise<Object|null>} Sản phẩm đã cập nhật hoặc null nếu không tìm thấy
   */
  static async updateStock(id, quantity) {
    const queryText = `
      UPDATE products 
      SET stock = $2, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *;
    `;
    try {
      const res = await db.query(queryText, [id, quantity]);
      return res.rows[0] ? ProductModel.parseJSONBFields(res.rows[0]) : null;
    } catch (error) {
      console.error(`Lỗi trong ProductModel.updateStock với ID ${id}:`, error.message);
      throw error;
    }
  }

  /**
   * Tìm sản phẩm theo tên canonical hoặc SKU
   * @param {string} nameOrSku - Tên hoặc SKU sản phẩm
   * @returns {Promise<Object|null>} Sản phẩm được tìm thấy hoặc null
   */
  static async findByNameOrSku(nameOrSku) {
    if (!nameOrSku) return null;
    const queryText = 'SELECT * FROM products WHERE name = $1 OR sku = $2;';
    try {
      const res = await db.query(queryText, [nameOrSku, nameOrSku]);
      return res.rows[0] ? ProductModel.parseJSONBFields(res.rows[0]) : null;
    } catch (error) {
      console.error(`Lỗi trong ProductModel.findByNameOrSku với ${nameOrSku}:`, error.message);
      throw error;
    }
  }

  /**
   * Giảm tồn kho sản phẩm đi 1 lượng (không xuống dưới 0)
   * @param {string} id - UUID của sản phẩm
   * @param {number} amount - Số lượng giảm
   * @returns {Promise<Object|null>} Sản phẩm đã cập nhật hoặc null
   */
  static async decrementStock(id, amount = 1) {
    const queryText = `
      UPDATE products 
      SET stock = GREATEST(0, stock - $2), updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *;
    `;
    try {
      const res = await db.query(queryText, [id, amount]);
      return res.rows[0] ? ProductModel.parseJSONBFields(res.rows[0]) : null;
    } catch (error) {
      console.error(`Lỗi trong ProductModel.decrementStock với ID ${id}:`, error.message);
      throw error;
    }
  }

  /**
   * Tăng tồn kho sản phẩm thêm 1 lượng
   * @param {string} id - UUID của sản phẩm
   * @param {number} amount - Số lượng tăng
   * @returns {Promise<Object|null>} Sản phẩm đã cập nhật hoặc null
   */
  static async incrementStock(id, amount = 1) {
    const queryText = `
      UPDATE products 
      SET stock = stock + $2, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *;
    `;
    try {
      const res = await db.query(queryText, [id, amount]);
      return res.rows[0] ? ProductModel.parseJSONBFields(res.rows[0]) : null;
    } catch (error) {
      console.error(`Lỗi trong ProductModel.incrementStock với ID ${id}:`, error.message);
      throw error;
    }
  }
}

module.exports = ProductModel;
