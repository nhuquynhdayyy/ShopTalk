const { Connection, clusterApiUrl } = require('@solana/web3.js');

// Khởi tạo kết nối tới Solana Devnet RPC
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Địa chỉ ví Mint của Token USDC trên mạng thử nghiệm Devnet
const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

module.exports = {
  connection,
  USDC_DEVNET_MINT,
};
