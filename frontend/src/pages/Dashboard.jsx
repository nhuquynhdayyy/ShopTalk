import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import api from '../api';
import ConnectionIndicator from '../components/ConnectionIndicator';
import OffRampModal from '../components/OffRampModal';
import OrderCard from '../components/OrderCard';
import { useWebSocket } from '../hooks/useWebSocket';
import mockExchangeRates from '../mocks/mockExchangeRates';
import { localizeOrder } from '../utils/localizeProductName';

const mockOrders = [
  {
    id: '6d55d8a8-303b-4c04-baa4-11de65f3f011',
    reference: '8TZdSznWn95R3FkbWQW7AZPnwpJS28C7rCZrKk2mock1',
    canonical_product_name: 'Tai nghe Bluetooth ShopTalk',
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
    canonical_product_name: 'Áo thun ShopTalk Essential',
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
    canonical_product_name: 'Mũ ShopTalk Logo',
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
    canonical_product_name: 'Sticker pack crypto',
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
    const dateA = new Date(a.created_at || a.createdAt || 0);
    const dateB = new Date(b.created_at || b.createdAt || 0);
    return dateB - dateA;
  })
);

const mergeOrder = (orders, incomingOrder) => {
  const existing = orders.find((order) => order.id === incomingOrder.id);
  const merged = { ...existing, ...incomingOrder };
  const rest = orders.filter((order) => order.id !== incomingOrder.id);

  return sortOrders([merged, ...rest]);
};

const normalizePaidOrder = (payload = {}, t) => {
  const order = payload.order || payload.data || payload;

  return {
    ...order,
    id: order.id || order.orderId || payload.orderId,
    product_name: order.product_name || order.productName || (t ? t('components.order.default_product', 'Đơn hàng ShopTalk') : 'Don hang ShopTalk'),
    amount: order.amount || 0,
    status: 'paid',
    tx_signature: order.tx_signature || order.txSignature || null,
    created_at: order.created_at || order.createdAt || payload.timestamp || new Date().toISOString(),
    expires_at: order.expires_at || order.expiresAt || null
  };
};

const normalizeOrderFlags = (order = {}) => ({
  ...order,
  isWithdrawn: Boolean(order.isWithdrawn || order.is_withdrawn || order.offramped || order.offRampStatus === 'completed'),
  offramped: Boolean(order.offramped || order.isWithdrawn || order.is_withdrawn || order.offRampStatus === 'completed')
});

const formatTimestamp = (timestamp, lng = 'vi-VN') => {
  try {
    const locale = lng?.startsWith('vi') ? 'vi-VN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
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
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('vi') ? 'vi' : 'en';
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isOffRampOpen, setIsOffRampOpen] = useState(false);
  const [dataMode, setDataMode] = useState('live');
  const [isFetching, setIsFetching] = useState(false);
  const [paidAlert, setPaidAlert] = useState(null);
  const [escalations, setEscalations] = useState([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState(null);
  const [chatMessagesBySession, setChatMessagesBySession] = useState(new Map());
  const [chatInputText, setChatInputText] = useState('');
  const chatScrollRef = useRef(null);
  const ordersRef = useRef(orders);
  const processedPaidAlertsRef = useRef(new Set());

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
      const response = await api.getOrders(currentLang);
      const nextOrders = Array.isArray(response.data) ? response.data.map(normalizeOrderFlags) : [];

      setOrders(sortOrders(nextOrders));
      setDataMode('live');
    } catch (error) {
      console.error('[Dashboard] Không thể tải đơn hàng:', error.message);
      setOrders([]);
      setDataMode('error');
    } finally {
      setIsFetching(false);
    }
  }, [currentLang]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleOrderStatusUpdated = useCallback((updatedOrder) => {
    const previousOrder = ordersRef.current.find((order) => order.id === updatedOrder.id);
    const becamePaid = updatedOrder.status === 'paid' && 
                       previousOrder?.status !== 'paid' && 
                       !processedPaidAlertsRef.current.has(updatedOrder.id);

    setOrders((current) => mergeOrder(current, updatedOrder));

    if (becamePaid) {
      processedPaidAlertsRef.current.add(updatedOrder.id);
      playChime();
      const localizedOrder = localizeOrder(updatedOrder, currentLang);
      setPaidAlert({
        id: updatedOrder.id,
        product_name: localizedOrder.product_name || previousOrder?.product_name || t('dashboard.alert.default_product', 'Đơn hàng'),
        amount: updatedOrder.amount || previousOrder?.amount || 0
      });
      window.setTimeout(() => setPaidAlert(null), 7000);
    }
  }, [playChime, t, currentLang]);

  const handleOrderPaid = useCallback((payload) => {
    const paidOrder = normalizePaidOrder(payload, t);
    handleOrderStatusUpdated(paidOrder);
  }, [handleOrderStatusUpdated, t]);

  const handleNewOrder = useCallback((newOrder) => {
    const nextOrder = normalizeOrderFlags(newOrder);
    setOrders((current) => {
      if (current.some((order) => order.id === nextOrder.id)) return current;
      return sortOrders([nextOrder, ...current]);
    });
  }, []);

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

  const handleLiveMessage = useCallback((payload = {}) => {
    console.log('[Dashboard] Nhận tin nhắn live chat từ khách:', payload);
    const sessionId = payload.sessionId;
    if (!sessionId) return;

    setChatMessagesBySession((current) => {
      const currentMsgs = current.get(sessionId) || [];
      if (payload.id && currentMsgs.some(m => m.id === payload.id)) return current;
      
      const newMsg = {
        id: payload.id || `live-${Date.now()}`,
        role: payload.sender === 'user' ? 'user' : 'assistant',
        content: payload.message,
        timestamp: payload.timestamp || new Date().toISOString()
      };
      
      const nextMap = new Map(current);
      nextMap.set(sessionId, [...currentMsgs, newMsg]);
      return nextMap;
    });
  }, []);

  const socketState = useWebSocket({
    order_status_updated: handleOrderStatusUpdated,
    order_paid: handleOrderPaid,
    new_order: handleNewOrder,
    escalation_request: handleEscalationRequest,
    live_message: handleLiveMessage
  });

  const socket = socketState.socket;

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessagesBySession, activeChatSessionId]);

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

  const displayOrders = useMemo(
    () => orders.map((order) => localizeOrder(order, currentLang)),
    [orders, currentLang]
  );

  const handleOpenOffRamp = (order) => {
    setSelectedOrder(order);
    setIsOffRampOpen(true);
  };

  const handleCompleteOffRamp = async (order) => {
    if (!order?.id) return;

    try {
      const response = await api.withdrawOrder(order.id);
      const updatedOrder = response?.data || response || order;
      const withdrawnOrder = normalizeOrderFlags({
        ...updatedOrder,
        id: updatedOrder.id || order.id,
        status: updatedOrder.status || order.status,
        isWithdrawn: true,
        offramped: true
      });
      handleOrderStatusUpdated(withdrawnOrder);
      await fetchOrders();
      return withdrawnOrder;
    } catch (error) {
      console.error('[Dashboard] Lỗi khi gọi API withdraw:', error.message);
      throw error;
    }
  };

  const handleAcceptEscalation = async (id) => {
    setEscalations((current) => current.map((item) => (
      item.id === id ? { ...item, accepted: true } : item
    )));

    const escalation = escalations.find(item => item.id === id);
    if (!escalation) return;

    const targetSessionId = escalation.sessionId;

    if (socket) {
      console.log('[Socket] Gửi accept_escalation cho session:', targetSessionId);
      socket.emit('accept_escalation', {
        sessionId: targetSessionId,
        staffName: t('dashboard.live_chat.merchant_name', 'Chủ shop')
      });
    }

    try {
      const response = await api.getChatHistory(targetSessionId);
      if (response && response.success && Array.isArray(response.history)) {
        const mappedHistory = response.history.map((msg, index) => ({
          id: `hist-${index}`,
          role: msg.role,
          content: msg.content,
          timestamp: new Date().toISOString()
        }));

        setChatMessagesBySession((current) => {
          const nextMap = new Map(current);
          nextMap.set(targetSessionId, mappedHistory);
          return nextMap;
        });
      }
    } catch (err) {
      console.error('[Dashboard] Không thể lấy lịch sử chat:', err.message);
    }

    setActiveChatSessionId(targetSessionId);
  };

  const handleSendChatMessage = (e) => {
    e?.preventDefault();
    const text = chatInputText.trim();
    if (!text || !activeChatSessionId) return;

    const messageId = `staff-${Date.now()}`;
    const newMsg = {
      id: messageId,
      role: 'assistant',
      sender: 'staff',
      content: text,
      timestamp: new Date().toISOString()
    };

    setChatMessagesBySession((current) => {
      const currentMsgs = current.get(activeChatSessionId) || [];
      const nextMap = new Map(current);
      nextMap.set(activeChatSessionId, [...currentMsgs, newMsg]);
      return nextMap;
    });

    setChatInputText('');

    if (socket) {
      socket.emit('agent_message', {
        sessionId: activeChatSessionId,
        message: text,
        sender: 'staff',
        id: messageId,
        timestamp: new Date().toISOString()
      });
    }
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
            {dataMode === 'error' && (
              <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                {t('dashboard.header.load_error', 'Không tải được dữ liệu')}
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
                    {t('dashboard.escalation.session', 'Session')} {item.sessionId || t('dashboard.escalation.unknown', 'không rõ')} · {formatTimestamp(item.timestamp, i18n.language)}
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
              {displayOrders.length} {t('dashboard.list.count_unit', 'đơn')}
            </span>
          </div>

          {displayOrders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <h3 className="text-base font-semibold text-slate-950">{t('dashboard.empty.title', 'Chưa có đơn hàng')}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {t('dashboard.empty.subtitle', 'Khi khách chốt đơn từ Chat Widget, đơn sẽ xuất hiện tại đây.')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false} mode="popLayout">
                {displayOrders.map((order) => (
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

      {/* Floating Chat Box cho Chủ shop */}
      {activeChatSessionId && (
        <div className="fixed bottom-6 right-6 z-50 flex h-96 w-80 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold">{t('dashboard.live_chat.title', 'Live Chat')}: {t('dashboard.live_chat.client', 'Client')} {activeChatSessionId.slice(0, 8)}...</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveChatSessionId(null)}
              className="text-slate-400 transition hover:text-white text-xs font-bold"
            >
              {t('dashboard.live_chat.close', 'Đóng')}
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 bg-slate-50">
            {(chatMessagesBySession.get(activeChatSessionId) || []).map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-5 shadow-sm ${
                      isUser
                        ? 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'
                        : 'rounded-br-sm bg-teal-600 text-white'
                    }`}
                  >
                    <p className="font-semibold text-[10px] text-slate-400 mb-0.5">
                      {isUser ? t('dashboard.live_chat.customer', 'Khách hàng') : t('dashboard.live_chat.merchant', 'Bạn (Chủ shop)')}
                    </p>
                    <span className="whitespace-pre-line">{msg.content}</span>
                  </div>
                </div>
              );
            })}
            <div ref={chatScrollRef} />
          </div>

          <form onSubmit={handleSendChatMessage} className="flex border-t border-slate-100 p-2.5 gap-2 bg-white">
            <input
              value={chatInputText}
              onChange={(e) => setChatInputText(e.target.value)}
              placeholder={t('dashboard.live_chat.placeholder', 'Nhập câu trả lời...')}
              className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-950 outline-none transition focus:border-teal-500"
            />
            <button
              type="submit"
              disabled={!chatInputText.trim()}
              className="rounded bg-teal-600 px-3 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400"
            >
              {t('dashboard.live_chat.send', 'Gửi')}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default Dashboard;
