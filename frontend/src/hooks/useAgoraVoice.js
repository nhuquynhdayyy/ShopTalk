import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import api from '../api';

export function useShoAgoraVoice(channelName) {
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionState, setConnectionState] = useState('DISCONNECTED');

  const clientRef = useRef(null);
  const localAudioTrackRef = useRef(null);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        leaveChannel().catch(console.error);
      }
    };
  }, []);

  const joinChannel = async (language = 'vi', sessionId = null) => {
    if (isInCall) return;

    try {
      setConnectionState('CONNECTING');

      let token, appId;
      try {
        const response = await api.http.post('/api/agora/token', {
          channelName,
          uid: 0,
          role: 'PUBLISHER'
        });
        token = response.data.token;
        appId = response.data.appId;
      } catch (error) {
        console.warn('POST /api/agora/token failed, trying GET fallback...', error.message);
        const response = await api.http.get(`/api/agora/token?channelName=${encodeURIComponent(channelName)}`);
        token = response.data.token;
        appId = response.data.appId;
      }

      if (!token || !appId) {
        throw new Error('Failed to retrieve Agora token or App ID');
      }

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'h264' });
      clientRef.current = client;

      client.on('connection-state-change', (curState) => {
        setConnectionState(curState);
      });

      client.on('user-published', async (user, mediaType) => {
        console.log(`[useAgoraVoice] Phát hiện user mới phát stream: ${user.uid}, type: ${mediaType}`);
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack.play();
        }
      });

      await client.join(appId, channelName, token, null);
      console.log(`[useAgoraVoice] Đã join Agora channel: ${channelName} thành công.`);

      try {
        const lang = typeof language === 'string' && language.startsWith('en') ? 'en' : 'vi';
        const voiceSessionId = sessionId || channelName;
        console.log(`[useAgoraVoice] Kích hoạt AI Agent | lang=${lang} | sessionId=${voiceSessionId}`);
        await api.http.post('/api/ai/start-agent', {
          channelName,
          agentUid: 999,
          language: lang,
          sessionId: voiceSessionId
        });
      } catch (agentErr) {
        console.warn('[useAgoraVoice] POST /api/ai/start-agent thất bại:', agentErr.message);
      }

      const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localAudioTrackRef.current = localAudioTrack;
      await client.publish([localAudioTrack]);

      setIsInCall(true);
      setIsMuted(false);
      setConnectionState('CONNECTED');
    } catch (error) {
      console.error('Error joining Agora channel:', error);
      setConnectionState('FAILED');
      await leaveChannel();
      throw error;
    }
  };

  const leaveChannel = async () => {
    try {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }

      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    } catch (error) {
      console.error('Error leaving Agora channel:', error);
    } finally {
      setIsInCall(false);
      setIsMuted(false);
      setConnectionState('DISCONNECTED');
    }
  };

  const toggleMute = async () => {
    if (!localAudioTrackRef.current) return;

    try {
      const nextMuteState = !isMuted;
      await localAudioTrackRef.current.setEnabled(!nextMuteState);
      setIsMuted(nextMuteState);
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  const setMute = async (mute) => {
    if (!localAudioTrackRef.current) return;

    try {
      await localAudioTrackRef.current.setEnabled(!mute);
      setIsMuted(mute);
    } catch (error) {
      console.error('Error setting mute:', error);
    }
  };

  return {
    isInCall,
    isMuted,
    connectionState,
    joinChannel,
    leaveChannel,
    toggleMute,
    setMute
  };
}

export const useAgoraVoice = useShoAgoraVoice;
export default useShoAgoraVoice;
