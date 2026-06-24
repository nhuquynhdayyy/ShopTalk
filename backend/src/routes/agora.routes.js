const express = require('express');
const router = express.Router();
const { generateRtcToken } = require('../services/agora.service');
const {
  groq,
  SYSTEM_PROMPT,
  OPENAI_TOOLS,
  executeTool
} = require('../services/ai.service');

/**
 * 1. Handler tạo Token cho Frontend (Sửa lỗi 404 và ReferenceError)
 */
const tokenHandler = (req, res) => {
  try {
    const { channelName, uid, role } = req.method === 'GET' ? req.query : req.body;

    if (!channelName) {
      return res.status(400).json({ success: false, error: 'channelName is required' });
    }

    const userUid = uid !== undefined && uid !== null && uid !== '' ? (Number(uid) || 0) : 0;
    const userRole = role !== undefined && role !== null && role !== '' ? role : 'PUBLISHER';

    const token = generateRtcToken(channelName, userUid, userRole);

    return res.status(200).json({
      token,
      channelName,
      uid: userUid,
      appId: process.env.AGORA_APP_ID
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 2. Hàm lọc sạch dữ liệu rác (metadata) để Agora không báo lỗi 400
 */
const cleanResponse = (groqData) => {
  return {
    id: groqData.id,
    object: "chat.completion",
    created: groqData.created,
    model: groqData.model,
    choices: groqData.choices.map(c => ({
      message: {
        role: c.message.role,
        content: c.message.content || "",
        // Giữ lại tool_calls nếu có để Agora biết AI đang gọi hàm
        ...(c.message.tool_calls ? { tool_calls: c.message.tool_calls } : {})
      },
      index: c.index,
      finish_reason: c.finish_reason
    })),
    usage: groqData.usage
  };
};

/**
 * Handler xử lý Webhook từ Agora Conversational AI
 * Tối ưu cho Voice: Trả lời ngắn, không markdown, hỗ trợ Tools
 */
const llmWebhookHandler = async (req, res) => {
  try {
    const { messages: reqMessages, stream } = req.body;
    if (!reqMessages) return res.status(400).json({ error: 'No messages' });

    // Lọc metadata Agora thêm vào, Groq không chấp nhận
    let messages = reqMessages.map(msg => {
      const clean = { role: msg.role, content: msg.content || '' };
      if (msg.tool_calls) clean.tool_calls = msg.tool_calls;
      if (msg.tool_call_id) {
        clean.tool_call_id = msg.tool_call_id;
        clean.name = msg.name;
      }
      return clean;
    });

    // Đảm bảo có system prompt
    if (!messages.some(msg => msg.role === 'system')) {
      messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
    }

    // Thêm instruction voice ngay sau system prompt (index 1)
    messages.splice(1, 0, {
      role: 'system',
      content: `QUAN TRỌNG - ĐÂY LÀ GIAO DIỆN GIỌNG NÓI:
- Trả lời NGẮN GỌN, tối đa 2-3 câu ngắn
- TUYỆT ĐỐI không viết backtick, markdown, code, tên function như check_inventory hay create_order
- KHÔNG tự bịa thông tin sản phẩm, giá cả — chỉ nói những gì bạn thực sự biết
- Hỏi từng thông tin một: hỏi tên trước, sau đó mới hỏi địa chỉ, không hỏi cùng lúc
- Chờ khách trả lời xong rồi mới phản hồi tiếp
- Khi khách muốn mua, chỉ nói: "Dạ anh chị cho em biết tên người nhận hàng nhé"
- Không được tự tạo đơn hàng hay QR trong voice — chỉ hướng dẫn khách nhắn tin vào chat`
    });

    console.log(`[LLM Webhook] Gọi Groq với ${messages.length} messages, stream=${!!stream}`);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        max_tokens: 100,
        temperature: 0.6,
        stream: true
      });

      let fullContent = '';

      for await (const chunk of streamResponse) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
        }
        const data = JSON.stringify(chunk);
        res.write(`data: ${data}\n\n`);
      }

      console.log('[LLM Webhook] Stream xong, content:', fullContent);
      res.write('data: [DONE]\n\n');
      res.end();

    } else {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        max_tokens: 100,
        temperature: 0.6,
      });

      const content = response.choices[0].message.content;
      console.log('[LLM Webhook] Groq trả về:', content);
      return res.json(cleanResponse(response));
    }

  } catch (error) {
    console.error('[LLM Webhook Error]:', error.message);
    if (!res.headersSent) {
      return res.json({
        id: 'fallback-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'llama-3.3-70b-versatile',
        choices: [{
          message: {
            role: 'assistant',
            content: 'Dạ, anh chị đang quan tâm sản phẩm gì ạ?'
          },
          index: 0,
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      });
    }
  }
};

// ĐĂNG KÝ CÁC ROUTE
router.get('/token', tokenHandler);
router.post('/token', tokenHandler);
router.post('/llm-webhook', llmWebhookHandler);

// Đăng ký fallback cho /api/agora/
router.get('/', tokenHandler);
router.post('/', tokenHandler);

module.exports = router;