import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const CallStatusContext = createContext(null);

export function CallStatusProvider({ children }) {
  const [isInCall, setIsInCall] = useState(false);
  const leaveChannelRef = useRef(null);
  const joinChannelRef = useRef(null);

  const registerCallHandlers = useCallback(({ joinChannel, leaveChannel }) => {
    joinChannelRef.current = joinChannel;
    leaveChannelRef.current = leaveChannel;
  }, []);

  const value = useMemo(() => ({
    isInCall,
    setIsInCall,
    joinChannelRef,
    leaveChannelRef,
    registerCallHandlers
  }), [isInCall, registerCallHandlers]);

  return (
    <CallStatusContext.Provider value={value}>
      {children}
    </CallStatusContext.Provider>
  );
}

export function useCallStatus() {
  const context = useContext(CallStatusContext);
  if (!context) {
    throw new Error('useCallStatus must be used within CallStatusProvider');
  }
  return context;
}
