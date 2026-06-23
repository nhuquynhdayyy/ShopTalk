const assert = require('assert');
const { verifyPayment } = require('./src/services/verify.service');
const { USDC_DEVNET_MINT } = require('./src/config/solana');

const reference = 'Reference111111111111111111111111111111111';
const sellerWallet = 'SellerWallet111111111111111111111111111111';
const signature = 'tx-success-signature';

const calls = [];

const mockRpcCall = async (method, params) => {
  calls.push({ method, params });

  if (method === 'getSignaturesForAddress') {
    return [
      {
        signature,
        err: null,
        confirmationStatus: 'finalized',
      },
    ];
  }

  if (method === 'getTransaction') {
    return {
      meta: {
        err: null,
        preTokenBalances: [
          {
            owner: sellerWallet,
            mint: USDC_DEVNET_MINT,
            uiTokenAmount: { amount: '1000000' },
          },
        ],
        postTokenBalances: [
          {
            owner: sellerWallet,
            mint: USDC_DEVNET_MINT,
            uiTokenAmount: { amount: '1500000' },
          },
        ],
      },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: sellerWallet },
            { pubkey: reference },
          ],
        },
      },
    };
  }

  throw new Error(`Unexpected RPC method: ${method}`);
};

(async () => {
  const result = await verifyPayment(
    {
      id: 'order-1',
      reference,
      amount: 0.5,
      seller_wallet: sellerWallet,
    },
    undefined,
    undefined,
    { rpcCall: mockRpcCall }
  );

  assert.deepStrictEqual(result, {
    success: true,
    signature,
    receivedAmount: '0.5',
    orderId: 'order-1',
  });

  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].method, 'getSignaturesForAddress');
  assert.strictEqual(calls[1].method, 'getTransaction');

  console.log('PASS verify.service success case');
})();
