const fs = require('fs');
const path = require('path');

// Fuse.js: thư viện tìm kiếm mờ (fuzzy search) - chịu sai chính tả, không phân biệt dấu
let Fuse;
try {
  Fuse = require('fuse.js');
} catch (e) {
  console.warn('[Inventory] ⚠️ fuse.js chưa được cài. Chạy: cd backend && npm install fuse.js');
  Fuse = null;
}

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

const SUMMARY_KEYWORDS = [
  'tat ca', 'tất cả',
  'danh sach', 'danh sách',
  'san pham', 'sản phẩm',
  'cua hang', 'cửa hàng',
  'co nhung gi', 'có những gì',
  'co gi', 'có gì',
  'dat nhat', 'đắt nhất',
  're nhat', 'rẻ nhất',
  'cao nhat', 'cao nhất',
  'thap nhat', 'thấp nhất',
  'mac nhat', 'mắc nhất',
  'gia ca', 'giá cả'
];

const isSummaryQuery = (text) => {
  if (!text) return false;
  const normText = normalize(text);
  return SUMMARY_KEYWORDS.some(keyword => normText.includes(normalize(keyword)));
};

/**
 * Kiểm tra tồn kho và tìm kiếm thông minh bằng fuse.js
 * - Không phân biệt hoa/thường
 * - Không phân biệt dấu (áo = ao, điện thoại = dien thoai)
 * - Gõ sai chính tả vẫn ra kết quả (ví dụ: "saga phon" → "Solana Mobile Saga Phone")
 * @param {string} productName - Tên sản phẩm cần tìm kiếm
 * @returns {Object|null} Thông tin sản phẩm hoặc null nếu không tìm thấy
 */
const checkInventory = (productName) => {
  const notFoundResult = {
    found: false,
    message: `Không tìm thấy sản phẩm "${productName || 'này'}" trong kho.`
  };

  if (!productName) return notFoundResult;

  // Nếu là câu hỏi tổng hợp / so sánh thông tin, trả về toàn bộ danh sách sản phẩm để AI tự so sánh/liệt kê
  if (isSummaryQuery(productName)) {
    const products = getProducts();
    return {
      found: true,
      is_summary: true,
      products: products.map(p => ({
        name: p.name,
        price_usdc: p.price_usdc,
        stock: p.stock,
        description: p.description
      })),
      message: "Đây là danh sách tất cả sản phẩm trong cửa hàng để bạn tự so sánh, tìm giá đắt nhất/rẻ nhất hoặc liệt kê."
    };
  }

  const products = getProducts();
  if (!products.length) return notFoundResult;

  const searchTerm = normalize(productName.trim());

  // ─── Bước 1: Tìm chính xác (bao gồm / được bao gồm) sau khi normalize ──────
  const exactMatch = products.find(p => {
    const pNorm = normalize(p.name);
    return pNorm.includes(searchTerm) || searchTerm.includes(pNorm);
  });
  if (exactMatch) {
    return { found: true, ...exactMatch };
  }

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
      threshold: 0.4,     // Cân bằng lại threshold để tránh khớp quá mờ
      distance: 100,
      includeScore: true,
      minMatchCharLength: 2
    });

    const results = fuse.search(searchTerm);
    if (results.length > 0) {
      const match = results[0];
      const matchedNameNorm = normalize(match.item.name);
      
      // Tách các từ khóa trong search term (lọc từ quá ngắn)
      const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 1);
      
      // Đảm bảo có ít nhất một từ khóa chính khớp với tên sản phẩm
      const hasWordMatch = searchWords.length === 0 || searchWords.some(word => matchedNameNorm.includes(word));

      if (hasWordMatch && match.score <= 0.4) {
        console.log(`[Inventory] 🔍 Fuzzy match hợp lệ: "${productName}" → "${match.item.name}" (score: ${match.score?.toFixed(3)})`);
        const { _normName, _normDesc, ...originalProduct } = match.item;
        return { found: true, ...originalProduct };
      } else {
        console.log(`[Inventory] ⚠️ Fuzzy match bị loại bỏ (không trùng từ khóa hoặc score cao): "${productName}" → "${match.item.name}" (score: ${match.score?.toFixed(3)})`);
      }
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
    if (fallback) {
      return { found: true, ...fallback };
    }
  }

  return notFoundResult;
};

module.exports = {
  getProducts,
  checkInventory,
  normalize
};

