import React from 'react';
import { motion } from 'framer-motion';

function OrderCard({ order, onOfframp }) {
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'pending':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse';
      case 'expired':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      default:
        return 'bg-red-500/10 text-red-400 border-red-500/30';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'paid': return 'Đã thanh toán';
      case 'pending': return 'Đang chờ';
      case 'expired': return 'Đã hết hạn';
      default: return status;
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('vi-VN');
    } catch (_) {
      return dateString;
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="bg-[#151B26] border border-[#243042] rounded-xl p-5 hover:border-[#5B3FE0]/50 transition-all shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs text-gray-400">ID: {order.id.slice(0, 8)}...</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${getStatusBadgeClass(order.status)}`}>
            {getStatusLabel(order.status)}
          </span>
          <span className="text-xs text-[#8F9CAE]">{formatDate(order.created_at)}</span>
        </div>

        <h4 className="text-base font-semibold text-[#F0F2F5]">{order.product_name}</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-[#8F9CAE] font-mono">
          <div><span className="text-gray-500">Ví người bán:</span> {order.seller_wallet.slice(0, 6)}...{order.seller_wallet.slice(-6)}</div>
          <div><span className="text-gray-500">Reference:</span> {order.reference.slice(0, 8)}...</div>
          {order.tx_signature && (
            <div className="md:col-span-2 text-emerald-400/90 truncate">
              <span className="text-gray-500">Signature:</span> 
              <a 
                href={`https://explorer.solana.com/tx/${order.tx_signature}?cluster=devnet`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:underline ml-1"
              >
                {order.tx_signature.slice(0, 16)}...
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between md:justify-end gap-4 min-w-[150px]">
        <div className="text-right">
          <p className="text-gray-400 text-xs">Số tiền</p>
          <p className="text-lg font-bold text-[#14F195]">{order.amount} USDC</p>
        </div>

        {order.status === 'paid' && (
          <button
            onClick={() => onOfframp(order)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg transition-all shadow-md active:scale-95"
          >
            💸 Rút về VND
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default OrderCard;
