const express = require('express');
const router = express.Router();
const { generateRtcToken } = require('../services/agora.service');
const { SYSTEM_PROMPT, OPENAI_TOOLS, executeTool } = require('../services/ai.service');

const tokenHandler = (req, res) => {
  try {
    // Lấy tham số từ req.query nếu là GET request, ngược lại lấy từ req.body
    const { channelName, uid, role } = req.method === 'GET' ? req.query : req.body;

    if (!channelName) {
      return res.status(400).json({
        success: false,
        error: 'channelName is required'
      });
    }

    // Default uid to 0 and role to PUBLISHER if not provided
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
    console.error('Error generating token in route:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const llmWebhookHandler = async (req, res) => {
  console.log('>>> CÓ REQUEST GỌI VÀO WEBHOOK! Method:', req.method, '| Body keys:', Object.keys(req.body || {}));
  try {
    const { messages: reqMessages, stream } = req.body;

    if (!reqMessages || !Array.isArray(reqMessages)) {
      return res.status(400).json({
        error: 'messages array is required'
      });
    }

    const apiKey = process.env.GROQ_API_KEY;
    const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
    const modelName = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    if (!apiKey) {
      return res.status(500).json({
        error: 'GROQ_API_KEY is not configured'
      });
    }

    // 1. Chuẩn bị messages với system prompt từ ai.service.js
    let messages = [...reqMessages];
    const hasSystemMessage = messages.some(msg => msg.role === 'system');
    if (hasSystemMessage) {
      messages = messages.map(msg => msg.role === 'system' ? { ...msg, content: SYSTEM_PROMPT } : msg);
    } else {
      messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
    }

    // 2. Gọi Groq (non-stream trước để kiểm tra/xử lý tool call nếu có)
    console.log('[Agora LLM Webhook] Forwarding request to Groq...');
    const groqResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        tools: OPENAI_TOOLS,
        tool_choice: 'auto'
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('[Agora LLM Webhook] Groq API error:', errorText);
      return res.status(groqResponse.status).json({ error: errorText });
    }

    const data = await groqResponse.json();
    let assistantMessage = data.choices?.[0]?.message;

    // 3. Xử lý Tool Calling (nếu LLM yêu cầu gọi Tool)
    if (assistantMessage && assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('[Agora LLM Webhook] LLM requested tool calling. Executing tools...');
      
      // Đưa assistant message chứa tool_calls vào context
      messages.push(assistantMessage);

      // Thực thi từng tool và đưa kết quả vào context
      for (const toolCall of assistantMessage.tool_calls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        const toolResult = await executeTool(name, args);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: name,
          content: toolResult
        });
      }

      // Gọi lại Groq lần 2 với kết quả của tool
      console.log('[Agora LLM Webhook] Calling Groq again with tool results...');
      
      if (stream) {
        // Stream kết quả lần 2
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: messages,
            stream: true
          })
        });

        if (!streamResponse.ok) {
          const errorText = await streamResponse.text();
          throw new Error(`Groq stream error: ${errorText}`);
        }

        if (typeof streamResponse.body.getReader === 'function') {
          const reader = streamResponse.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } else {
          streamResponse.body.on('data', (chunk) => {
            res.write(chunk);
          });
          await new Promise((resolve) => {
            streamResponse.body.on('end', resolve);
          });
        }
        res.end();
        return;
      } else {
        // Gọi thường lần 2
        const secondResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: messages
          })
        });

        if (!secondResponse.ok) {
          const errorText = await secondResponse.text();
          return res.status(secondResponse.status).json({ error: errorText });
        }

        const secondData = await secondResponse.json();
        return res.status(200).json(secondData);
      }
    }

    // 4. Trả về kết quả bình thường (không có tool call)
    if (stream) {
      // Giả lập stream từ phản hồi đã fetch được để đảm bảo khớp luồng dữ liệu
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const content = assistantMessage?.content || '';
      
      const sendChunk = (delta) => {
        const chunk = {
          id: data.id,
          object: 'chat.completion.chunk',
          created: data.created,
          model: data.model,
          choices: [{
            delta: delta,
            finish_reason: null,
            index: 0
          }]
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      if (content) {
        sendChunk({ role: 'assistant' });
        
        // Chia nhỏ nội dung và xuất ra giả lập stream
        const chunks = content.match(/.{1,8}/g) || [content];
        for (const chunk of chunks) {
          sendChunk({ content: chunk });
          await new Promise(r => setTimeout(r, 20));
        }
      }

      // Gửi chunk kết thúc
      const finalChunk = {
        id: data.id,
        object: 'chat.completion.chunk',
        created: data.created,
        model: data.model,
        choices: [{
          delta: {},
          finish_reason: 'stop',
          index: 0
        }]
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Phản hồi JSON thường
      return res.status(200).json(data);
    }

  } catch (error) {
    console.error('[Agora LLM Webhook] Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: error.message
      });
    }
  }
};

// Đăng ký các endpoints cho router
router.post('/token', tokenHandler);
router.get('/token', tokenHandler);
router.post('/api/agora/token', tokenHandler);
router.get('/api/agora/token', tokenHandler);
router.post('/llm-webhook', llmWebhookHandler);
router.post('/api/agora/llm-webhook', llmWebhookHandler);
router.post('/', tokenHandler);
router.get('/', tokenHandler);

module.exports = router;
