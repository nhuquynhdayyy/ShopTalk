import React from 'react';
import { motion } from 'framer-motion';

const statusCopy = {
  CONNECTING: {
    label: 'Đang kết nối',
    description: 'Đang mở kênh voice với ShopTalk AI.'
  },
  CONNECTED: {
    label: 'Đang lắng nghe',
    description: 'Transcript sẽ được ghi vào luồng chat.'
  },
  DISCONNECTED: {
    label: 'Chưa kết nối',
    description: 'Bắt đầu voice call khi khách muốn tư vấn bằng giọng nói.'
  },
  RECONNECTING: {
    label: 'Đang kết nối lại',
    description: 'Giữ màn hình này mở trong khi hệ thống khôi phục kênh voice.'
  },
  FAILED: {
    label: 'Lỗi kết nối',
    description: 'Không thể mở kênh voice. Vui lòng làm mới trang hoặc thử lại.'
  },
  speaking: {
    label: 'Đang nói',
    description: 'Tin nhắn voice đang được chuyển thành transcript.'
  },
  listening: {
    label: 'Đang lắng nghe',
    description: 'ShopTalk sẵn sàng nhận giọng nói từ khách.'
  }
};

function Waveform({ active }) {
  const bars = [18, 28, 14, 34, 22, 30, 16];

  return (
    <div className="flex h-12 items-center gap-1.5" aria-hidden="true">
      {bars.map((height, index) => (
        <motion.span
          key={`${height}-${index}`}
          animate={active ? { height: [height * 0.45, height, height * 0.62] } : { height: 10 }}
          transition={{
            duration: 0.85,
            repeat: active ? Infinity : 0,
            delay: index * 0.07,
            ease: 'easeInOut'
          }}
          className="w-1.5 rounded-full bg-teal-600"
          style={{ height: 10 }}
        />
      ))}
    </div>
  );
}

function VoiceCallUI({
  status = 'DISCONNECTED',
  isInCall = false,
  isMuted = false,
  participantName = 'ShopTalk AI',
  sessionId,
  language = 'vi',
  onStartCall,
  onEndCall,
  onToggleMute
}) {
  const config = statusCopy[status] || statusCopy.DISCONNECTED;
  const waveformActive = isInCall && !isMuted && status !== 'CONNECTING';

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18 }}
      className="border-b border-slate-200 bg-white px-5 py-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
            VC
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-950">{participantName}</p>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                {config.label}
              </span>
              {isMuted && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Mic tat
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">{config.description}</p>
            <p className="mt-1 truncate text-xs text-slate-400">
              {sessionId ? `Session ${sessionId}` : 'Voice session'} - {language.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <Waveform active={waveformActive} />
          {isInCall && (
            <button
              type="button"
              onClick={onToggleMute}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          )}
          <button
            type="button"
            onClick={isInCall ? onEndCall : onStartCall}
            disabled={status === 'CONNECTING'}
            className={`h-10 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-wait disabled:bg-slate-200 disabled:text-slate-500 ${
              isInCall
                ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100'
                : 'bg-teal-600 text-white hover:bg-teal-700'
            }`}
          >
            {isInCall ? 'End Call' : 'Voice call'}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

export default VoiceCallUI;
