const ProductModel = require('../models/product.model');

// Fuse.js: thư viện tìm kiếm mờ (fuzzy search) - chịu sai chính tả, không phân biệt dấu
let Fuse;
try {
  Fuse = require('fuse.js');
} catch (e) {
  console.warn('[Inventory] ⚠️ fuse.js chưa được cài. Chạy: cd backend && npm install fuse.js');
  Fuse = null;
}

const normalizeLanguage = (language) => (
  typeof language === 'string' && language.toLowerCase().startsWith('en') ? 'en' : 'vi'
);

const parseTranslations = (product) => {
  if (!product || !product.translations) return null;
  if (typeof product.translations === 'string') {
    try {
      return JSON.parse(product.translations);
    } catch (_) {
      return null;
    }
  }
  return product.translations;
};

/**
 * Áp dụng bản dịch name/description theo ngôn ngữ, giữ canonical_name cho đơn hàng
 */
const applyProductTranslation = (product, language = 'vi') => {
  if (!product) return product;

  const lang = normalizeLanguage(language);
  const translations = parseTranslations(product);
  const canonicalName = product.name;
  const canonicalDescription = product.description;

  if (translations && translations[lang]) {
    return {
      ...product,
      canonical_name: canonicalName,
      name: translations[lang].name || canonicalName,
      description: translations[lang].description || canonicalDescription
    };
  }

  return {
    ...product,
    canonical_name: canonicalName,
    name: canonicalName,
    description: canonicalDescription
  };
};

/**
 * Đọc toàn bộ danh sách sản phẩm từ database
 * @param {string} [language='vi'] - Ngôn ngữ hiển thị name/description
 * @returns {Promise<Array>} Danh sách sản phẩm
 */
const getProducts = async (language = 'vi') => {
  try {
    const products = await ProductModel.findAll();
    return (products || []).map((p) => applyProductTranslation(p, language));
  } catch (error) {
    console.error('Lỗi khi đọc sản phẩm từ database:', error.message);
    return [];
  }
};

/**
 * Chuẩn hóa chuỗi: chuyển về chữ thường và bỏ dấu tiếng Việt
 */
const normalize = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
};

/** Tên demo / legacy không có trong DB — map sang EN cho EngMode */
const DEMO_PRODUCT_EN = {
  'Tai nghe Bluetooth ShopTalk': 'ShopTalk Bluetooth Headphones',
  'Áo thun ShopTalk Essential': 'ShopTalk Essential T-Shirt',
  'Mũ ShopTalk Logo': 'ShopTalk Logo Cap',
  'Sticker pack crypto': 'Crypto Sticker Pack',
  'Tai nghe TWS Blockchain Edition': 'TWS Blockchain Edition Earbuds',
  'Áo hoodie Crypto Dev': 'Crypto Dev Hoodie',
  'Mũ lưỡi trai ShopTalk': 'ShopTalk Baseball Cap',
  'Balo Laptop Crypto': 'Crypto Laptop Backpack',
  'Ốp lưng Saga Phone trong suốt': 'Saga Phone Clear Case',
  'Cáp sạc USB-C 1m': 'USB-C Cable 1m',
  'Sticker Pack Web3': 'Web3 Sticker Pack'
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
  'gia ca', 'giá cả',
  'all products', 'product list', 'catalog', 'what do you sell', 'what do you have',
  'product', 'products', 'items', 'everything', 'anything'
];

const isSummaryQuery = (text) => {
  if (!text) return false;
  const normText = normalize(text);
  return SUMMARY_KEYWORDS.some(keyword => normText.includes(normalize(keyword)));
};

const mapProductForResponse = (product, language) => {
  const translated = applyProductTranslation(product, language);
  return {
    found: true,
    ...translated,
    sku: product.sku,
    price_usdc: product.price_usdc,
    stock: product.stock
  };
};

/**
 * Kiểm tra tồn kho và tìm kiếm thông minh bằng fuse.js (hỗ trợ đa ngôn ngữ)
 */
const checkInventory = async (productName, language = 'vi') => {
  const lang = normalizeLanguage(language);
  const notFoundResult = {
    found: false,
    message: lang === 'en'
      ? `Product "${productName || 'this item'}" was not found in inventory.`
      : `Không tìm thấy sản phẩm "${productName || 'này'}" trong kho.`
  };

  if (!productName) return notFoundResult;

  if (isSummaryQuery(productName)) {
    const products = await getProducts(lang);
    return {
      found: true,
      is_summary: true,
      products: products.map(p => ({
        name: p.name,
        canonical_name: p.canonical_name || p.name,
        sku: p.sku,
        price_usdc: p.price_usdc,
        stock: p.stock,
        description: p.description
      })),
      message: lang === 'en'
        ? 'Here is the full store catalog for comparison or listing.'
        : 'Đây là danh sách tất cả sản phẩm trong cửa hàng để bạn tự so sánh, tìm giá đắt nhất/rẻ nhất hoặc liệt kê.'
    };
  }

  const rawProducts = await ProductModel.findAll();
  if (!rawProducts.length) return notFoundResult;

  const searchTerm = normalize(productName.trim());

  // Bước 1: Tìm chính xác trên cả tên gốc và bản dịch
  const exactMatch = rawProducts.find((p) => {
    const translated = applyProductTranslation(p, lang);
    const names = [
      p.name,
      translated.name,
      parseTranslations(p)?.en?.name,
      parseTranslations(p)?.vi?.name
    ].filter(Boolean);

    return names.some((name) => {
      const pNorm = normalize(name);
      return pNorm.includes(searchTerm) || searchTerm.includes(pNorm);
    });
  });

  if (exactMatch) {
    return mapProductForResponse(exactMatch, lang);
  }

  // Bước 2: Fuzzy search trên cả tên tiếng Việt và tiếng Anh
  if (Fuse) {
    const normalizedProducts = rawProducts.map((p) => {
      const translations = parseTranslations(p) || {};
      const enName = translations.en?.name || '';
      const enDesc = translations.en?.description || '';
      return {
        ...p,
        _normName: normalize(p.name),
        _normNameEn: normalize(enName),
        _normDesc: normalize(p.description || ''),
        _normDescEn: normalize(enDesc)
      };
    });

    const fuse = new Fuse(normalizedProducts, {
      keys: ['_normName', '_normNameEn', '_normDesc', '_normDescEn', 'name', 'sku'],
      threshold: 0.4,
      distance: 100,
      includeScore: true,
      minMatchCharLength: 2
    });

    const results = fuse.search(searchTerm);
    if (results.length > 0) {
      const match = results[0];
      const matchedNameNorm = normalize(match.item.name);
      const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 1);
      const hasWordMatch = searchWords.length === 0 || searchWords.some(word =>
        matchedNameNorm.includes(word) ||
        (match.item._normNameEn && match.item._normNameEn.includes(word))
      );

      if (hasWordMatch && match.score <= 0.4) {
        console.log(`[Inventory] 🔍 Fuzzy match: "${productName}" → "${match.item.name}" (score: ${match.score?.toFixed(3)})`);
        const { _normName, _normNameEn, _normDesc, _normDescEn, ...originalProduct } = match.item;
        return mapProductForResponse(originalProduct, lang);
      }
    }
  } else {
    const prefixes = ['dien thoai', 'ao thun', 'ao', 'mu', 'cap', 'san pham', 't-shirt', 'shirt', 'jeans', 'dress'];
    let trimmed = searchTerm;
    for (const prefix of prefixes) {
      if (trimmed.startsWith(prefix + ' ')) {
        trimmed = trimmed.slice(prefix.length).trim();
        break;
      }
    }
    const fallback = rawProducts.find((p) => {
      const translated = applyProductTranslation(p, lang);
      const names = [p.name, translated.name, parseTranslations(p)?.en?.name].filter(Boolean);
      return names.some((name) => {
        const pNorm = normalize(name);
        return pNorm.includes(trimmed) || trimmed.includes(pNorm);
      });
    });
    if (fallback) {
      return mapProductForResponse(fallback, lang);
    }
  }

  return notFoundResult;
};

/**
 * Format danh sách sản phẩm từ DB cho system prompt (text + voice)
 */
const formatProductCatalogForPrompt = async (language = 'vi') => {
  const lang = normalizeLanguage(language);
  try {
    const products = await getProducts(lang);
    if (!products || products.length === 0) {
      return lang === 'en' ? '  (No products in stock)' : '  (Không có sản phẩm trong kho)';
    }

    return products
      .map((p) => `  + ${p.name} (SKU: ${p.sku}): ${p.price_usdc} USDC, stock: ${p.stock}`)
      .join('\n');
  } catch (error) {
    console.error('[Inventory] Lỗi format catalog prompt:', error.message);
    return lang === 'en' ? '  (Error loading product catalog)' : '  (Lỗi tải danh sách sản phẩm)';
  }
};

/**
 * Resolve tên hiển thị theo ngôn ngữ từ tên canonical (VI) hoặc SKU lưu trong đơn hàng
 */
const resolveProductDisplayName = async (canonicalOrSearchName, language = 'vi') => {
  if (!canonicalOrSearchName) return canonicalOrSearchName;

  const lang = normalizeLanguage(language);
  const inventoryResult = await checkInventory(String(canonicalOrSearchName), lang);
  if (inventoryResult?.found && inventoryResult.name) {
    return inventoryResult.name;
  }

  const products = await ProductModel.findAll();
  const searchNorm = normalize(String(canonicalOrSearchName));
  const matched = products.find((product) => {
    const translated = applyProductTranslation(product, lang);
    const candidates = [
      product.name,
      translated.name,
      product.sku,
      parseTranslations(product)?.en?.name,
      parseTranslations(product)?.vi?.name
    ].filter(Boolean);

    return candidates.some((candidate) => {
      const candidateNorm = normalize(candidate);
      return candidateNorm === searchNorm
        || candidateNorm.includes(searchNorm)
        || searchNorm.includes(candidateNorm);
    });
  });

  if (matched) {
    return applyProductTranslation(matched, lang).name;
  }

  if (lang === 'en' && DEMO_PRODUCT_EN[canonicalOrSearchName]) {
    return DEMO_PRODUCT_EN[canonicalOrSearchName];
  }

  return canonicalOrSearchName;
};

/**
 * Dịch product_name trên order để hiển thị UI (DB vẫn giữ tên canonical VI)
 */
const translateOrderForLanguage = async (order, language = 'vi') => {
  if (!order) return order;

  const canonicalName = order.canonical_product_name || order.product_name;
  const displayName = await resolveProductDisplayName(canonicalName, language);

  return {
    ...order,
    product_name: displayName,
    canonical_product_name: canonicalName
  };
};

module.exports = {
  getProducts,
  checkInventory,
  normalize,
  normalizeLanguage,
  applyProductTranslation,
  formatProductCatalogForPrompt,
  resolveProductDisplayName,
  translateOrderForLanguage
};
