import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import api from '../api';
import ConnectionIndicator from '../components/ConnectionIndicator';
import OffRampModal from '../components/OffRampModal';
import OrderCard from '../components/OrderCard';
import { useWebSocket } from '../hooks/useWebSocket';
import mockExchangeRates from '../mocks/mockExchangeRates';

const mockOrders = [
  {
    id: '6d55d8a8-303b-4c04-baa4-11de65f3f011',
    reference: '8TZdSznWn95R3FkbWQW7AZPnwpJS28C7rCZrKk2mock1',
    product_name: 'Tai nghe Bluetooth ShopTalk',
    amount: 32,
    seller_wallet: '7UjR2M7C2wZjd2nSkxQHZz5qEpm2T2F4t4T3pNzShop',
    status: 'paid',
    tx_signature: '5YxqMockPaidSignaturewD9fBUnXw9oA3GZt2dAeY7aL',
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString()
  },
  {
    id: '5c0b2c3a-6332-4d2c-8d71-29837f1af222',
    reference: '6yduhzHqGQy6kDKbVmqM2ck7Z7ZohJk7mock2',
    product_name: 'Áo thun ShopTalk Essential',
    amount: 18,
    seller_wallet: '7UjR2M7C2wZjd2nSkxQHZz5qEpm2T2F4t4T3pNzShop',
    status: 'pending',
    tx_signature: null,
    created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 9 * 60 * 1000).toISOString()
  },
  {
    id: '130d21fc-7397-4aca-8a20-88368b8cd333',
    reference: 'FUsVD1dYut8ykQhUGxQB8mWqAwmismatch3',
    product_name: 'Mũ ShopTalk Logo',
    amount: 12,
    seller_wallet: '7UjR2M7C2wZjd2nSkxQHZz5qEpm2T2F4t4T3pNzShop',
    status: 'payment_mismatch',
    tx_signature: '3QmMismatchMockSignatureZXa8UuT',
    created_at: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() - 33 * 60 * 1000).toISOString()
  },
  {
    id: '5bc1a558-4a94-4797-9a41-9326527c8444',
    reference: '9PcdExpiredReferenceZ5vPj1mock4',
    product_name: 'Sticker pack crypto',
    amount: 5,
    seller_wallet: '7UjR2M7C2wZjd2nSkxQHZz5qEpm2T2F4t4T3pNzShop',
    status: 'expired',
    tx_signature: null,
    created_at: new Date(Date.now() - 82 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() - 67 * 60 * 1000).toISOString()
  }
];

const sortOrders = (orders) => (
  [...orders].sort((a, b) => {
    if (a.status === 'paid' && b.status !== 'paid') return -1;
    if (a.status !== 'paid' && b.status === 'paid') return 1;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  })
);

const mergeOrder = (orders, incomingOrder) => {
  const existing = orders.find((order) => order.id === incomingOrder.id);
  const merged = { ...existing, ...incomingOrder };
  const rest = orders.filter((order) => order.id !== incomingOrder.id);

  if (merged.status === 'paid') {
    return [merged, ...rest];
  }

  return sortOrders([merged, ...rest]);
};

const normalizePaidOrder = (payload = {}) => {
  const order = payload.order || payload.data || payload;

  return {
    ...order,
    id: order.id || order.orderId || payload.orderId,
    product_name: order.product_name || order.productName || 'Don hang ShopTalk',
    amount: order.amount || 0,
    status: 'paid',
    tx_signature: order.tx_signature || order.txSignature || null,
    created_at: order.created_at || order.createdAt || payload.timestamp || new Date().toISOString(),
    expires_at: order.expires_at || order.expiresAt || null
  };
};

const formatTimestamp = (timestamp) => {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    }).format(new Date(timestamp));
  } catch (_) {
    return timestamp;
  }
};

function Dashboard() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState(sortOrders(mockOrders));
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isOffRampOpen, setIsOffRampOpen] = useState(false);
  const [dataMode, setDataMode] = useState('mock');
  const [isFetching, setIsFetching] = useState(false);
  const [paidAlert, setPaidAlert] = useState(null);
  const [escalations, setEscalations] = useState([]);
  const ordersRef = useRef(orders);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const playChime = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const context = new AudioContext();
      const gainNode = context.createGain();
      const firstTone = context.createOscillator();
      const secondTone = context.createOscillator();

      gainNode.gain.setValueAtTime(0.0001, context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);

      firstTone.frequency.setValueAtTime(880, context.currentTime);
      secondTone.frequency.setValueAtTime(1174.66, context.currentTime + 0.16);

      firstTone.connect(gainNode);
      secondTone.connect(gainNode);
      gainNode.connect(context.destination);

      firstTone.start(context.currentTime);
      firstTone.stop(context.currentTime + 0.18);
      secondTone.start(context.currentTime + 0.18);
      secondTone.stop(context.currentTime + 0.45);
      secondTone.onended = () => context.close();
    } catch (_) {
      // Browsers may block audio until the seller has interacted with the page.
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setIsFetching(true);

    try {
      const response = await api.getOrders();
      const nextOrders = Array.isArray(response.data) ? response.data : [];

      setOrders(sortOrders(nextOrders));
      setDataMode('live');
    } catch (_) {
      setOrders((current) => (current.length ? current : sortOrders(mockOrders)));
      setDataMode('mock');
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleOrderStatusUpdated = useCallback((updatedOrder) => {
    const previousOrder = ordersRef.current.find((order) => order.id === updatedOrder.id);
    const becamePaid = updatedOrder.status === 'paid' && previousOrder?.status !== 'paid';

    setOrders((current) => mergeOrder(current, updatedOrder));

    if (becamePaid) {
      playChime();
      setPaidAlert({
        id: updatedOrder.id,
        product_name: updatedOrder.product_name || previousOrder?.product_name || t('dashboard.alert.default_product', 'Đơn hàng'),
        amount: updatedOrder.amount || previousOrder?.amount || 0
      });
      window.setTimeout(() => setPaidAlert(null), 7000);
    }
  }, [playChime, t]);

  const handleOrderPaid = useCallback((payload) => {
    const paidOrder = normalizePaidOrder(payload);
    handleOrderStatusUpdated(paidOrder);
  }, [handleOrderStatusUpdated]);

  const handleEscalationRequest = useCallback((payload) => {
    const escalation = {
      id: payload.sessionId || `escalation-${Date.now()}`,
      sessionId: payload.sessionId,
      message: payload.message || t('dashboard.escalation.default_msg', 'Khách hàng cần nhân viên hỗ trợ.'),
      timestamp: payload.timestamp || new Date().toISOString(),
      accepted: false
    };

    setEscalations((current) => [
      escalation,
      ...current.filter((item) => item.id !== escalation.id)
    ]);
  }, [t]);

  const socketState = useWebSocket({
    order_status_updated: handleOrderStatusUpdated,
    order_paid: handleOrderPaid,
    escalation_request: handleEscalationRequest
  });

  const totals = useMemo(() => {
    const paidOrders = orders.filter((order) => order.status === 'paid');
    const pendingOrders = orders.filter((order) => order.status === 'pending');
    const attentionOrders = orders.filter((order) => order.status === 'payment_mismatch');

    return {
      paidAmount: paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
      paidCount: paidOrders.length,
      pendingCount: pendingOrders.length,
      attentionCount: attentionOrders.length
    };
  }, [orders]);

  const handleOpenOffRamp = (order) => {
    setSelectedOrder(order);
    setIsOffRampOpen(true);
  };

  const handleCompleteOffRamp = (order) => {
    if (!order?.id) return;

    setOrders((current) => current.map((item) => (
      item.id === order.id ? { ...item, offramped: true } : item
    )));
  };

  const handleAcceptEscalation = (id) => {
    setEscalations((current) => current.map((item) => (
      item.id === id ? { ...item, accepted: true } : item
    )));
  };

  return (
    <>
      <section className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">{t('dashboard.header.merchant', 'Merchant Dashboard')}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{t('dashboard.header.title', 'Đơn hàng ShopTalk')}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {t('dashboard.header.subtitle', 'Theo dõi thanh toán USDC, xử lý cảnh báo và rút tiền về ngân hàng trong cùng một màn hình.')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ConnectionIndicator {...socketState} />
            {dataMode === 'mock' && (
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                {t('dashboard.header.mock_data', 'Mock data')}
              </span>
            )}
            <button
              type="button"
              onClick={fetchOrders}
              disabled={isFetching}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400"
            >
              {isFetching ? t('dashboard.header.fetching', 'Đang tải...') : t('dashboard.header.refresh', 'Làm mới')}
            </button>
          </div>
        </header>

        <AnimatePresence>
          {paidAlert && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  {t('dashboard.alert.paid_prefix', 'Đơn')} <span className="font-semibold">{paidAlert.product_name}</span> {t('dashboard.alert.paid_suffix', 'đã thanh toán thành công:')}{' '}
                  <span className="font-semibold">+{Number(paidAlert.amount || 0).toFixed(2)} USDC</span>.
                </p>
                <button
                  type="button"
                  onClick={() => setPaidAlert(null)}
                  className="self-start rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 sm:self-auto"
                >
                  {t('dashboard.alert.close', 'Đóng')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {escalations.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-lg border border-amber-200 bg-amber-50 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-950">
                    {t('dashboard.escalation.title', 'Khách hàng cần nhân viên hỗ trợ')}
                  </p>
                  <p className="mt-1 text-sm text-amber-900">{item.message}</p>
                  <p className="mt-1 text-xs text-amber-700">
                    {t('dashboard.escalation.session', 'Session')} {item.sessionId || t('dashboard.escalation.unknown', 'không rõ')} · {formatTimestamp(item.timestamp)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAcceptEscalation(item.id)}
                  disabled={item.accepted}
                  className="h-10 rounded-lg bg-amber-900 px-4 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:bg-amber-200 disabled:text-amber-800"
                >
                  {item.accepted ? t('dashboard.escalation.accepted', 'Đã nhận') : t('dashboard.escalation.accept', 'Nhận')}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t('dashboard.stats.usdc', 'USDC đã nhận')}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{totals.paidAmount.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t('dashboard.stats.paid', 'Đơn đã thanh toán')}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{totals.paidCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t('dashboard.stats.pending', 'Đang chờ')}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{totals.pendingCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t('dashboard.stats.attention', 'Cần chú ý')}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{totals.attentionCount}</p>
          </div>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{t('dashboard.list.title', 'Danh sách đơn hàng')}</h2>
              <p className="text-sm text-slate-500">{t('dashboard.list.subtitle', 'Đơn vừa thanh toán sẽ tự nhảy lên đầu danh sách.')}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {orders.length} {t('dashboard.list.count_unit', 'đơn')}
            </span>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <h3 className="text-base font-semibold text-slate-950">{t('dashboard.empty.title', 'Chưa có đơn hàng')}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {t('dashboard.empty.subtitle', 'Khi khách chốt đơn từ Chat Widget, đơn sẽ xuất hiện tại đây.')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false} mode="popLayout">
                {orders.map((order) => (
                  <OrderCard key={order.id} order={order} onOfframp={handleOpenOffRamp} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </section>

      <OffRampModal
        isOpen={isOffRampOpen}
        order={selectedOrder}
        exchangeRates={mockExchangeRates}
        onClose={() => setIsOffRampOpen(false)}
        onComplete={handleCompleteOffRamp}
      />
    </>
  );
}

export { mockOrders };
export default Dashboard;