import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../api';

export function useWebSocket(eventHandlers = {}, callback) {
  const socketRef = useRef(null);
  const handlersRef = useRef({});
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [lastConnectedAt, setLastConnectedAt] = useState(null);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    handlersRef.current = typeof eventHandlers === 'string'
      ? { [eventHandlers]: callback }
      : eventHandlers || {};
  }, [eventHandlers, callback]);

  useEffect(() => {
    const socket = io(api.API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionState('online');
      setReconnectAttempt(0);
      setLastError(null);
      setLastConnectedAt(new Date());
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setConnectionState('offline');
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      setReconnectAttempt(attempt);
      setConnectionState('reconnecting');
    });

    socket.io.on('reconnect', () => {
      setReconnectAttempt(0);
      setConnectionState('online');
    });

    socket.io.on('reconnect_error', (error) => {
      setLastError(error.message);
    });

    socket.on('connect_error', (error) => {
      setIsConnected(false);
      setConnectionState('offline');
      setLastError(error.message);
    });

    socket.onAny((eventName, payload) => {
      const handler = handlersRef.current[eventName];

      if (handler) {
        handler(payload);
      }
    });

    return () => {
      socket.offAny();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    connectionState,
    reconnectAttempt,
    lastConnectedAt,
    lastError
  };
}
