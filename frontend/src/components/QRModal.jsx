import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { localizeProductName } from '../utils/localizeProductName';

function QRModal({ isOpen, onClose, qrCodeImage, order, onUpdateOrder }) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('vi') ? 'vi' : 'en';
  const displayProductName = localizeProductName(
    order?.canonical_product_name || order?.product_name,
    currentLang
  );
  const [copied, setCopied] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [editedAddress, setEditedAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (order) {
      setEditedName(order.customer_name || '');
      setEditedPhone(order.customer_phone || '');
      setEditedAddress(order.customer_address || '');
    }
  }, [order, isEditing]);

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

  const handleConfirmEdit = async (e) => {
    e.preventDefault();
    if (!editedName.trim() || !editedPhone.trim() || !editedAddress.trim()) {
      setErrorMsg(t('components.qr_modal.empty_fields_err', 'Vui lòng điền đầy đủ thông tin'));
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const apiModule = await import('../api');
      const response = await apiModule.default.updateOrderCustomerInfo(order.id, {
        customer_name: editedName.trim(),
        customer_phone: editedPhone.trim(),
        customer_address: editedAddress.trim()
      });

      if (response.success && response.data) {
        if (onUpdateOrder) {
          onUpdateOrder(response.data.order, response.data.qrCodeImage);
        }
        setToastMessage(t('components.qr_modal.info_updated', 'Cập nhật thông tin thành công!'));
        setIsEditing(false);
        window.setTimeout(() => setToastMessage(''), 4000);
      } else {
        setErrorMsg(response.error || 'Failed to update info');
      }
    } catch (err) {
      console.error('Lỗi khi cập nhật thông tin đơn hàng:', err);
      setErrorMsg(t('components.qr_modal.update_err', 'Lỗi hệ thống khi cập nhật thông tin'));
    } finally {
      setIsLoading(false);
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
            className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-2xl overflow-y-auto max-h-[90vh]"
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

            {toastMessage && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-center text-xs font-semibold text-emerald-800 animate-pulse">
                {toastMessage}
              </div>
            )}

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

              {!isEditing ? (
                <>
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
                  
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 transition"
                    >
                      ✏️ {t('components.qr_modal.edit_info', 'Chỉnh sửa thông tin')}
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleConfirmEdit} className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                  {errorMsg && (
                    <p className="text-xs text-rose-600 font-semibold">{errorMsg}</p>
                  )}
                  
                  <div className="space-y-1">
                    <label htmlFor="customer_name_input" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {t('components.qr_modal.customer', 'Khách hàng')}
                    </label>
                    <input
                      id="customer_name_input"
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-950 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="customer_phone_input" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {t('components.qr_modal.phone', 'Số điện thoại')}
                    </label>
                    <input
                      id="customer_phone_input"
                      type="text"
                      value={editedPhone}
                      onChange={(e) => setEditedPhone(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-950 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="customer_address_input" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {t('components.qr_modal.address', 'Địa chỉ')}
                    </label>
                    <textarea
                      id="customer_address_input"
                      value={editedAddress}
                      onChange={(e) => setEditedAddress(e.target.value)}
                      disabled={isLoading}
                      rows={2}
                      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-950 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 resize-none bg-white font-sans"
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setErrorMsg('');
                      }}
                      disabled={isLoading}
                      className="h-8 rounded bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
                    >
                      {t('components.qr_modal.cancel', 'Huỷ')}
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="h-8 rounded bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 transition disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {isLoading ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          {t('components.qr_modal.updating', 'Đang cập nhật...')}
                        </>
                      ) : (
                        t('components.qr_modal.confirm_regenerate', 'Xác nhận & Cập nhật QR')
                      )}
                    </button>
                  </div>
                </form>
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