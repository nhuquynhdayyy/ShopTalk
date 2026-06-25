import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

function PaidBadge({ order }) {
  const { t } = useTranslation();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <motion.div
          initial={{ scale: 0.86 }}
          animate={{ scale: [0.86, 1.06, 1] }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white"
        >
          OK
        </motion.div>
        <div>
          <p className="text-sm font-semibold text-emerald-950">{t('components.paid_badge.title', 'Da thanh toan')}</p>
          <p className="mt-1 text-sm text-emerald-800">
            {order?.product_name || t('components.paid_badge.default_product', 'Don hang ShopTalk')} {t('components.paid_badge.received', 'da nhan thanh toan')}
            {order?.amount ? ` ${Number(order.amount).toFixed(2)} USDC` : ''}.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default PaidBadge;