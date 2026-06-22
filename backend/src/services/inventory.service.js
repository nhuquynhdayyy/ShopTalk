const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE_PATH = path.join(__dirname, '../../data/products.json');

/**
 * Đọc toàn bộ danh sách sản phẩm từ file products.json
 * @returns {Array} Danh sách sản phẩm
 */
const getProducts = () => {
  try {
    if (!fs.existsSync(PRODUCTS_FILE_PATH)) {
      return [];
    }
    const rawData = fs.readFileSync(PRODUCTS_FILE_PATH, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Lỗi khi đọc file products.json:', error.message);
    return [];
  }
};

/**
 * Kiểm tra tồn kho của sản phẩm theo tên (tìm kiếm mờ, không phân biệt hoa thường)
 * @param {string} productName - Tên sản phẩm cần tìm kiếm
 * @returns {Object|null} Thông tin sản phẩm hoặc null nếu không tìm thấy
 */
const checkInventory = (productName) => {
  if (!productName) return null;
  
  const products = getProducts();
  let searchName = productName.toLowerCase().trim();
  
  // Loại bỏ các tiền tố danh mục chung trong tiếng Việt để việc tìm kiếm chính xác hơn
  const prefixes = ['điện thoại', 'máy tính', 'máy', 'áo thun', 'áo', 'quần', 'cái', 'chiếc', 'sản phẩm'];
  for (const prefix of prefixes) {
    if (searchName.startsWith(prefix)) {
      searchName = searchName.slice(prefix.length).trim();
      break; // Chỉ cắt một tiền tố phù hợp đầu tiên
    }
  }
  
  // Tìm kiếm tương đối tên sản phẩm
  const matchedProduct = products.find(p => {
    const pName = p.name.toLowerCase();
    return pName.includes(searchName) || searchName.includes(pName);
  });
  
  return matchedProduct || null;
};

module.exports = {
  getProducts,
  checkInventory
};
