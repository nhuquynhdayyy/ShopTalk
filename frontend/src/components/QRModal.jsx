import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { localizeProductName } from '../utils/localizeProductName';

function QRModal({ isOpen, onClose, qrCodeImage, order }) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('vi') ? 'vi' : 'en';
  const displayProductName = localizeProductName(
    order?.canonical_product_name || order?.product_name,
    currentLang
  );
  const [copied, setCopied] = useState(false);

  const shorten = (value) => {
    if (!value) return t('components.qr_modal.no_wallet', 'Chưa có dữ liệu ví');
    return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
  };

  const handleCopyWallet = async () => {
    if (!order?.seller_wallet) return;

    try {
      await navigator.clipboard.writeText(order.seller_wallet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (_) {
      setCopied(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && qrCodeImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label={t('components.qr_modal.close_aria', 'Đóng modal QR')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          <motion.section
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                  Solana Pay
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{t('components.qr_modal.title', 'Quét mã để thanh toán')}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label={t('components.qr_modal.close_btn', 'Đóng')}
              >
                x
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mx-auto flex w-full max-w-[280px] items-center justify-center rounded-lg bg-white p-4 shadow-inner">
                <img
                  src={qrCodeImage}
                  alt={t('components.qr_modal.alt', 'Mã QR thanh toán Solana Pay')}
                  className="h-64 w-64 object-contain"
                />
              </div>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">{t('components.qr_modal.product', 'Sản phẩm')}</dt>
                <dd className="text-right font-semibold text-slate-950">
                  {displayProductName || t('components.qr_modal.default_product', 'Đơn hàng ShopTalk')}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">{t('components.qr_modal.amount', 'Số tiền')}</dt>
                <dd className="font-semibold text-teal-700">
                  {Number(order?.amount || 0).toFixed(2)} USDC
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">{t('components.qr_modal.order_id', 'Mã đơn')}</dt>
                <dd className="font-mono text-xs text-slate-700">{shorten(order?.id)}</dd>
              </div>
              {order?.customer_name && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">{t('components.qr_modal.customer', 'Khách hàng')}</dt>
                  <dd className="text-right font-semibold text-slate-950">{order.customer_name}</dd>
                </div>
              )}
              {order?.customer_phone && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">{t('components.qr_modal.phone', 'Số điện thoại')}</dt>
                  <dd className="text-right font-semibold text-slate-950">{order.customer_phone}</dd>
                </div>
              )}
              {order?.customer_address && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">{t('components.qr_modal.address', 'Địa chỉ')}</dt>
                  <dd className="text-right font-semibold text-slate-950">{order.customer_address}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">{t('components.qr_modal.wallet', 'Địa chỉ ví người bán')}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="truncate font-mono text-sm text-slate-800">
                  {shorten(order?.seller_wallet)}
                </span>
                <button
                  type="button"
                  onClick={handleCopyWallet}
                  disabled={!order?.seller_wallet}
                  className="h-9 shrink-0 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {copied ? t('components.qr_modal.copied', 'Đã copy') : t('components.qr_modal.copy_btn', 'Copy địa chỉ ví')}
                </button>
              </div>
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}

export default QRModal;