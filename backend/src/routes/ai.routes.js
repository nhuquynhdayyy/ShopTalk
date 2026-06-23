const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { chat, generateAgoraToken, startAgoraAgent } = require('../services/ai.service');

/**
 * Route: POST /chat
 * Mô tả: Gửi tin nhắn chat tới AI Sales Agent của ShopTalk.
 * Body: { sessionId, message }
 * Trả về: { success, sessionId, reply, escalate, qrCodeImage, orderId }
 */
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    let { sessionId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu tin nhắn người dùng (message)'
      });
    }

    // Nếu chưa có sessionId, sinh mới một UUID ngẫu nhiên để theo dõi phiên (multi-turn context)
    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }

    // Gọi service xử lý hội thoại với LLM / Mock
    const result = await chat(sessionId, message);

    return res.status(200).json({
      success: true,
      sessionId,
      reply: result.reply,
      function_call: result.function_call || null,
      escalate: result.escalate || false,
      qrCodeImage: result.qrCodeImage || null,
      orderId: result.orderId || null
    });

  } catch (error) {
    console.error('Lỗi trong POST /chat:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi xử lý hội thoại với AI Sales Agent'
    });
  }
});

/**
 * Route: POST /start-agent  → resolves to POST /api/ai/start-agent
 * Mô tả: Mời Agora Conversational AI Agent tham gia vào kênh voice RTC.
 * Body: { channelName, agentUid }
 */
router.post('/start-agent', async (req, res) => {
  try {
    const { channelName, agentUid } = req.body;

    if (!channelName) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu tên kênh (channelName)'
      });
    }

    console.log(`[Backend AI Route] Đang mời AI Agent tham gia kênh: ${channelName}, agentUid: ${agentUid || 999}`);
    const result = await startAgoraAgent(channelName, agentUid || 999);
    
    if (!result.success) {
      console.error(`[Backend AI Route] Mời AI Agent thất bại: ${result.message}`);
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }

    console.log(`[Backend AI Route] AI Agent đã được mời thành công vào kênh: ${channelName}`);
    return res.status(200).json({
      success: true,
      message: 'Đã gửi yêu cầu kích hoạt AI Agent tham gia kênh thành công.',
      data: result.data
    });
  } catch (error) {
    console.error('Lỗi khi kích hoạt Agora Agent:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi gửi yêu cầu kích hoạt Agent'
    });
  }
});

module.exports = router;
