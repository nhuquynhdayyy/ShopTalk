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
      escalate: result.escalate || false,
      qrCodeImage: result.qrCodeImage || null,
      orderId: result.orderId || null,
      productName: result.productName || null,
      amount: result.amount || null
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
 * Route: POST /agora/token
 * Mô tả: Sinh Agora RTC Token phục vụ kết nối voice channel (cho client hoặc agent).
 * Body: { channelName, uid }
 */
router.post('/agora/token', (req, res) => {
  try {
    const { channelName, uid } = req.body;

    if (!channelName) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu tên kênh (channelName)'
      });
    }

    const tokenData = generateAgoraToken(channelName, uid || 0);
    const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
    const appId = typeof tokenData === 'string' ? null : tokenData.appId;
    
    return res.status(200).json({
      success: true,
      token,
      appId
    });
  } catch (error) {
    console.error('Lỗi khi sinh Agora token:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi sinh Agora Token'
    });
  }
});

/**
 * Route: POST /agora/start-agent
 * Mô tả: Mời Agora Conversational AI Agent tham gia vào kênh voice RTC tương ứng.
 * Body: { channelName, agentUid, language, sessionId }
 */
router.post('/agora/start-agent', async (req, res) => {
  try {
    const { channelName, agentUid, language, sessionId } = req.body;

    if (!channelName) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu tên kênh (channelName)'
      });
    }

    console.log(`[Route] Receiving request to start agent in channel: ${channelName}`);

    const result = await startAgoraAgent(channelName, agentUid || 999, language || 'vi', sessionId || null);
    
    if (!result.success) {
      console.error(`[Route] Start agent failed:`, result.message);
      return res.status(500).json({
        success: false,
        message: result.message || 'Lỗi từ Agora API',
        data: result.data
      });
    }

    console.log(`[Route] Start agent succeeded: ${result.agentName}`);
    return res.status(200).json({
      success: true,
      message: 'Đã gửi yêu cầu kích hoạt AI Agent tham gia kênh thành công.',
      agentName: result.agentName,
      data: result.data
    });
  } catch (error) {
    console.error('[Route] Exception in /agora/start-agent:', error);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi gửi yêu cầu kích hoạt Agent: ' + error.message
    });
  }
});

module.exports = router;
