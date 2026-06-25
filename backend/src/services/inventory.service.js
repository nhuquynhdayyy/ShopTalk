const ProductModel = require('../models/product.model');

// Fuse.js: thư viện tìm kiếm mờ (fuzzy search) - chịu sai chính tả, không phân biệt dấu
let Fuse;
try {
  Fuse = require('fuse.js');
} catch (e) {
  console.warn('[Inventory] ⚠️ fuse.js chưa được cài. Chạy: cd backend && npm install fuse.js');
  Fuse = null;
}

/**
 * Đọc toàn bộ danh sách sản phẩm từ database
 * @returns {Promise<Array>} Danh sách sản phẩm
 */
const getProducts = async () => {
  try {
    const products = await ProductModel.findAll();
    return products || [];
  } catch (error) {
    console.error('Lỗi khi đọc sản phẩm từ database:', error.message);
    return [];
  }
};

/**
 * Chuẩn hóa chuỗi: chuyển về chữ thường và bỏ dấu tiếng Việt
 * Giúp tìm "ao do" ra được "Áo đỏ" và ngược lại
 * @param {string} str
 * @returns {string}
 */
const normalize = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // xóa dấu tổ hợp Unicode
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
};

/**
 * Kiểm tra tồn kho và tìm kiếm thông minh bằng fuse.js
 * - Không phân biệt hoa/thường
 * - Không phân biệt dấu (áo = ao, điện thoại = dien thoai)
 * - Gõ sai chính tả vẫn ra kết quả (ví dụ: "saga phon" → "Solana Mobile Saga Phone")
 * @param {string} productName - Tên sản phẩm cần tìm kiếm
 * @returns {Promise<Object|null>} Thông tin sản phẩm hoặc null nếu không tìm thấy
 */
const checkInventory = async (productName) => {
  if (!productName) return null;

  const products = await getProducts();
  if (!products.length) return null;

  const searchTerm = normalize(productName.trim());

  // ─── Bước 1: Tìm chính xác (bao gồm / được bao gồm) sau khi normalize ──────
  const exactMatch = products.find(p => {
    const pNorm = normalize(p.name);
    return pNorm.includes(searchTerm) || searchTerm.includes(pNorm);
  });
  if (exactMatch) return exactMatch;

  // ─── Bước 2: Fuzzy search bằng Fuse.js (nếu đã cài) ────────────────────────
  if (Fuse) {
    // Tạo bản sao normalized để fuse.js search trên text đã bỏ dấu
    const normalizedProducts = products.map(p => ({
      ...p,
      _normName: normalize(p.name),
      _normDesc: normalize(p.description || '')
    }));

    const fuse = new Fuse(normalizedProducts, {
      keys: ['_normName', '_normDesc', 'name'],
      threshold: 0.45,     // 0 = khớp tuyệt đối, 1 = khớp tất cả. 0.45 là cân bằng tốt
      distance: 100,
      includeScore: true,
      minMatchCharLength: 2
    });

    const results = fuse.search(searchTerm);
    if (results.length > 0) {
      console.log(`[Inventory] 🔍 Fuzzy match: "${productName}" → "${results[0].item.name}" (score: ${results[0].score?.toFixed(3)})`);
      // Trả về object gốc (không kèm _normName/_normDesc)
      const { _normName, _normDesc, ...originalProduct } = results[0].item;
      return originalProduct;
    }
  } else {
    // Fallback: tìm kiếm cơ bản nếu không có fuse.js
    const prefixes = ['dien thoai', 'ao thun', 'ao', 'mu', 'cap', 'san pham'];
    let trimmed = searchTerm;
    for (const prefix of prefixes) {
      if (trimmed.startsWith(prefix + ' ')) {
        trimmed = trimmed.slice(prefix.length).trim();
        break;
      }
    }
    const fallback = products.find(p => {
      const pNorm = normalize(p.name);
      return pNorm.includes(trimmed) || trimmed.includes(pNorm);
    });
    if (fallback) return fallback;
  }

  return null;
};

module.exports = {
  getProducts,
  checkInventory,
  normalize
};

