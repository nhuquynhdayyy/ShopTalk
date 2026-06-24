import React from 'react';

const statusStyles = {
  pending: {
    label: 'Đang chờ',
    className: 'border-amber-300/40 bg-amber-100 text-amber-800'
  },
  paid: {
    label: 'Đã thanh toán',
    className: 'border-emerald-300/50 bg-emerald-100 text-emerald-800'
  },
  expired: {
    label: 'Hết hạn',
    className: 'border-slate-300 bg-slate-100 text-slate-600'
  },
  payment_mismatch: {
    label: 'Cần kiểm tra',
    className: 'border-rose-300/60 bg-rose-100 text-rose-800'
  }
};

function StatusBadge({ status }) {
  const config = statusStyles[status] || {
    label: status || 'Không rõ',
    className: 'border-slate-300 bg-slate-100 text-slate-700'
  };

  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

export default StatusBadge;
