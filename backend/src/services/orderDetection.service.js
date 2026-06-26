const { getProducts, normalizeLanguage } = require('./inventory.service');

const BUY_INTENT_KEYWORDS = [
  'mua', 'đặt hàng', 'dat hang', 'chốt', 'chot', 'order', 'buy', 'purchase',
  'i want', "i'll take", 'will buy', "i'll buy", 'buy it', 'place order', 'dat mua'
];

const extractInlineCustomerInfo = (text) => {
  const result = { customerName: null, customerPhone: null, customerAddress: null };
  if (!text || typeof text !== 'string') return result;

  const namePatterns = [
    /(?:full name is|my name is|name is)\s+([^,\n.]+?)(?=\s*,|\s*phone|\s*address|$)/i,
    /(?:i am|i'm)\s+([A-Za-z\u00C0-\u024F\u1E00-\u1EFF][A-Za-z\u00C0-\u024F\u1E00-\u1EFF\s'-]{0,40}?)(?=\s*,|\s*phone|\s*address|$)/i,
    /(?:tên (?:là|em|mình|tôi|anh|chị)|họ và tên(?:\s+là)?)\s*[:：]?\s*([^,\n.]+)/i
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1].trim()) {
      result.customerName = match[1].trim();
      break;
    }
  }

  const phonePatterns = [
    /(?:phone number is|phone number|phone(?:\s+number)?(?:\s+is)?|contact number|số điện thoại(?:\s+là)?|so dien thoai|sdt|sđt)\s*[:：]?\s*(\+?\d[\d\s-]{5,})/i
  ];
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.customerPhone = match[1].replace(/\s/g, '').trim();
      break;
    }
  }

  const addressPatterns = [
    /(?:shipping address|delivery address|address|địa chỉ(?:\s+giao\s+hàng)?(?:\s+là)?)\s*[:：]\s*([^.\n]+)/i,
    /(?:address)\s+([A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF\s,.-]{2,})/i
  ];
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match && match[1].trim()) {
      result.customerAddress = match[1].trim();
      break;
    }
  }

  return result;
};

const mergeCustomerInfo = (target, source) => {
  if (!source) return target;
  if (!target.customerName && source.customerName) target.customerName = source.customerName;
  if (!target.customerPhone && source.customerPhone) target.customerPhone = source.customerPhone;
  if (!target.customerAddress && source.customerAddress) target.customerAddress = source.customerAddress;
  return target;
};

const detectBuyIntent = (allContent) => (
  BUY_INTENT_KEYWORDS.some((keyword) => allContent.includes(keyword))
);

const findProductInConversation = async (allContent, language) => {
  let productName = null;
  let amount = null;

  try {
    const products = await getProducts(language);
    for (const product of products) {
      const productNameLower = product.name.toLowerCase();
      const normalizedName = productNameLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const skuLower = (product.sku || '').toLowerCase();

      if (
        allContent.includes(productNameLower) ||
        allContent.includes(normalizedName) ||
        (skuLower && allContent.includes(skuLower))
      ) {
        productName = product.name;
        amount = parseFloat(product.price_usdc);
        break;
      }
    }

    if (!productName && products.length > 0) {
      productName = products[0].name;
      amount = parseFloat(products[0].price_usdc);
    }
  } catch (error) {
    console.error('[OrderDetection] Lỗi tìm sản phẩm:', error.message);
    productName = 'Solana Mobile Saga v2';
    amount = 0.1;
  }

  return { productName, amount };
};

/**
 * Phân tích hội thoại text/voice để trích xuất thông tin chốt đơn.
 * Dùng regex + inline slot filling, không phụ thuộc LLM tool call.
 */
const fallbackDetectOrder = async (messages, language = 'vi') => {
  const lang = normalizeLanguage(language);
  const plainMessages = (messages || []).filter((m) => m.role === 'user' || m.role === 'assistant');
  const allContent = plainMessages.map((m) => m.content || '').join(' ').toLowerCase();
  const hasBuyIntent = detectBuyIntent(allContent);

  let customerName = null;
  let customerPhone = null;
  let customerAddress = null;

  const customerInfo = { customerName: null, customerPhone: null, customerAddress: null };
  for (const message of plainMessages) {
    if (message.role !== 'user') continue;
    mergeCustomerInfo(customerInfo, extractInlineCustomerInfo(message.content));
  }
  customerName = customerInfo.customerName;
  customerPhone = customerInfo.customerPhone;
  customerAddress = customerInfo.customerAddress;

  for (let i = 0; i < plainMessages.length - 1; i++) {
    const current = plainMessages[i];
    const next = plainMessages[i + 1];
    if (current.role !== 'assistant' || next.role !== 'user') continue;

    const currentLower = (current.content || '').toLowerCase();
    const nextContent = next.content || '';
    let matched = false;

    if (
      currentLower.includes('tên người nhận') || currentLower.includes('cho em biết tên') ||
      currentLower.includes('xin tên') || currentLower.includes('họ và tên') ||
      currentLower.includes('your name') || currentLower.includes('full name') ||
      currentLower.includes('recipient name')
    ) {
      customerName = nextContent.replace(/tên (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').replace(/my name is/gi, '').replace(/i am/gi, '').trim();
      matched = true;
    }
    if (
      currentLower.includes('số điện thoại') || currentLower.includes('sđt') ||
      currentLower.includes('so dien thoai') || currentLower.includes('sdt') ||
      currentLower.includes('liên hệ') || currentLower.includes('phone number') ||
      currentLower.includes('phone') || currentLower.includes('contact number')
    ) {
      const phoneCleaned = nextContent.replace(/số điện thoại (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').replace(/my phone is/gi, '').trim();
      if (!matched || /\d+/.test(phoneCleaned)) {
        customerPhone = phoneCleaned.replace(/\s/g, '');
        matched = true;
      }
    }
    if (
      !matched && (
        currentLower.includes('địa chỉ') || currentLower.includes('cho em biết địa chỉ') ||
        currentLower.includes('xin địa chỉ') || currentLower.includes('giao hàng') ||
        currentLower.includes('shipping address') || currentLower.includes('delivery address') ||
        currentLower.includes('address')
      )
    ) {
      customerAddress = nextContent.replace(/địa chỉ (em|mình|tôi|anh|chị) là/gi, '').replace(/dạ/gi, '').replace(/my address is/gi, '').trim();
    }
  }

  const phoneRegex = /(?:phone number is|phone number|phone)\s*[:：]?\s*(\+?\d[\d\s-]{5,})|(\b0[3|5|7|8|9]+[0-9]{8}\b)|(?:^|\s)(\d{8,15})(?:\s|$)/i;
  const matchPhone = allContent.match(phoneRegex);
  if (matchPhone && !customerPhone) {
    customerPhone = (matchPhone[1] || matchPhone[2] || matchPhone[3] || '').replace(/\s/g, '');
  }

  const { productName, amount } = await findProductInConversation(allContent, lang);

  return {
    hasBuyIntent,
    hasName: Boolean(customerName),
    hasPhone: Boolean(customerPhone),
    hasAddress: Boolean(customerAddress),
    productName,
    amount,
    customerName,
    customerPhone,
    customerAddress
  };
};

const wantsQrResend = (userMessage) => {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const lower = userMessage.toLowerCase();
  const mentionsQr = lower.includes('qr') || lower.includes('mã qr') || lower.includes('ma qr');
  const wantsAgain = lower.includes('lại') || lower.includes('lai') || lower.includes('again') ||
    lower.includes('show') || lower.includes('gửi') || lower.includes('gui') ||
    lower.includes('xem') || lower.includes('resend') || lower.includes('repeat');
  return mentionsQr && wantsAgain;
};

module.exports = {
  fallbackDetectOrder,
  wantsQrResend,
  extractInlineCustomerInfo
};
