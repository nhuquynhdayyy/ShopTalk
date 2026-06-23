import React from 'react';

function ConnectionIndicator({ isConnected, connectionState, reconnectAttempt, lastError }) {
  const isReconnecting = connectionState === 'reconnecting';
  const label = isConnected
    ? 'Online'
    : isReconnecting
      ? `Đang nối lại${reconnectAttempt ? ` (${reconnectAttempt})` : ''}`
      : 'Offline';

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
      title={lastError || 'Trạng thái kết nối thời gian thực'}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          isConnected ? 'bg-emerald-500' : isReconnecting ? 'bg-amber-500' : 'bg-rose-500'
        }`}
      />
      {label}
    </div>
  );
}

export default ConnectionIndicator;
