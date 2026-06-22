import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { useWebSocket } from '../hooks/useWebSocket';
import OrderCard from '../components/OrderCard';

// Tỷ giá quy đổi USDC/VND
const EXCHANGE_RATE = 25450;

function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bankName, setBankName] = useState('VPBank');
  const [bankAccount, setBankAccount] = useState('1234567890');
  const [withdrawStep, setWithdrawStep] = useState(0); // 0: input, 1: loading, 2: success
  const [alertMessage, setAlertMessage] = useState(null);

  // Lấy toàn bộ đơn hàng lúc khởi động
  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await api.getOrders();
      if (response.success) {
        setOrders(response.data);
      }
    } catch (error) {
      console.error('Lỗi khi lấy đơn hàng:', error);
    }
  };

  // Phát âm thanh 'tinh tinh' khi có thanh toán thành công
  const playChime = () => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
      audio.volume = 0.5;
      audio.play();
    } catch (e) {
      console.warn('Không thể phát âm thanh thông báo:', e.message);
    }
  };

  // Lắng nghe sự kiện WebSocket 'order_status_updated'
  useWebSocket('order_status_updated', (updatedOrder) => {
    console.log('[Dashboard] Đơn hàng được cập nhật:', updatedOrder);
    
    // Cập nhật trạng thái trong list mà không cần F5
    setOrders(prevOrders => 
      prevOrders.map(order => 
        order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order
      )
    );

    // Nếu đơn hàng chuyển sang 'paid'
    if (updatedOrder.status === 'paid') {
      playChime();
      
      // Hiển thị Banner Alert thông báo nổi bật góc màn hình
      setAlertMessage(`🎉 [THANH TOÁN THÀNH CÔNG] Đơn hàng #${updatedOrder.id.slice(0, 8)} đã được xác nhận +${updatedOrder.amount} USDC!`);
      setTimeout(() => setAlertMessage(null), 8000);
    }
  });

  // Mở modal Off-ramp
  const handleOpenOfframp = (order) => {
    setSelectedOrder(order);
    setWithdrawStep(0);
    setIsModalOpen(true);
  };

  // Xử lý thực hiện rút tiền
  const handleConfirmWithdraw = () => {
    setWithdrawStep(1); // Mở trạng thái loading
    
    // Giả lập cuộc gọi API cổng CAEX/TCEX trong 2.5 giây
    setTimeout(() => {
      setWithdrawStep(2); // Mở trạng thái thành công
      
      // Đồng thời cập nhật trạng thái đơn hàng cục bộ để phản ánh việc đã rút tiền (hoặc chỉ cập nhật UI)
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === selectedOrder.id ? { ...order, offramped: true } : order
        )
      );
    }, 2500);
  };

  return (
    <div className="flex-1 space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#F0F2F5]">Bảng quản trị cửa hàng</h2>
          <p className="text-xs text-[#8F9CAE]">Quản lý và đối soát đơn hàng Solana Pay tự động (Thời gian thực)</p>
        </div>
        <button
          onClick={fetchOrders}
          className="self-start md:self-auto px-4 py-2 bg-[#1C2533] hover:bg-[#243042] border border-[#243042] text-sm text-[#F0F2F5] rounded-lg transition-colors flex items-center gap-1.5"
        >
          🔄 Làm mới danh sách
        </button>
      </div>

      {/* Real-time Alert Banner */}
      <AnimatePresence>
        {alertMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-emerald-500 text-white font-semibold text-sm px-6 py-4 rounded-xl shadow-xl flex justify-between items-center border border-emerald-400"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🔔</span>
              <p>{alertMessage}</p>
            </div>
            <button onClick={() => setAlertMessage(null)} className="text-white hover:text-gray-200">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orders List Container */}
      <div className="bg-[#151B26] border border-[#243042] rounded-2xl shadow-xl p-6">
        <h3 className="text-base font-bold text-[#F0F2F5] mb-4 flex items-center gap-2">
          📦 Danh sách đơn hàng 
          <span className="bg-[#5B3FE0]/15 text-[#5B3FE0] border border-[#5B3FE0]/30 text-xs px-2 py-0.5 rounded-full font-mono">
            {orders.length}
          </span>
        </h3>

        {orders.length === 0 ? (
          <div className="text-center py-12 text-[#8F9CAE] space-y-2">
            <span className="text-4xl block">📭</span>
            <p className="text-sm">Chưa có đơn hàng nào trong hệ thống.</p>
            <p className="text-xs text-gray-600">Sử dụng Chat Widget để tạo đơn hàng mẫu.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {orders.map((order) => (
                <OrderCard 
                  key={order.id} 
                  order={order} 
                  onOfframp={handleOpenOfframp}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Off-ramp Modal (USDC -> VND Exchange) */}
      <AnimatePresence>
        {isModalOpen && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay background */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            {/* Modal Box */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#151B26] border border-[#243042] w-full max-w-md rounded-2xl shadow-2xl relative overflow-hidden p-6 z-10"
            >
              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  💸 Rút USDC về Ngân hàng (Off-ramp)
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-white text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Step 0: Input form */}
              {withdrawStep === 0 && (
                <div className="space-y-4">
                  <div className="bg-[#0B0E14] p-4 rounded-xl border border-[#243042] space-y-2">
                    <div className="flex justify-between text-xs text-[#8F9CAE]">
                      <span>Đơn hàng:</span>
                      <span className="font-mono text-white">#{selectedOrder.id.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#8F9CAE]">
                      <span>Số dư rút:</span>
                      <span className="font-bold text-[#14F195]">{selectedOrder.amount} USDC</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#8F9CAE] border-t border-[#243042]/55 pt-2">
                      <span>Tỷ giá đối tác (CAEX/TCEX):</span>
                      <span className="text-white">1 USDC = {EXCHANGE_RATE.toLocaleString('vi-VN')} VND</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#8F9CAE] font-semibold border-t border-[#243042]/55 pt-2">
                      <span className="text-[#5B3FE0]">Tổng thực nhận VND:</span>
                      <span className="text-lg font-bold text-[#14F195]">
                        {(selectedOrder.amount * EXCHANGE_RATE).toLocaleString('vi-VN')} VND
                      </span>
                    </div>
                  </div>

                  {/* Bank info form */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-[#8F9CAE] mb-1 font-medium">Ngân hàng thụ hưởng</label>
                      <select 
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-[#243042] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:border-[#5B3FE0]"
                      >
                        <option value="VPBank">VPBank (CAEX Thí điểm)</option>
                        <option value="TCBS">Techcombank (TCEX Thí điểm)</option>
                        <option value="Vietcombank">Vietcombank</option>
                        <option value="MBBank">MB Bank</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-[#8F9CAE] mb-1 font-medium">Số tài khoản ngân hàng</label>
                      <input 
                        type="text"
                        value={bankAccount}
                        onChange={(e) => setBankAccount(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-[#243042] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] font-mono focus:outline-none focus:border-[#5B3FE0]"
                        placeholder="Nhập số tài khoản..."
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleConfirmWithdraw}
                    className="w-full py-3 bg-[#5B3FE0] hover:bg-[#4E34C8] text-white font-semibold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                  >
                    🏦 Xác nhận rút về ngân hàng
                  </button>
                </div>
              )}

              {/* Step 1: Loading API */}
              {withdrawStep === 1 && (
                <div className="py-8 text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-[#5B3FE0] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <div>
                    <p className="text-sm font-semibold text-white">Đang thực hiện giao dịch off-ramp...</p>
                    <p className="text-xs text-[#8F9CAE] mt-1">Đang kết nối cổng đối tác API CAEX/TCEX để quy đổi sang VND...</p>
                  </div>
                </div>
              )}

              {/* Step 2: Success response */}
              {withdrawStep === 2 && (
                <div className="py-4 text-center space-y-4">
                  <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center text-3xl mx-auto">
                    ✓
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">Rút tiền thành công!</h4>
                    <p className="text-xs text-[#8F9CAE] mt-1.5 leading-relaxed">
                      Đã quy đổi thành công <b>{selectedOrder.amount} USDC</b> sang VND.<br />
                      Số tiền <b>{(selectedOrder.amount * EXCHANGE_RATE).toLocaleString('vi-VN')} VND</b> đã được chuyển về tài khoản <b>{bankAccount}</b> tại <b>{bankName}</b>.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 bg-[#243042] hover:bg-[#2C3B52] text-white font-medium text-sm rounded-lg transition-colors border border-[#2c3b52] w-full"
                  >
                    Đóng
                  </button>
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default Dashboard;
