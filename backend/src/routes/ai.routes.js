const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { chat, generateAgoraToken, startAgoraAgent, executeTool, OPENAI_TOOLS } = require('../services/ai.service');
const { getIo } = require('../websocket/socket.server');

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

/**
 * Route: POST /agora/llm-proxy
 * Mô tả: Proxy đứng giữa Agora Conversational AI và Groq LLM.
 * Bắt tín hiệu Tool Calling từ Voice để hiển thị QR Code lên màn hình!
 */
router.post('/agora/llm-proxy', async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    const payload = req.body;

    // Bắt buộc Groq trả về JSON bình thường (không dùng stream) để dễ bắt Tool Call
    payload.stream = false;
    // CHỈ cấp tool create_order cho Voice AI (vì Voice AI đã có sẵn list hàng trong prompt, không cần check_inventory)
    payload.tools = OPENAI_TOOLS.filter(t => t.function.name === 'create_order');
    payload.tool_choice = "auto";

    // Chuyển tiếp request lên Groq API
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await groqRes.json();

    if (data.error) {
      return res.status(500).json(data);
    }

    const assistantMessage = data.choices[0].message;
    let finalContent = assistantMessage.content || "";

    // KHI GROQ MUỐN GỌI TOOL (VD: create_order)
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`[LLM Proxy] 🎯 Voice AI kích hoạt Tool Calling!`);

      let qrCodeImage = null;
      let orderId = null;
      let productName = null;
      let amount = null;

      // Thực thi tool ngầm ở Backend
      for (const toolCall of assistantMessage.tool_calls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        const toolResult = await executeTool(name, args);

        if (name === 'create_order') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success) {
              qrCodeImage = parsed.qr_code;
              orderId = parsed.order_id;
              productName = parsed.product_name;
              amount = parsed.amount;
            }
          } catch (e) { }
        }
      }

      // BẮN WEBSOCKET XUỐNG FRONTEND ĐỂ HIỆN MÃ QR KHÔNG CẦN GÕ TEXT
      if (qrCodeImage) {
        const io = getIo();
        if (io) {
          io.emit('show_qr_code', {
            sessionId,
            qrCodeImage,
            orderId,
            productName,
            amount
          });
          console.log(`[LLM Proxy] 🚀 Đã bắn mã QR qua WebSocket cho sessionId: ${sessionId}`);
        }
      }

      // Ghi đè câu trả lời để Voice AI đọc lên
      finalContent = "Dạ vâng ạ, em đã lên đơn thành công và gửi mã QR thanh toán vào khung chat. Anh chị vui lòng kiểm tra và quét mã bằng ví Phantom nhé!";
    }

    // ─── ĐÓNG GÓI THÀNH SSE STREAM ĐỂ TRẢ VỀ CHO AGORA ───
    // Vì Agora mặc định dùng stream parser, ta phải giả lập luồng SSE (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendSSE = (content, finish_reason = null) => {
      const chunk = {
        id: data.id || "chatcmpl-" + Date.now(),
        object: "chat.completion.chunk",
        created: data.created || Math.floor(Date.now() / 1000),
        model: data.model || "llama-3.1-8b",
        choices: [
          {
            index: 0,
            delta: content ? { content } : {},
            finish_reason: finish_reason
          }
        ]
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    // Gửi chunk chứa nội dung (nếu có)
    if (finalContent) {
      sendSSE(finalContent, null);
    }
    // Gửi chunk kết thúc
    sendSSE(null, "stop");
    res.write("data: [DONE]\n\n");
    return res.end();
  } catch (error) {
    console.error('[LLM Proxy] ❌ Lỗi:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
