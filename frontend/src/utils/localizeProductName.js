/** Tên canonical (VI / DB) → tên hiển thị tiếng Anh */
const PRODUCT_EN_BY_VI = {
  // Mock / demo dashboard
  'Tai nghe Bluetooth ShopTalk': 'ShopTalk Bluetooth Headphones',
  'Áo thun ShopTalk Essential': 'ShopTalk Essential T-Shirt',
  'Mũ ShopTalk Logo': 'ShopTalk Logo Cap',
  'Sticker pack crypto': 'Crypto Sticker Pack',

  // Catalog products (products.json)
  'Áo Thun Basic Cotton Unisex': 'Basic Cotton Unisex T-Shirt',
  'Áo Thun Oversize Trendy': 'Oversize Trendy T-Shirt',
  'Áo Sơ Mi Oxford Công Sở Nam/Nữ': 'Oxford Office Shirt Unisex',
  'Áo Sơ Mi Linen Tay Dài Nữ': 'Women Long Sleeve Linen Shirt',
  'Quần Jeans Slim Fit Nam': 'Men Slim Fit Jeans',
  'Quần Jeans Ống Rộng Nữ': 'Women Wide-Leg Jeans',
  'Váy Midi Chữ A Công Sở': 'A-Line Office Midi Skirt',
  'Đầm Wrap Floral Dự Tiệc': 'Floral Wrap Party Dress',
  'Áo Khoác Dù Nhẹ Chống Gió': 'Lightweight Windbreaker Jacket',
  'Áo Hoodie Nỉ Bông Unisex': 'Unisex Fleece Hoodie',

  // Legacy chat demo products
  'Tai nghe TWS Blockchain Edition': 'TWS Blockchain Edition Earbuds',
  'Áo hoodie Crypto Dev': 'Crypto Dev Hoodie',
  'ShopTalk T-Shirt': 'ShopTalk T-Shirt',
  'Mũ lưỡi trai ShopTalk': 'ShopTalk Baseball Cap',
  'Balo Laptop Crypto': 'Crypto Laptop Backpack',
  'Ốp lưng Saga Phone trong suốt': 'Saga Phone Clear Case',
  'Cáp sạc USB-C 1m': 'USB-C Cable 1m',
  'Sticker Pack Web3': 'Web3 Sticker Pack',
  'Phantom Wallet Keychain': 'Phantom Wallet Keychain',
  'Ledger Nano S Plus': 'Ledger Nano S Plus'
};

const normalizeLang = (language) => (
  typeof language === 'string' && language.toLowerCase().startsWith('en') ? 'en' : 'vi'
);

export const localizeProductName = (name, language = 'vi') => {
  if (!name) return name;
  if (normalizeLang(language) === 'vi') return name;
  return PRODUCT_EN_BY_VI[name] || name;
};

export const localizeOrder = (order, language = 'vi') => {
  if (!order) return order;

  const canonical = order.canonical_product_name || order.product_name || order.productName;
  const localized = localizeProductName(canonical, language);

  return {
    ...order,
    canonical_product_name: canonical,
    product_name: localized
  };
};

export default localizeProductName;
