const mockChatHistory = [
  {
    id: 'chat-001',
    session_id: 'session-demo-text',
    sender: 'user',
    type: 'text',
    content: 'Shop con ao thun mau den size M khong?',
    audio_url: null,
    timestamp: '2026-06-24T02:10:00.000Z'
  },
  {
    id: 'chat-002',
    session_id: 'session-demo-text',
    sender: 'ai',
    type: 'text',
    content: 'Ao thun ShopTalk Essential mau den size M con hang. Gia 18 USDC, chat cotton day dan.',
    audio_url: null,
    timestamp: '2026-06-24T02:10:05.000Z'
  },
  {
    id: 'chat-003',
    session_id: 'session-demo-voice',
    sender: 'user',
    type: 'voice',
    content: 'Minh muon nghe tu van ve tai nghe bluetooth.',
    audio_url: '/mock-audio/customer-tai-nghe.webm',
    timestamp: '2026-06-24T02:12:30.000Z'
  },
  {
    id: 'chat-004',
    session_id: 'session-demo-voice',
    sender: 'ai',
    type: 'voice',
    content: 'Mau tai nghe Bluetooth ShopTalk co pin 28 gio va bao hanh 12 thang.',
    audio_url: '/mock-audio/ai-tai-nghe.webm',
    timestamp: '2026-06-24T02:12:36.000Z'
  },
  {
    id: 'chat-005',
    session_id: 'session-demo-escalated',
    sender: 'agent',
    type: 'text',
    content: 'Chao ban, minh la nhan vien shop. Minh se kiem tra ton kho mau xanh cho ban.',
    audio_url: null,
    timestamp: '2026-06-24T02:15:10.000Z'
  }
];

export default mockChatHistory;
