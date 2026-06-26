import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import api from '../api';
import PaidBadge from '../components/PaidBadge';
import QRModal from '../components/QRModal';
import TranscriptBubble from '../components/TranscriptBubble';
import VoiceCallUI from '../components/VoiceCallUI';
import { useAgoraVoice } from '../hooks/useAgoraVoice';
import { useWebSocket } from '../hooks/useWebSocket';

import { useCallStatus } from '../contexts/CallStatusContext';
import { localizeOrder } from '../utils/localizeProductName';

const suggestedPromptKeys = ['tshirt', 'headphones', 'owner'];

const getMockMessages = (t) => ([
  {
    id: 'mock-welcome',
    role: 'assistant',
    content: t('chat.welcome', 'Dạ, ShopTalk xin chào anh/chị! Em là Mia, nhân viên tư vấn thời trang của shop. Hôm nay anh chị đang tìm kiểu gì ạ — đi chơi, đi làm, hay mặc nhà?')
  }
]);

const mockOrderDetailsById = new Map();

const generateId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createMockQrImage = () => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260">
      <rect width="260" height="260" fill="white"/>
      <g fill="#111827">
        <rect x="20" y="20" width="58" height="58"/><rect x="31" y="31" width="36" height="36" fill="white"/><rect x="42" y="42" width="14" height="14"/>
        <rect x="182" y="20" width="58" height="58"/><rect x="193" y="31" width="36" height="36" fill="white"/><rect x="204" y="42" width="14" height="14"/>
        <rect x="20" y="182" width="58" height="58"/><rect x="31" y="193" width="36" height="36" fill="white"/><rect x="42" y="204" width="14" height="14"/>
        <rect x="104" y="28" width="16" height="16"/><rect x="136" y="28" width="16" height="16"/><rect x="104" y="60" width="48" height="16"/>
        <rect x="92" y="96" width="16" height="16"/><rect x="124" y="96" width="48" height="16"/><rect x="196" y="96" width="16" height="16"/>
        <rect x="84" y="124" width="32" height="16"/><rect x="148" y="124" width="16" height="16"/><rect x="180" y="124" width="48" height="16"/>
        <rect x="96" y="156" width="64" height="16"/><rect x="176" y="156" width="16" height="16"/><rect x="212" y="156" width="16" height="16"/>
        <rect x="96" y="188" width="16" height="16"/><rect x="128" y="188" width="48" height="16"/><rect x="208" y="188" width="20" height="20"/>
        <rect x="96" y="220" width="52" height="16"/><rect x="164" y="220" width="16" height="16"/><rect x="196" y="220" width="32" height="16"/>
      </g>
    </svg>
  `;

  return `data:image/svg+xml;base64,${window.btoa(svg)}`;
};

const buildMockChatResponse = (message, sessionId, t) => {
  const normalized = message.toLowerCase();
  const wantsHuman = ['gặp', 'nhân viên', 'người thật', 'chủ shop', 'khiếu nại', 'support'].some((keyword) => (
    normalized.includes(keyword)
  ));
  const wantsToBuy = ['mua', 'thanh toán', 'qr', 'chốt', 'đặt hàng', 'tai nghe'].some((keyword) => (
    normalized.includes(keyword)
  ));

  if (wantsHuman) {
    return {
      success: true,
      sessionId,
      reply: t('chat.mock.staff_handoff', 'Mình đã chuyển cuộc trò chuyện này cho nhân viên. Bạn giữ màn hình này mở, nhân viên sẽ tiếp nhận ngay.'),
      escalate: true,
      qrCodeImage: null,
      orderId: null
    };
  }

  if (wantsToBuy) {
    const orderId = generateId();
    const order = {
      id: orderId,
      reference: 'mock-solana-pay-reference',
      product_name: normalized.includes('tai nghe') ? 'Tai nghe Bluetooth ShopTalk' : 'Áo thun ShopTalk Essential',
      amount: normalized.includes('tai nghe') ? 32 : 18,
      seller_wallet: '7UjR2M7C2wZjd2nSkxQHZz5qEpm2T2F4t4T3pNzShop',
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };

    mockOrderDetailsById.set(orderId, order);

    return {
      success: true,
      sessionId,
      reply: t('chat.mock.order_created', 'Mình đã tạo đơn {{product}}. Tổng thanh toán là {{amount}} USDC. Bạn quét mã QR vừa mở để thanh toán qua ví Solana nhé.', { product: order.product_name, amount: order.amount }),
      escalate: false,
      qrCodeImage: createMockQrImage(),
      orderId
    };
  }

  return {
    success: true,
    sessionId,
    reply: t('chat.mock.suggestion', 'Mình gợi ý bắt đầu với áo thun ShopTalk Essential nếu bạn cần món dễ bán, hoặc tai nghe Bluetooth nếu khách của bạn thích phụ kiện công nghệ. Bạn muốn mình tạo đơn cho sản phẩm nào?'),
    escalate: false,
    qrCodeImage: null,
    orderId: null
  };
};

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-lg rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
      </div>
    </div>
  );
}

const parseMessageContent = (content, onShowQr, t) => {
  if (!content) return null;

  const regex = /<function=([^>]+)>([\s\S]*?)<\/function>/g;
  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      elements.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-line">
          {textBefore}
        </span>
      );
    }

    const funcName = match[1].trim();
    const funcArgsStr = match[2].trim();
    let args = {};
    try {
      args = JSON.parse(funcArgsStr);
    } catch (e) {
      args = { raw: funcArgsStr };
    }

    if (funcName === 'create_order' || funcName === 'generate_payment_qr') {
      const orderId = args.order_id || args.id;
      const orderAmount = args.amount || args.price_usdc;
      const productName = args.product_name || args.name || t('chat.qr.default_product', 'Sản phẩm');
      const qrCodeImage = args.qr_code || args.qrCodeImage;
      const sellerWallet = args.seller_wallet;

      elements.push(
        <div key={`func-${match.index}`} className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-800 text-[10px] font-bold">✓</span>
            <h4 className="text-xs font-semibold text-slate-900">{t('chat.qr.order_created_title', 'Đơn hàng được khởi tạo')}</h4>
          </div>

          <div className="mt-2.5 space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>{t('chat.qr.product_label', 'Sản phẩm:')}</span>
              <span className="font-semibold text-slate-800">{productName}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('chat.qr.amount_label', 'Số tiền:')}</span>
              <span className="font-semibold text-teal-700">{orderAmount} USDC (Devnet)</span>
            </div>
            {orderId && (
              <div className="flex justify-between">
                <span>{t('chat.qr.order_id_label', 'Mã đơn:')}</span>
                <span className="font-mono text-[10px] text-slate-500">{orderId.slice(0, 8)}...</span>
              </div>
            )}
          </div>

          {qrCodeImage && (
            <div className="mt-3 flex flex-col items-center justify-center rounded bg-white p-2 border border-slate-200">
              <img src={qrCodeImage} alt="QR Code Solana Pay" className="h-40 w-40 object-contain" />
              <p className="mt-1 text-[9px] text-slate-400">{t('chat.qr.scan_hint', 'Quét bằng ví Phantom/Solflare (Devnet)')}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {qrCodeImage && (
              <button
                type="button"
                onClick={() => onShowQr && onShowQr(qrCodeImage, {
                  id: orderId,
                  product_name: productName,
                  amount: orderAmount,
                  seller_wallet: sellerWallet,
                  customer_name: args.customer_name,
                  customer_phone: args.customer_phone,
                  customer_address: args.customer_address
                })}
                className="h-8 rounded bg-teal-600 px-3 text-xs font-semibold text-white transition hover:bg-teal-700"
              >
                {t('chat.qr.zoom_btn', 'Phóng to QR')}
              </button>
            )}
            {sellerWallet && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(sellerWallet);
                  alert(t('chat.qr.copied_alert', 'Đã copy địa chỉ ví người nhận!'));
                }}
                className="h-8 rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {t('chat.qr.copy_wallet_btn', 'Copy ví người bán')}
              </button>
            )}
          </div>
        </div>
      );
    } else if (funcName === 'check_inventory') {
      const productName = args.product_name;
      elements.push(
        <div key={`func-${match.index}`} className="my-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
          <span>{t('chat.qr.checking_inventory', 'Đang kiểm tra kho:')} <strong className="text-slate-800">{productName}</strong></span>
        </div>
      );
    }

    lastIndex = regex.lastIndex;
  }

  const textAfter = content.substring(lastIndex);
  if (textAfter) {
    elements.push(
      <span key={`text-${lastIndex}`} className="whitespace-pre-line">
        {textAfter}
      </span>
    );
  }

  return <div className="space-y-1">{elements}</div>;
};

function ChatBubble({ message, onShowQr, t }) {
  const isUser = message.role === 'user';
  const isStaff = message.sender === 'staff';

  if (message.type === 'voice') {
    return <TranscriptBubble message={message} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
    >
      {isStaff && (
        <span className="text-[10px] font-semibold text-amber-700 mb-1 ml-1">
          {t('chat.staff_label', 'Nhân viên hỗ trợ')}
        </span>
      )}
      <div
        className={`max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${isUser
          ? 'rounded-br-sm bg-teal-600 text-white'
          : isStaff
            ? 'rounded-bl-sm border border-amber-200 bg-amber-50 text-amber-950'
            : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'
          }`}
      >
        {isUser ? message.content : parseMessageContent(message.content, onShowQr, t)}
      </div>
    </motion.div>
  );
}

function StaffHandoff({ t }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-amber-200 bg-amber-50 p-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
          {t('chat.staff.avatar', 'NV')}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{t('chat.staff.title', 'Nhân viên đang hỗ trợ')}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('chat.staff.message', 'Chào bạn, mình đã nhận được yêu cầu. Bạn chờ trong giây lát để shop tiếp tục cuộc trò chuyện nhé.')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function ChatWidget() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('vi') ? 'vi' : 'en';
  const [messages, setMessages] = useState(() => getMockMessages(t));
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [isEscalated, setIsEscalated] = useState(false);
  const [isStaffConnected, setIsStaffConnected] = useState(false);

  const [language, setLanguage] = useState(currentLang);

  const [isMockMode, setIsMockMode] = useState(false);
  const [qrPayload, setQrPayload] = useState(null);
  const [paidReceipt, setPaidReceipt] = useState(null);
  const chatEndRef = useRef(null);

  const { isInCall, isMuted, connectionState, joinChannel, leaveChannel, toggleMute } = useAgoraVoice(sessionId);
  const { setIsInCall: setGlobalInCall, registerCallHandlers } = useCallStatus();

  useEffect(() => {
    setGlobalInCall(isInCall);
  }, [isInCall, setGlobalInCall]);

  useEffect(() => {
    registerCallHandlers({
      joinChannel: (lang) => joinChannel(lang || currentLang, sessionId),
      leaveChannel
    });
  }, [registerCallHandlers, joinChannel, leaveChannel, currentLang, sessionId]);

  useEffect(() => {
    setLanguage(currentLang);
    setMessages((current) => {
      if (current.length === 1 && current[0]?.id === 'mock-welcome') {
        return getMockMessages(t);
      }
      return current;
    });
    setQrPayload((current) => (
      current?.order ? { ...current, order: localizeOrder(current.order, currentLang) } : current
    ));
    setPaidReceipt((current) => (current ? localizeOrder(current, currentLang) : current));
  }, [currentLang, t]);

  const handleVoiceOrderCreated = useCallback((data) => {
    console.log('[Socket.io] Nhận sự kiện voice_order_created:', data);
    setPaidReceipt(null);
    setQrPayload({
      qrCodeImage: data.qrCodeImage,
      order: localizeOrder({
        id: data.orderId,
        product_name: data.productName,
        amount: data.amount,
        seller_wallet: data.sellerWallet || '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ',
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_address: data.customerAddress
      }, currentLang)
    });
  }, [currentLang]);

  const normalizePaidOrder = useCallback((payload = {}) => {
    const order = payload.order || payload.data || payload;

    return {
      ...order,
      id: order.id || order.orderId || payload.orderId || qrPayload?.order?.id,
      product_name: order.product_name || order.productName || qrPayload?.order?.product_name || 'Don hang ShopTalk',
      amount: order.amount || qrPayload?.order?.amount || 0,
      seller_wallet: order.seller_wallet || order.sellerWallet || qrPayload?.order?.seller_wallet,
      status: 'paid'
    };
  }, [qrPayload]);

  const handleTranscriptReceived = useCallback((payload = {}) => {
    const transcriptSessionId = payload.session_id || payload.sessionId;
    if (transcriptSessionId && sessionId && transcriptSessionId !== sessionId) return;

    const content = payload.transcript || payload.content || payload.text || payload.message;
    if (!content) return;

    const sender = payload.sender || payload.role || 'user';
    const messageId = payload.id || payload.messageId || generateId();

    setMessages((current) => {
      const existingIndex = current.findIndex((m) => m.id === messageId);
      if (existingIndex > -1) {
        const updated = [...current];
        updated[existingIndex] = {
          ...updated[existingIndex],
          content,
          timestamp: payload.timestamp || updated[existingIndex].timestamp
        };
        return updated;
      } else {
        return [
          ...current,
          {
            id: messageId,
            role: sender === 'user' ? 'user' : 'assistant',
            sender,
            type: 'voice',
            content,
            audio_url: payload.audio_url || payload.audioUrl || null,
            timestamp: payload.timestamp || new Date().toISOString()
          }
        ];
      }
    });
  }, [sessionId]);

  const handleOrderPaid = useCallback((payload = {}) => {
    const paidOrder = normalizePaidOrder(payload);
    const currentQrOrderId = qrPayload?.order?.id;

    if (!paidOrder.id || !currentQrOrderId || paidOrder.id === currentQrOrderId) {
      setQrPayload(null);
    }

    setPaidReceipt(paidOrder);
    setMessages((current) => [
      ...current,
      {
        id: `paid-${paidOrder.id || Date.now()}`,
        role: 'assistant',
        content: t('chat.system.paid_success', '{{product}} đã thanh toán thành công{{amountText}}.', {
          product: paidOrder.product_name || 'Đơn hàng ShopTalk',
          amountText: paidOrder.amount ? ` ${Number(paidOrder.amount).toFixed(2)} USDC` : ''
        })
      }
    ]);
  }, [normalizePaidOrder, qrPayload, t]);

  const handleStaffJoined = useCallback((payload = {}) => {
    console.log('[Socket] Nhân viên đã tham gia phòng:', payload);
    setIsStaffConnected(true);
  }, []);

  const handleAgentMessage = useCallback((payload = {}) => {
    console.log('[Socket] Nhận tin nhắn từ nhân viên:', payload);
    setIsStaffConnected(true); // Đảm bảo ẩn thông báo chờ ngay khi có tin nhắn từ agent_message
    const messageId = payload.id || generateId();
    setMessages((current) => {
      if (current.some(m => m.id === messageId)) return current;
      return [
        ...current,
        {
          id: messageId,
          role: 'assistant',
          sender: 'staff',
          content: payload.message,
          timestamp: payload.timestamp || new Date().toISOString()
        }
      ];
    });
  }, []);

  const socketState = useWebSocket({
    voice_order_created: handleVoiceOrderCreated,
    transcript_received: handleTranscriptReceived,
    order_paid: handleOrderPaid,
    staff_joined: handleStaffJoined,
    agent_message: handleAgentMessage
  });

  const socket = socketState.socket;

  // Emit join_session để socket client join vào room của sessionId
  useEffect(() => {
    if (sessionId && socket) {
      console.log('[Socket] Gửi join_session cho sessionId:', sessionId);
      socket.emit('join_session', { sessionId, role: 'client' });
    }
  }, [sessionId, socket]);

  useEffect(() => {
    let savedSessionId = sessionStorage.getItem('shoptalk_session_id');

    if (!savedSessionId) {
      savedSessionId = generateId();
      sessionStorage.setItem('shoptalk_session_id', savedSessionId);
    }

    setSessionId(savedSessionId);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping, isEscalated, paidReceipt]);

  const subtitle = useMemo(() => (
    isEscalated ? t('chat.header.subtitle_escalated', 'Đã chuyển sang nhân viên') : t('chat.header.subtitle_ready', 'AI Sales Agent đang sẵn sàng')
  ), [isEscalated, t]);

  const resolveOrderSummary = async (orderId) => {
    if (mockOrderDetailsById.has(orderId)) {
      return mockOrderDetailsById.get(orderId);
    }

    if (!orderId) return null;

    try {
      const response = await api.getOrderById(orderId, currentLang);
      const orderData = response.data || null;
      return orderData ? localizeOrder(orderData, currentLang) : null;
    } catch (_) {
      return {
        id: orderId,
        product_name: t('chat.qr.default_product', 'Đơn hàng ShopTalk'),
        amount: 0,
        seller_wallet: ''
      };
    }
  };

  const handleSend = async (event) => {
    event?.preventDefault();

    const text = inputValue.trim();
    if (!text || isTyping) return;
    if (isEscalated && !isStaffConnected) return;

    if (isEscalated && isStaffConnected) {
      setInputValue('');
      const messageId = generateId();
      setMessages((current) => [
        ...current,
        { id: messageId, role: 'user', content: text }
      ]);

      if (socket) {
        socket.emit('live_message', {
          sessionId,
          message: text,
          sender: 'user',
          id: messageId,
          timestamp: new Date().toISOString()
        });
      }
      return;
    }

    setInputValue('');
    setMessages((current) => [
      ...current,
      { id: generateId(), role: 'user', content: text }
    ]);
    setIsTyping(true);

    let response;
    try {
      try {
        response = await api.sendChatMessage(text, sessionId, currentLang);
        if (!response.success) {
          throw new Error(response.error || 'Chat API returned an unsuccessful response');
        }
        setIsMockMode(false);
      } catch (_) {
        response = buildMockChatResponse(text, sessionId || generateId(), t);
        setIsMockMode(true);
      }

      const nextSessionId = response.sessionId || sessionId;
      if (nextSessionId) {
        setSessionId(nextSessionId);
        sessionStorage.setItem('shoptalk_session_id', nextSessionId);
      }

      setMessages((current) => [
        ...current,
        {
          id: generateId(),
          role: 'assistant',
          content: response.reply,
          orderId: response.orderId,
          qrCodeImage: response.qrCodeImage
        }
      ]);

      if (response.escalate) {
        setIsEscalated(true);
      }

      if (response.qrCodeImage) {
        const order = await resolveOrderSummary(response.orderId);
        setPaidReceipt(null);
        setQrPayload({ qrCodeImage: response.qrCodeImage, order });
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handlePromptClick = (promptKey) => {
    setInputValue(t(`chat.prompts.${promptKey}`, promptKey));
  };

  const handleReset = async () => {
    leaveChannel();
    const previousSessionId = sessionId;
    const nextSessionId = generateId();
    sessionStorage.setItem('shoptalk_session_id', nextSessionId);
    setSessionId(nextSessionId);
    setMessages(getMockMessages(t));
    setIsEscalated(false);
    setIsStaffConnected(false);
    setQrPayload(null);
    setPaidReceipt(null);
    setInputValue('');

    if (previousSessionId) {
      try {
        await api.http.post('/api/ai/reset-session', { sessionId: previousSessionId });
      } catch (_) { /* best-effort */ }
    }
  };

  return (
    <>
      <section className="mx-auto flex h-[calc(100vh-128px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-xl">
        <header className="border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-600 text-sm font-semibold text-white">
                ST
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-950">{t('chat.header.title', 'ShopTalk Chat')}</h1>
                <p className="text-sm text-slate-500">{subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isMockMode && (
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  {t('chat.header.mock_data', 'Mock data')}
                </span>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {t('chat.header.refresh', 'Làm mới')}
              </button>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {(isInCall || connectionState === 'CONNECTING') && (
            <VoiceCallUI
              status={connectionState}
              isInCall={isInCall}
              isMuted={isMuted}
              sessionId={sessionId}
              language={language}
              onStartCall={() => joinChannel(currentLang, sessionId)}
              onEndCall={leaveChannel}
              onToggleMute={toggleMute}
            />
          )}
        </AnimatePresence>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                t={t}
                onShowQr={(qrCodeImage, order) => setQrPayload({ qrCodeImage, order })}
              />
            ))}
            {paidReceipt && <PaidBadge key={`receipt-${paidReceipt.id || 'latest'}`} order={paidReceipt} />}
          </AnimatePresence>

          {isTyping && <TypingIndicator />}
          {isEscalated && !isStaffConnected && <StaffHandoff t={t} />}
          <div ref={chatEndRef} />
        </div>

        {(!isEscalated || isStaffConnected) && (
          <div className="border-t border-slate-200 bg-white p-4">
            {qrPayload && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-teal-50 border border-teal-100 px-4 py-2.5 text-teal-800 text-xs font-medium animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal-500 animate-ping" />
                  <span>{t('chat.input.waiting_payment', 'AI đang đợi bạn thanh toán đơn hàng "{{product}}"...', { product: qrPayload.order?.product_name || t('chat.qr.default_product', 'Sản phẩm') })}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setQrPayload(null)}
                  className="text-teal-600 hover:text-teal-800 font-semibold transition"
                >
                  {t('chat.input.close_qr', 'Đóng QR')}
                </button>
              </div>
            )}
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {suggestedPromptKeys.map((promptKey) => (
                <button
                  key={promptKey}
                  type="button"
                  onClick={() => handlePromptClick(promptKey)}
                  className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-700"
                >
                  {t(`chat.prompts.${promptKey}`, promptKey)}
                </button>
              ))}
            </div>

            <form onSubmit={handleSend} className="flex gap-2">
              <input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={t('chat.input.placeholder', 'Nhập câu hỏi hoặc yêu cầu mua hàng...')}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              />

              <button
                type="button"
                title={isInCall ? (isMuted ? t('chat.input.unmute', 'Bỏ tắt mic') : t('chat.input.mute', 'Tắt mic')) : t('chat.input.call_ai', 'Gọi thoại AI')}
                onClick={isInCall ? toggleMute : () => joinChannel(currentLang, sessionId)}
                disabled={connectionState === 'CONNECTING'}
                className={[
                  'h-11 w-11 flex-shrink-0 rounded-lg text-lg font-bold transition-all',
                  connectionState === 'CONNECTING'
                    ? 'cursor-not-allowed bg-slate-200 text-slate-400 animate-pulse'
                    : isInCall && !isMuted
                      ? 'bg-red-500 text-white shadow-lg shadow-red-200 hover:bg-red-600'
                      : isInCall && isMuted
                        ? 'bg-amber-400 text-white hover:bg-amber-500'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-600'
                ].join(' ')}
              >
                {connectionState === 'CONNECTING' ? '⏳' : isInCall ? (isMuted ? '🔇' : '🎙️') : '📞'}
              </button>

              <button
                type="submit"
                disabled={!inputValue.trim() || isTyping}
                className="h-11 rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400"
              >
                {t('chat.input.send', 'Gửi')}
              </button>
            </form>
          </div>
        )}
      </section>

      <QRModal
        isOpen={Boolean(qrPayload)}
        qrCodeImage={qrPayload?.qrCodeImage}
        order={qrPayload?.order}
        onClose={() => setQrPayload(null)}
      />
    </>
  );
}

export default ChatWidget;