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
 * 3. Webhook xử lý hội thoại (Sửa lỗi AI im lặng)
 */
const llmWebhookHandler = async (req, res) => {
  try {
    const { messages: reqMessages } = req.body;
    if (!reqMessages) return res.status(400).json({ error: 'No messages' });

    let messages = [...reqMessages];
    if (!messages.some(msg => msg.role === 'system')) {
      messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
    }

    // GỌI GROQ LẦN 1
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto'
    });

    let assistantMessage = response.choices[0].message;

    // XỬ LÝ TOOL CALLING (Check kho / Tạo đơn)
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const result = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: result
        });
      }

      // GỌI GROQ LẦN 2
      const secondResponse = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messages
      });

      return res.json(cleanResponse(secondResponse));
    }

    // TRẢ VỀ PHẢN HỒI TRỰC TIẾP
    return res.json(cleanResponse(response));

  } catch (error) {
    console.error('[LLM Webhook Error]:', error.message);
    res.status(500).json({ error: error.message });
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