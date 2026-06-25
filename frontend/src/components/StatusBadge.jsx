import React from 'react';
import { useTranslation } from 'react-i18next';

function StatusBadge({ status }) {
  const { t } = useTranslation();

  const getStatusConfig = (s) => {
    switch(s) {
      case 'pending':
        return { label: t('components.status.pending', 'Đang chờ'), className: 'border-amber-300/40 bg-amber-100 text-amber-800' };
      case 'paid':
        return { label: t('components.status.paid', 'Đã thanh toán'), className: 'border-emerald-300/50 bg-emerald-100 text-emerald-800' };
      case 'expired':
        return { label: t('components.status.expired', 'Hết hạn'), className: 'border-slate-300 bg-slate-100 text-slate-600' };
      case 'payment_mismatch':
        return { label: t('components.status.mismatch', 'Cần kiểm tra'), className: 'border-rose-300/60 bg-rose-100 text-rose-800' };
      default:
        return { label: s || t('components.status.unknown', 'Không rõ'), className: 'border-slate-300 bg-slate-100 text-slate-700' };
    }
  };

  const config = getStatusConfig(status);

  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

export default StatusBadge;