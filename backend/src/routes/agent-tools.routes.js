const express = require('express');
const router = express.Router();
const { executeTool } = require('../services/ai.service');

/**
 * Route: POST /api/agent-tools
 * Mô tả: Endpoint tiếp nhận yêu cầu gọi Tool từ Agora Conversational AI Agent.
 * Body: { name, arguments }
 * Trả về: Kết quả thực thi tool dưới dạng JSON.
 */
router.post('/agent-tools', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu tên công cụ (name)'
      });
    }

    // executeTool yêu cầu args là Object, ta parse nếu nó là chuỗi JSON
    let parsedArgs = args || {};
    if (typeof args === 'string') {
      try {
        parsedArgs = JSON.parse(args);
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: 'Tham số công cụ (arguments) không hợp lệ, phải là JSON object hoặc chuỗi JSON.'
        });
      }
    }

    // Thực thi tool nghiệp vụ ở backend
    const toolResult = await executeTool(name, parsedArgs);

    // Trả kết quả về cho Agora Agent
    return res.status(200).json({
      success: true,
      result: JSON.parse(toolResult)
    });

  } catch (error) {
    console.error('Lỗi trong POST /api/agent-tools:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Lỗi hệ thống khi thực thi công cụ'
    });
  }
});

module.exports = router;
