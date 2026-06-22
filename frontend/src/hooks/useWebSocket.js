import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../api';

/**
 * Hook lắng nghe WebSocket từ Backend
 * @param {string} eventName - Tên sự kiện cần lắng nghe
 * @param {Function} callback - Hàm callback xử lý khi nhận sự kiện
 */
export function useWebSocket(eventName, callback) {
  const socketRef = useRef(null);

  useEffect(() => {
    // Kết nối tới Socket.io server của backend
    const socket = io(api.API_BASE_URL, {
      transports: ['websocket', 'polling']
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[WebSocket] 📡 Đã kết nối thành công tới Backend Server!');
    });

    socket.on(eventName, (data) => {
      console.log(`[WebSocket] 📩 Nhận sự kiện "${eventName}":`, data);
      if (callback) {
        callback(data);
      }
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket] ⏹️ Mất kết nối tới Backend.');
    });

    // Cleanup khi component unmount
    return () => {
      socket.disconnect();
    };
  }, [eventName, callback]);

  return socketRef.current;
}
