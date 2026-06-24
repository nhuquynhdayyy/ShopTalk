const BigNumber = require('bignumber.js');
const { USDC_DEVNET_MINT } = require('../config/solana');

const USDC_DECIMALS = 6;
const DEVNET_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

const rpcCall = async (method, params, maxRetries = 3, baseDelayMs = 3000) => {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(DEVNET_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `verify-${Date.now()}-${attempt}`,
          method,
          params,
        }),
      });

      const json = await response.json();

      if (response.status === 429 || (json.error && json.error.code === 429)) {
        throw { isRateLimit: true, error: json.error || { message: 'Too Many Requests' } };
      }

      if (json.error) {
        throw new Error(`RPC error (${method}): ${JSON.stringify(json.error)}`);
      }

      return json.result;
    } catch (error) {
      const isRateLimit = error && error.isRateLimit;

      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[RPC Retry] ${method} attempt ${attempt} failed. Retrying in ${delayMs}ms... Error:`, error.message || JSON.stringify(error));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (isRateLimit) {
        throw new Error(`RPC rate limit: ${JSON.stringify(error.error)}`);
      }
      throw error;
    }
  }

  return null;
};

const normalizeOrderInput = (orderOrReference, expectedAmount, expectedRecipient) => {
  if (typeof orderOrReference === 'object' && orderOrReference !== null) {
    return {
      reference: orderOrReference.reference,
      expectedAmount: orderOrReference.amount,
      expectedRecipient: orderOrReference.seller_wallet,
      orderId: orderOrReference.id,
    };
  }

  return {
    reference: orderOrReference,
    expectedAmount,
    expectedRecipient,
    orderId: null,
  };
};

const hasReferenceInTransaction = (tx, reference) => {
  const keys =
    tx?.transaction?.message?.instructions?.flatMap(ix => ix.accounts || ix.keys || []) || [];

  if (keys.some(k => (typeof k === 'string' ? k : k.pubkey) === reference)) {
    return true;
  }

  const accountKeys = tx?.transaction?.message?.accountKeys || [];
  return accountKeys.some(k =>
    (typeof k === 'string' ? k : k.pubkey) === reference
  );
};

const calculateReceivedRawAmount = (transaction, expectedRecipient) => {
  const preBalances = transaction?.meta?.preTokenBalances || [];
  const postBalances = transaction?.meta?.postTokenBalances || [];

  const recipientPost = postBalances.find(
    (balance) => balance.owner === expectedRecipient && balance.mint === USDC_DEVNET_MINT
  );
  const recipientPre = preBalances.find(
    (balance) => balance.owner === expectedRecipient && balance.mint === USDC_DEVNET_MINT
  );

  if (!recipientPost) {
    return null;
  }

  const postAmount = new BigNumber(recipientPost.uiTokenAmount.amount);
  const preAmount = recipientPre
    ? new BigNumber(recipientPre.uiTokenAmount.amount)
    : new BigNumber(0);

  return postAmount.minus(preAmount);
};

const toUsdcAmount = (rawAmount) => (
  new BigNumber(rawAmount).dividedBy(new BigNumber(10).pow(USDC_DECIMALS)).toString()
);

const buildFailure = (error, message, extra = {}) => ({
  success: false,
  error,
  message,
  ...extra,
});

/**
 * Verify a Solana Pay order using on-chain data only.
 *
 * Required checks:
 * 1. Transaction is finalized and has no chain error.
 * 2. Token mint is USDC devnet.
 * 3. Recipient owner is the seller wallet.
 * 4. Received amount is greater than or equal to expected amount.
 * 5. Transaction contains the order reference key.
 */
const verifyPayment = async (orderOrReference, expectedAmount, expectedRecipient, options = {}) => {
  const {
    reference,
    expectedAmount: amount,
    expectedRecipient: recipient,
    orderId,
  } = normalizeOrderInput(orderOrReference, expectedAmount, expectedRecipient);

  const callRpc = options.rpcCall || rpcCall;

  if (!reference || amount === undefined || amount === null || !recipient) {
    return buildFailure(
      'INVALID_VERIFY_INPUT',
      'Missing reference, expected amount, or seller wallet for payment verification.',
      { orderId }
    );
  }

  try {
    const signatures = await callRpc('getSignaturesForAddress', [
      reference,
      { limit: 10, commitment: 'finalized' },
    ]);

    if (!signatures || signatures.length === 0) {
      return buildFailure(
        'PAYMENT_NOT_FOUND',
        'No on-chain transaction found for this payment reference.',
        { orderId }
      );
    }

    const expectedRawAmount = new BigNumber(amount)
      .multipliedBy(new BigNumber(10).pow(USDC_DECIMALS))
      .integerValue(BigNumber.ROUND_FLOOR);

    let mismatchResult = null;

    for (const signatureInfo of signatures) {
      if (signatureInfo.err) continue;

      const confirmationStatus = signatureInfo.confirmationStatus || 'finalized';
      if (confirmationStatus !== 'finalized') {
        continue;
      }

      const transaction = await callRpc('getTransaction', [
        signatureInfo.signature,
        {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
          commitment: 'finalized',
        },
      ]);

      if (!transaction || !transaction.meta || transaction.meta.err) continue;

      if (!hasReferenceInTransaction(transaction, reference)) {
        continue;
      }

      const receivedRawAmount = calculateReceivedRawAmount(transaction, recipient);
      if (!receivedRawAmount || receivedRawAmount.isLessThanOrEqualTo(0)) {
        continue;
      }

      if (receivedRawAmount.isGreaterThanOrEqualTo(expectedRawAmount)) {
        return {
          success: true,
          signature: signatureInfo.signature,
          receivedAmount: toUsdcAmount(receivedRawAmount),
          orderId,
        };
      }

      mismatchResult = buildFailure(
        'PAYMENT_MISMATCH',
        'Transaction uses the correct reference but received less USDC than expected.',
        {
          signature: signatureInfo.signature,
          expectedAmount: new BigNumber(amount).toString(),
          receivedAmount: toUsdcAmount(receivedRawAmount),
          orderId,
        }
      );
    }

    return mismatchResult || buildFailure(
      'PAYMENT_NOT_FOUND',
      'No valid USDC payment matched the expected reference, wallet, and amount.',
      { orderId }
    );
  } catch (error) {
    const isRateLimit = error.message && (
      error.message.includes('rate limit') ||
      error.message.includes('429') ||
      error.message.includes('Too Many Requests')
    );

    if (isRateLimit) {
      return buildFailure(
        'RATE_LIMITED',
        'Solana RPC is rate limited; retry with watcher backoff.',
        { orderId }
      );
    }

    return buildFailure(
      'VALIDATION_FAILED',
      error.message,
      { orderId }
    );
  }
};

module.exports = {
  verifyPayment,
  rpcCall,
};
