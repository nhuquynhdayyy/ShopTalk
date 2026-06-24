import AgoraRTC from 'agora-rtc-sdk-ng';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../api';
import QRModal from '../components/QRModal';
import { useAgoraVoice } from '../hooks/useAgoraVoice';

const mockMessages = [
  {
    id: 'mock-welcome',
    role: 'assistant',
    content: 'Xin chào, mình là ShopTalk. Bạn có thể hỏi sản phẩm, so sánh lựa chọn hoặc nhắn "mua" để mình tạo mã thanh toán USDC.'
  }
];

const suggestedPrompts = [
  'Tư vấn áo thun bán chạy',
  'Mình muốn mua tai nghe',
  'Cho mình gặp chủ shop'
];

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

const buildMockChatResponse = (message, sessionId) => {
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
      reply: 'Mình đã chuyển cuộc trò chuyện này cho nhân viên. Bạn giữ màn hình này mở, nhân viên sẽ tiếp nhận ngay.',
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
      reply: `Mình đã tạo đơn ${order.product_name}. Tổng thanh toán là ${order.amount} USDC. Bạn quét mã QR vừa mở để thanh toán qua ví Solana nhé.`,
      escalate: false,
      qrCodeImage: createMockQrImage(),
      orderId
    };
  }

  return {
    success: true,
    sessionId,
    reply: 'Mình gợi ý bắt đầu với áo thun ShopTalk Essential nếu bạn cần món dễ bán, hoặc tai nghe Bluetooth nếu khách của bạn thích phụ kiện công nghệ. Bạn muốn mình tạo đơn cho sản phẩm nào?',
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

const parseMessageContent = (content, onShowQr) => {
  if (!content) return null;

  // Regex to match <function=name>JSON_ARGS</function>
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
      const productName = args.product_name || args.name || 'Sản phẩm';
      const qrCodeImage = args.qr_code || args.qrCodeImage;
      const sellerWallet = args.seller_wallet;

      elements.push(
        <div key={`func-${match.index}`} className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-800 text-[10px] font-bold">✓</span>
            <h4 className="text-xs font-semibold text-slate-900">Đơn hàng được khởi tạo</h4>
          </div>

          <div className="mt-2.5 space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Sản phẩm:</span>
              <span className="font-semibold text-slate-800">{productName}</span>
            </div>
            <div className="flex justify-between">
              <span>Số tiền:</span>
              <span className="font-semibold text-teal-700">{orderAmount} USDC (Devnet)</span>
            </div>
            {orderId && (
              <div className="flex justify-between">
                <span>Mã đơn:</span>
                <span className="font-mono text-[10px] text-slate-500">{orderId.slice(0, 8)}...</span>
              </div>
            )}
          </div>

          {qrCodeImage && (
            <div className="mt-3 flex flex-col items-center justify-center rounded bg-white p-2 border border-slate-200">
              <img src={qrCodeImage} alt="QR Code Solana Pay" className="h-40 w-40 object-contain" />
              <p className="mt-1 text-[9px] text-slate-400">Quét bằng ví Phantom/Solflare (Devnet)</p>
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
                  seller_wallet: sellerWallet
                })}
                className="h-8 rounded bg-teal-600 px-3 text-xs font-semibold text-white transition hover:bg-teal-700"
              >
                Phóng to QR
              </button>
            )}
            {sellerWallet && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(sellerWallet);
                  alert('Đã copy địa chỉ ví người nhận!');
                }}
                className="h-8 rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Copy ví người bán
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
          <span>Đang kiểm tra kho: <strong className="text-slate-800">{productName}</strong></span>
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

function ChatBubble({ message, onShowQr }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? 'rounded-br-sm bg-teal-600 text-white'
            : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'
        }`}
      >
        {isUser ? message.content : parseMessageContent(message.content, onShowQr)}
      </div>
    </motion.div>
  );
}

function StaffHandoff() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-amber-200 bg-amber-50 p-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
          NV
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Nhân viên đang hỗ trợ</h3>
          <p className="mt-1 text-sm text-slate-600">
            Chào bạn, mình đã nhận được yêu cầu. Bạn chờ trong giây lát để shop tiếp tục cuộc trò chuyện nhé.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function ChatWidget() {
  const [messages, setMessages] = useState(mockMessages);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [isEscalated, setIsEscalated] = useState(false);
  
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isConnectingVoice, setIsConnectingVoice] = useState(false);
  const [language, setLanguage] = useState('vi');

  const [isMockMode, setIsMockMode] = useState(false);
  const [qrPayload, setQrPayload] = useState(null);
  const chatEndRef = useRef(null);
  const rtcClientRef = useRef(null);
  const localAudioTrackRef = useRef(null);

  // ── Voice call via Agora ──────────────────────────────────────────────────
  const { isInCall, isMuted, connectionState, joinChannel, leaveChannel, toggleMute } = useAgoraVoice(sessionId);

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
  }, [messages, isTyping, isEscalated]);

  const subtitle = useMemo(() => (
    isEscalated ? 'Đã chuyển sang nhân viên' : 'AI Sales Agent đang sẵn sàng'
  ), [isEscalated]);

  const resolveOrderSummary = async (orderId) => {
    if (mockOrderDetailsById.has(orderId)) {
      return mockOrderDetailsById.get(orderId);
    }

    if (!orderId) return null;

    try {
      const response = await api.getOrderById(orderId);
      return response.data || null;
    } catch (_) {
      return {
        id: orderId,
        product_name: 'Đơn hàng ShopTalk',
        amount: 0,
        seller_wallet: ''
      };
    }
  };

  const handleSend = async (event) => {
    event?.preventDefault();

    const text = inputValue.trim();
    if (!text || isTyping || isEscalated) return;

    setInputValue('');
    setMessages((current) => [
      ...current,
      { id: generateId(), role: 'user', content: text }
    ]);
    setIsTyping(true);

    try {
      // Gửi lên backend API /chat
      const response = await api.sendChatMessage(userText, sessionId);

      if (response.success) {
        // Thêm câu trả lời của AI
        const aiMsgId = crypto.randomUUID();
        setMessages(prev => [...prev, { 
          id: aiMsgId, 
          role: 'assistant', 
          content: response.reply,
          qrCodeImage: response.qrCodeImage,
          orderId: response.orderId,
          productName: response.productName,
          amount: response.amount
        }]);

      try {
        response = await api.sendChatMessage(text, sessionId);
        if (!response.success) {
          throw new Error(response.error || 'Chat API returned an unsuccessful response');
        }
        setIsMockMode(false);
      } catch (_) {
        response = buildMockChatResponse(text, sessionId || generateId());
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
        setQrPayload({ qrCodeImage: response.qrCodeImage, order });
      }
    } finally {
      setIsTyping(false);
    }
  };

  const startVoiceChat = async () => {
    setIsConnectingVoice(true);
    try {
      const channelName = `voice_${sessionId}`;
      console.log(`[Voice] 🎤 Đang kết nối tới channel: ${channelName}`);
      
      // Bước 1: Lấy token cho user
      const tokenData = await api.getAgoraToken(channelName, 1);
      console.log(`[Voice] 🔑 Đã nhận token từ backend`);

      if (!rtcClientRef.current) {
        rtcClientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      }
      const client = rtcClientRef.current;

      // Event handlers (đăng ký trước khi join)
      client.on("user-joined", (user) => {
        console.log("🔥 [Agora] Có người vừa tham gia phòng:", user.uid);
        if (user.uid === 999) {
          console.log("🤖 [Agora] AI Agent đã vào phòng!");
        }
      });

      client.on("user-left", (user) => {
        console.log("🔥 [Agora] Có người vừa rời phòng:", user.uid);
        if (user.uid === 999) {
          console.warn("⚠️ [Agora] AI Agent đã rời phòng!");
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '⚠️ Agent đã ngắt kết nối. Bạn có thể kết thúc và gọi lại.'
          }]);
        }
      });

      client.on("user-published", async (user, mediaType) => {
        console.log(`🔥 [Agora] Nhận được track ${mediaType} từ user ${user.uid}`);
        try {
          await client.subscribe(user, mediaType);
          if (mediaType === "audio") {
            console.log(`🔊 [Agora] Đang phát âm thanh từ user ${user.uid}...`);
            user.audioTrack.play();
            
            if (user.uid === 999) {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '🎙️ AI Agent đang nói chuyện với bạn...'
              }]);
            }
          }
        } catch (error) {
          console.error(`❌ [Agora] Lỗi khi subscribe ${mediaType}:`, error);
        }
      });

      client.on("user-unpublished", (user, mediaType) => {
        console.log(`🔇 [Agora] User ${user.uid} đã ngừng publish ${mediaType}`);
      });

      client.on("connection-state-change", (curState, prevState) => {
        console.log(`🔗 [Agora] Connection state: ${prevState} → ${curState}`);
      });

      // Bước 2: User join channel TRƯỚC
      console.log(`[Voice] 📡 User đang join channel...`);
      await client.join(tokenData.appId, channelName, tokenData.token, 1);
      console.log(`[Voice] ✅ User đã join channel thành công!`);

      // Bước 3: Publish microphone ngay để channel không trống
      const localTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localAudioTrackRef.current = localTrack;
      await client.publish([localTrack]);
      console.log(`[Voice] 🎤 Đã publish microphone track`);

      // Bước 4: Gọi Agent SAU khi user đã ở trong channel
      console.log(`[Voice] 🤖 Đang khởi động AI Agent (user đã trong channel)...`);
      const agentResponse = await api.startAgoraAgent(channelName, language, sessionId);
      console.log(`[Voice] 🤖 Agent response:`, agentResponse);

      setIsVoiceMode(true);
      
      // Thêm thông báo vào chat
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '🎙️ Kết nối voice thành công! Hãy nói chuyện với em nhé...'
      }]);

    } catch (error) {
      console.error("❌ [Voice] Lỗi khi khởi tạo Voice Chat:", error);

      // Cleanup track và client để lần thử lại không bị "already connected"
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (rtcClientRef.current) {
        try { await rtcClientRef.current.leave(); } catch (_) {}
        rtcClientRef.current = null;
      }

      const detailError = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;
      alert("Lỗi chi tiết từ Backend/Agora:\n" + detailError);

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ Không thể kết nối voice chat: ${error.message}`
      }]);
    } finally {
      setIsConnectingVoice(false);
    }
  };

  const stopVoiceChat = async () => {
    try {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (rtcClientRef.current) {
        await rtcClientRef.current.leave();
        rtcClientRef.current = null; // Reset để lần sau tạo client mới
      }
    } catch (error) {
      console.error("Lỗi khi dừng Voice Chat:", error);
      rtcClientRef.current = null;
      localAudioTrackRef.current = null;
    }
    setIsVoiceMode(false);
  const handlePromptClick = (prompt) => {
    setInputValue(prompt);
  };

  const handleReset = () => {
    const nextSessionId = generateId();
    sessionStorage.setItem('shoptalk_session_id', nextSessionId);
    setSessionId(nextSessionId);
    setMessages(mockMessages);
    setIsEscalated(false);
    setQrPayload(null);
    setInputValue('');
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
                <h1 className="text-base font-semibold text-slate-950">ShopTalk Chat</h1>
                <p className="text-sm text-slate-500">{subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isMockMode && (
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  Mock data
                </span>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Làm mới
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                onShowQr={(qrCodeImage, order) => setQrPayload({ qrCodeImage, order })}
              />
            ))}
          </AnimatePresence>

          {isTyping && <TypingIndicator />}
          {isEscalated && <StaffHandoff />}
          <div ref={chatEndRef} />
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            disabled={isVoiceMode || isConnectingVoice}
            className="bg-[#0B0E14] text-xs text-[#8F9CAE] border border-[#243042] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#5B3FE0]"
          >
            <option value="vi">🇻🇳 Tiếng Việt</option>
            <option value="en">🇺🇸 English</option>
          </select>
          <button
            onClick={handleReset}
            className="text-xs text-[#8F9CAE] hover:text-[#5B3FE0] bg-[#0B0E14] hover:bg-[#243042] px-3 py-1.5 rounded-lg border border-[#243042] transition-colors"
          >
            🔄 Làm mới
          </button>
        </div>
      </div>

        {!isEscalated && (
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePromptClick(prompt)}
                  className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-700"
                >
                  {msg.content}
                </div>

                {/* Hiển thị QR Code nếu có */}
                {msg.role === 'assistant' && msg.qrCodeImage && (
                  <QRDisplay 
                    qrCodeImage={msg.qrCodeImage}
                    amount={msg.amount || 0.1}
                    productName={msg.productName || "Solana Mobile Saga v2"}
                    orderId={msg.orderId}
                  />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading / Typing Animation */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#1C2533] border border-[#243042] px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#8F9CAE] rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-[#8F9CAE] rounded-full animate-bounce delay-75"></span>
              <span className="w-2 h-2 bg-[#8F9CAE] rounded-full animate-bounce delay-150"></span>
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSend} className="flex gap-2">
              <input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Nhập câu hỏi hoặc yêu cầu mua hàng..."
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              />

              {/* ── Nút gọi thoại ───────────────────────────── */}
              <button
                type="button"
                title={isInCall ? (isMuted ? 'Bỏ tắt mic' : 'Tắt mic') : 'Gọi thoại AI'}
                onClick={isInCall ? (isMuted ? toggleMute : toggleMute) : joinChannel}
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

{/* Message Input Box - Nhánh feature/ai-agora_vs2 */}
      <form onSubmit={handleSend} className="p-4 bg-[#1C2533] border-t border-[#243042] flex gap-3">
        {isVoiceMode ? (
          <div className="flex-1 flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-400">Đang trong cuộc gọi Voice...</span>
            </div>
            <button
              type="button"
              onClick={stopVoiceChat}
              className="bg-red-500/20 hover:bg-red-500/40 text-red-500 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              📴 Kết thúc
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={startVoiceChat}
              disabled={isConnectingVoice || isEscalated}
              className="bg-[#243042] hover:bg-[#324156] disabled:bg-gray-700 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all active:scale-95 disabled:scale-100 flex items-center justify-center"
              title="Gọi Voice Chat"
            >
              {isConnectingVoice ? "⏳" : "🎤"}
            </button>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isEscalated ? "Cuộc trò chuyện đã được chuyển cho người thật..." : "Nhập tin nhắn tư vấn / mua hàng tại đây..."}
              disabled={isEscalated}
              className="flex-1 bg-[#0B0E14] border border-[#243042] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#5B3FE0] text-[#F0F2F5] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading || isEscalated}
              className="bg-[#5B3FE0] hover:bg-[#4E34C8] disabled:bg-gray-700 text-white px-5 py-3 rounded-xl text-sm font-medium transition-all active:scale-95 disabled:scale-100 flex items-center justify-center gap-1.5"
            >
              Gửi 🚀
            </button>
          </>
        )}
      </form>
    </div>

    {/* QR Modal - Giữ lại từ nhánh main để hiển thị cửa sổ popup nếu cần */}
    <QRModal
      isOpen={Boolean(qrPayload)}
      qrCodeImage={qrPayload?.qrCodeImage}
      order={qrPayload?.order}
      onClose={() => setQrPayload(null)}
    />
  );
}

export default ChatWidget;
