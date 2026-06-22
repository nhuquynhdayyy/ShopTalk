const { encodeURL } = require('@solana/pay');
const { PublicKey } = require('@solana/web3.js');
const BigNumber = require('bignumber.js');
const QRCode = require('qrcode');
const { USDC_DEVNET_MINT } = require('../config/solana');

// Số decimals của USDC (chuẩn là 6)
const USDC_DECIMALS = 6;

// RPC endpoint dùng cho raw JSON-RPC calls
// api.devnet.solana.com hỗ trợ getSignaturesForAddress không cần API key
// nhưng có rate limit (~1-2 req/s) — cần poll thưa (15s interval)
const DEVNET_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/**
 * Helper: Gọi raw Solana JSON-RPC với tự động retry khi bị rate limit (429)
 */
const rpcCall = async (method, params, maxRetries = 3, baseDelayMs = 3000) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(DEVNET_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `req-${Date.now()}-${attempt}`,
        method,
        params,
      }),
    });

    const json = await resp.json();

    // Xử lý rate limit 429
    if (resp.status === 429 || (json.error && json.error.code === 429)) {
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`[RPC] 429 rate limit (${method}) - chờ ${delay}ms... (lần ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new Error(`RPC rate limit: ${JSON.stringify(json.error)}`);
    }

    if (json.error) {
      throw new Error(`RPC error (${method}): ${JSON.stringify(json.error)}`);
    }

    return json.result;
  }
};

/**
 * Tạo link thanh toán chuẩn Solana Pay (Transaction Request URL)
 * @param {Object} order - Thông tin đơn hàng lấy từ Database
 */
const createPaymentRequest = (order) => {
  try {
    const { reference, amount, seller_wallet, product_name } = order;

    const recipientPubKey = new PublicKey(seller_wallet);
    const referencePubKey = new PublicKey(reference);
    const splTokenPubKey = new PublicKey(USDC_DEVNET_MINT);
    const paymentAmount = new BigNumber(amount);

    const paymentUrl = encodeURL({
      recipient: recipientPubKey,
      amount: paymentAmount,
      splToken: splTokenPubKey,
      reference: referencePubKey,
      label: 'ShopTalk Store',
      message: `Thanh toán: ${product_name}`,
    });

    return paymentUrl.toString();
  } catch (error) {
    console.error('Lỗi khi sinh Solana Pay URL:', error.message);
    throw error;
  }
};

/**
 * Sinh mã QR Code dạng base64 (Data URI) từ liên kết thanh toán
 * @param {string} url - Solana Pay Payment URL
 */
const generateQRCode = async (url) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 350,
    });
    return qrDataUrl;
  } catch (error) {
    console.error('Lỗi khi sinh mã QR Code:', error.message);
    throw error;
  }
};

/**
 * Xác thực giao dịch thanh toán Solana Pay dùng raw JSON-RPC calls.
 * Không dùng @solana/web3.js Connection.get* API để tránh lỗi superstruct validation
 * với một số third-party RPC providers (Ankr, QuickNode, v.v.).
 *
 * Luồng:
 *  1. getSignaturesForAddress → tìm tx chứa reference key
 *  2. getTransaction (encoding jsonParsed) → lấy token balances
 *  3. So sánh preTokenBalances vs postTokenBalances của người nhận + USDC mint
 *
 * @param {string} reference - Reference public key (Base58)
 * @param {string|number} expectedAmount - Số USDC mong đợi (ví dụ: 0.1)
 * @param {string} expectedRecipient - Địa chỉ ví người nhận (seller_wallet)
 */
const verifyPayment = async (reference, expectedAmount, expectedRecipient) => {
  try {
    console.log(`[Verify] Đang tìm giao dịch với reference: ${reference}...`);

    // 1. Lấy danh sách signatures chứa reference key
    const signaturesResult = await rpcCall('getSignaturesForAddress', [
      reference,
      { limit: 5, commitment: 'confirmed' },
    ]);

    if (!signaturesResult || signaturesResult.length === 0) {
      return {
        success: false,
        error: 'PAYMENT_NOT_FOUND',
        message: 'Chưa tìm thấy giao dịch nào trên blockchain.',
      };
    }

    console.log(`[Verify] Tìm thấy ${signaturesResult.length} giao dịch, đang đối soát...`);

    // 2. Số tiền mong đợi tính theo đơn vị nhỏ nhất (USDC = 6 decimals)
    const expectedAmountRaw = new BigNumber(expectedAmount)
      .multipliedBy(new BigNumber(10).pow(USDC_DECIMALS))
      .integerValue();

    // 3. Duyệt từng giao dịch
    for (const sigInfo of signaturesResult) {
      if (sigInfo.err) continue; // Bỏ qua giao dịch thất bại

      // Lấy chi tiết giao dịch với encoding jsonParsed
      const tx = await rpcCall('getTransaction', [
        sigInfo.signature,
        {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        },
      ]);

      if (!tx || !tx.meta) continue;

      const preBalances = tx.meta.preTokenBalances || [];
      const postBalances = tx.meta.postTokenBalances || [];

      // 4. Tìm tài khoản token của người nhận với đúng USDC mint
      const recipientPost = postBalances.find(
        (b) => b.owner === expectedRecipient && b.mint === USDC_DEVNET_MINT
      );
      const recipientPre = preBalances.find(
        (b) => b.owner === expectedRecipient && b.mint === USDC_DEVNET_MINT
      );

      if (!recipientPost) {
        console.log(`[Verify] Sig ${sigInfo.signature.slice(0, 16)}... - không tìm thấy recipient trong tokenBalances`);
        continue;
      }

      // 5. Tính số tiền thực nhận được (đơn vị: lamports USDC = amount với 6 decimals)
      const postAmount = new BigNumber(recipientPost.uiTokenAmount.amount);
      const preAmount = recipientPre
        ? new BigNumber(recipientPre.uiTokenAmount.amount)
        : new BigNumber(0);
      const receivedAmount = postAmount.minus(preAmount);

      console.log(
        `[Verify] Sig: ${sigInfo.signature.slice(0, 20)}... | Nhận: ${receivedAmount} | Mong đợi: ${expectedAmountRaw}`
      );

      // 6. Kiểm tra số tiền
      if (receivedAmount.isGreaterThanOrEqualTo(expectedAmountRaw)) {
        console.log('[Verify] ✅ Giao dịch hợp lệ!');
        return { success: true, signature: sigInfo.signature };
      }
    }

    // Không tìm thấy giao dịch khớp
    return {
      success: false,
      error: 'PAYMENT_NOT_FOUND',
      message: 'Chưa tìm thấy giao dịch hợp lệ. Có thể chưa thanh toán hoặc số tiền không khớp.',
    };
  } catch (error) {
    // Phân biệt rate limit (429) với lỗi thực sự
    const isRateLimit = error.message && (
      error.message.includes('rate limit') ||
      error.message.includes('429') ||
      error.message.includes('Too Many Requests')
    );

    if (isRateLimit) {
      console.warn('[Verify] ⚠️ RPC rate limit (429) — paymentWatcher sẽ tăng backoff...');
      return {
        success: false,
        error: 'RATE_LIMITED',
        message: 'RPC rate limit, paymentWatcher sẽ tự động backoff.',
      };
    }

    console.error('[Verify] Lỗi đối soát giao dịch:', error.message);
    return {
      success: false,
      error: 'VALIDATION_FAILED',
      message: error.message,
    };
  }
};

module.exports = {
  createPaymentRequest,
  generateQRCode,
  verifyPayment,
};
