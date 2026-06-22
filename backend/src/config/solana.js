const { Connection } = require('@solana/web3.js');

// Official Solana devnet — hỗ trợ tất cả method, không cần API key
// Rate limit: ~2 req/s — cần poll thưa (15s)
const RPC_ENDPOINTS = [
  'https://api.devnet.solana.com',
];

const DEVNET_RPC_URL = process.env.SOLANA_RPC_URL || RPC_ENDPOINTS[0];
const connection = new Connection(DEVNET_RPC_URL, 'confirmed');
console.log(`[Solana] Kết nối RPC: ${DEVNET_RPC_URL}`);

// Địa chỉ ví Mint của Token USDC trên mạng thử nghiệm Devnet
const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

module.exports = {
  connection,
  USDC_DEVNET_MINT,
};
