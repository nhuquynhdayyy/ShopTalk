import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

function QRDisplay({ qrCodeImage, amount, productName, orderId }) {
  const { t } = useTranslation();

  if (!qrCodeImage) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[#151B26] border border-[#243042] rounded-2xl p-6 my-4 max-w-sm mx-auto shadow-2xl text-center relative overflow-hidden"
    >
      {/* Decorative top bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#5B3FE0]"></div>

      <h3 className="text-[#5B3FE0] font-bold text-lg mb-2">{t('components.qr_display.title', 'Thanh toán Solana Pay')}</h3>
      
      {productName && (
        <p className="text-sm text-gray-400 mb-1">
          {t('components.qr_display.product', 'Sản phẩm:')} <span className="text-[#F0F2F5] font-semibold">{productName}</span>
        </p>
      )}
      
      {amount && (
        <p className="text-sm text-gray-400 mb-4">
          {t('components.qr_display.amount', 'Số tiền:')} <span className="text-[#14F195] font-bold text-lg">{amount} USDC</span>
        </p>
      )}

      {/* QR Code Container */}
      <div className="bg-white p-4 rounded-xl inline-block shadow-inner mb-4 transition-transform hover:scale-105 duration-300">
        <img 
          src={qrCodeImage} 
          alt={t('components.qr_display.alt', 'Solana Pay QR Code')} 
          className="w-56 h-56 block mx-auto"
        />
      </div>

      <p className="text-xs text-[#8F9CAE] leading-relaxed mb-3">
        💡 <span dangerouslySetInnerHTML={{ __html: t('components.qr_display.instruction', 'Mở ví Phantom/Solflare (mạng <b>Devnet</b>) quét mã QR trên để xác nhận giao dịch.') }} />
      </p>

      {orderId && (
        <div className="bg-[#0B0E14] py-1.5 px-3 rounded-lg inline-block text-[10px] font-mono text-[#8F9CAE] border border-[#243042]">
          ID: {orderId}
        </div>
      )}
    </motion.div>
  );
}

export default QRDisplay;