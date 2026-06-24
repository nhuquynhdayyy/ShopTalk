import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AgoraRTC from 'agora-rtc-sdk-ng';
import api from '../api';
import QRDisplay from '../components/QRDisplay';
import { io } from 'socket.io-client';

function ChatWidget() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isEscalated, setIsEscalated] = useState(false);

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isConnectingVoice, setIsConnectingVoice] = useState(false);
  const [language, setLanguage] = useState('vi');

  const chatEndRef = useRef(null);
  const rtcClientRef = useRef(null);
  const localAudioTrackRef = useRef(null);

  // Khởi tạo session ID khi bắt đầu
  useEffect(() => {
    let savedSessionId = sessionStorage.getItem('shoptalk_session_id');
    if (!savedSessionId) {
      savedSessionId = crypto.randomUUID();
      sessionStorage.setItem('shoptalk_session_id', savedSessionId);
    }
    setSessionId(savedSessionId);

    // Chào mừng khách hàng
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Xin chào anh/chị! Em là trợ lý ảo bán hàng của ShopTalk. Hôm nay anh/chị cần em hỗ trợ tư vấn sản phẩm hay đặt mua sản phẩm gì thế ạ? 😊'
      }
    ]);
  }, []);

  // Tự động cuộn xuống cuối khung chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Lắng nghe tín hiệu bắn mã QR từ MCP Server
  useEffect(() => {
    const socket = io(api.API_BASE_URL || 'http://localhost:3000', { transports: ['websocket', 'polling'] });

    socket.on('show_qr_code', (data) => {
      // Chỉ nhận QR code nếu đúng sessionId của tab này hoặc "default"
      if (data.sessionId === sessionStorage.getItem('shoptalk_session_id') || data.sessionId === "default") {
        
        let productText = `- **Sản phẩm:** ${data.productName}`;
        if (data.itemsList && Array.isArray(data.itemsList) && data.itemsList.length > 0) {
           productText = `- **Danh sách sản phẩm:**\n` + data.itemsList.map(item => `  + ${item.quantity}x ${item.name} (${item.price} USDC)`).join('\n');
        }

        const orderDetails = `Dạ vâng ạ, em đã lên đơn thành công! Dưới đây là thông tin đơn hàng của anh/chị:
        
- **Mã đơn hàng:** \`${data.orderId}\`
- **Tên người nhận:** ${data.customerName || 'Khách hàng'}
- **Địa chỉ giao hàng:** ${data.customerAddress || 'Chưa cung cấp'}
${productText}
- **Tổng tiền:** ${data.amount} USDC

Anh/chị vui lòng kiểm tra lại thông tin và quét mã QR bên dưới bằng ví Phantom/Solflare để thanh toán nhé!`;

        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: orderDetails,
          qrCodeImage: data.qrCodeImage,
          orderId: data.orderId,
          productName: data.productName,
          amount: data.amount
        }]);
      }
    });

    return () => socket.disconnect();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || isEscalated) return;

    const userText = inputValue;
    setInputValue('');

    // Thêm tin nhắn của user vào danh sách hiển thị
    const userMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: userText }]);

    setIsLoading(true);

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

        // Nếu nhận được cờ escalate
        if (response.escalate) {
          setIsEscalated(true);
        }
      } else {
        throw new Error(response.error || 'Lỗi xử lý tin nhắn');
      }
    } catch (error) {
      console.error('Lỗi khi chat:', error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ Có lỗi kết nối xảy ra: ${error.message}. Anh/chị vui lòng thử lại nhé.`
      }]);
    } finally {
      setIsLoading(false);
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
        try { await rtcClientRef.current.leave(); } catch (_) { }
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
  };

  const handleReset = () => {
    const newSessionId = crypto.randomUUID();
    sessionStorage.setItem('shoptalk_session_id', newSessionId);
    setSessionId(newSessionId);
    setIsEscalated(false);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Đã làm mới phiên hội thoại! Em là trợ lý bán hàng ShopTalk. Em có thể giúp gì cho anh/chị hôm nay ạ? 🛍️'
      }
    ]);
  };

  return (
    <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto bg-[#151B26] border border-[#243042] rounded-2xl shadow-2xl overflow-hidden h-[calc(100vh-140px)]">
      {/* Widget Header */}
      <div className="bg-[#1C2533] px-6 py-4 border-b border-[#243042] flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
          <div>
            <h2 className="font-bold text-sm text-[#F0F2F5]">Trợ lý ảo ShopTalk</h2>
            <p className="text-[10px] text-gray-400">Đang hoạt động định kỳ (Groq Llama 3.3)</p>
          </div>
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

      {/* Messages Scrollbox */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-[85%] space-y-2">
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                      ? 'bg-[#5B3FE0] text-white rounded-tr-none'
                      : 'bg-[#1C2533] text-[#F0F2F5] rounded-tl-none border border-[#243042]'
                    }`}
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
            </div>
          </div>
        )}

        {/* Escalation Overlay Warning */}
        {isEscalated && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center max-w-md mx-auto"
          >
            <p className="text-amber-400 text-xs font-semibold flex items-center justify-center gap-2">
              🚨 Đã gửi tín hiệu chuyển cuộc hội thoại cho nhân viên hỗ trợ!
            </p>
            <p className="text-[#8F9CAE] text-[11px] mt-1">
              Hội thoại với bot đã dừng. Quý khách vui lòng đợi trong giây lát.
            </p>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Message Input Box */}
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
  );
}

export default ChatWidget;
