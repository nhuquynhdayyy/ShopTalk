import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import QRDisplay from '../components/QRDisplay';

function ChatWidget() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isEscalated, setIsEscalated] = useState(false);
  
  const chatEndRef = useRef(null);

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
          orderId: response.orderId
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
        <button
          onClick={handleReset}
          className="text-xs text-[#8F9CAE] hover:text-[#5B3FE0] bg-[#0B0E14] hover:bg-[#243042] px-3 py-1.5 rounded-lg border border-[#243042] transition-colors"
        >
          🔄 Làm mới chat
        </button>
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
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
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
                    amount={0.1} // Lấy từ DB hoặc mặc định
                    productName="Solana Mobile Saga v2"
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
      </form>
    </div>
  );
}

export default ChatWidget;
