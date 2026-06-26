import React from 'react';
import { motion } from 'framer-motion';
import StatusBadge from './StatusBadge';

const formatDate = (dateString) => {
  if (!dateString) return 'Không rõ thời gian';

  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    }).format(new Date(dateString));
  } catch (_) {
    return dateString;
  }
};

const shorten = (value, head = 7, tail = 5) => {
  if (!value || value.length <= head + tail) return value || 'N/A';
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

function OrderCard({ order, onOfframp }) {
  const amount = Number(order.amount || 0);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:shadow-md"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            <span className="text-xs font-medium text-slate-500">{formatDate(order.created_at)}</span>
            {(order.offramped || order.isWithdrawn || order.is_withdrawn || order.offRampStatus === 'completed') && (
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                Đã rút VND
              </span>
            )}
          </div>

          <h3 className="truncate text-base font-semibold text-slate-950">
            {order.product_name || 'Đơn hàng ShopTalk'}
          </h3>

          <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
            <div>
              <span className="font-semibold text-slate-700">Mã đơn:</span>{' '}
              <span className="font-mono">{shorten(order.id)}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Reference:</span>{' '}
              <span className="font-mono">{shorten(order.reference)}</span>
            </div>
            <div className="md:col-span-2">
              <span className="font-semibold text-slate-700">Ví nhận:</span>{' '}
              <span className="font-mono">{shorten(order.seller_wallet, 8, 8)}</span>
            </div>
            {order.customer_name && (
              <div>
                <span className="font-semibold text-slate-700">Người nhận:</span>{' '}
                <span>{order.customer_name}</span>
              </div>
            )}
            {order.customer_phone && (
              <div>
                <span className="font-semibold text-slate-700">Điện thoại:</span>{' '}
                <span>{order.customer_phone}</span>
              </div>
            )}
            {order.customer_address && (
              <div className="md:col-span-2">
                <span className="font-semibold text-slate-700">Địa chỉ giao:</span>{' '}
                <span>{order.customer_address}</span>
              </div>
            )}
            {order.tx_signature && (
              <div className="md:col-span-2">
                <span className="font-semibold text-slate-700">Tx:</span>{' '}
                <a
                  href={`https://explorer.solana.com/tx/${order.tx_signature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-teal-700 underline-offset-2 hover:underline"
                >
                  {shorten(order.tx_signature, 12, 8)}
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 lg:min-w-[230px] lg:justify-end">
          <div className="text-left lg:text-right">
            <p className="text-xs font-medium text-slate-500">Số tiền</p>
            <p className="text-xl font-semibold text-slate-950">{amount.toFixed(2)} USDC</p>
          </div>

          {order.status === 'paid' && !(order.offramped || order.isWithdrawn || order.is_withdrawn || order.offRampStatus === 'completed') && (
            <button
              type="button"
              onClick={() => onOfframp(order)}
              className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700"
            >
              Rút VND
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

export default OrderCard;
