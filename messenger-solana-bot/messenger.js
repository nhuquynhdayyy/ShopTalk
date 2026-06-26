const axios = require('axios');
const FormData = require('form-data');

// Base URL của Facebook Graph API
const GRAPH_API_VERSION = 'v20.0';
const FACEBOOK_GRAPH_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Gửi tin nhắn văn bản thông thường tới người dùng Messenger
 * 
 * @param {string} recipientId - PSID (Page Scoped ID) của người dùng
 * @param {string} text - Nội dung tin nhắn
 */
async function sendTextMessage(recipientId, text) {
  try {
    const accessToken = process.env.PAGE_ACCESS_TOKEN;
    if (!accessToken || accessToken.includes('your_facebook_page_access_token_here')) {
      throw new Error("Chưa cấu hình PAGE_ACCESS_TOKEN trong file .env");
    }

    const response = await axios.post(
      `${FACEBOOK_GRAPH_URL}/me/messages?access_token=${accessToken}`,
      {
        recipient: { id: recipientId },
        message: { text: text }
      }
    );

    console.log(`[Facebook API] Gửi tin nhắn text thành công tới ${recipientId}. Message ID: ${response.data.message_id}`);
    return response.data;
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error(`[Facebook API] Lỗi khi gửi tin nhắn text tới ${recipientId}:`, JSON.stringify(errorData));
    throw error;
  }
}

/**
 * Upload ảnh QR code lên Facebook Attachment API và gửi về cho khách hàng
 * 
 * @param {string} recipientId - PSID của người nhận tin nhắn
 * @param {Buffer} qrBuffer - Buffer dữ liệu của ảnh QR Code (PNG)
 */
async function sendQRImage(recipientId, qrBuffer) {
  try {
    const accessToken = process.env.PAGE_ACCESS_TOKEN;
    if (!accessToken || accessToken.includes('your_facebook_page_access_token_here')) {
      throw new Error("Chưa cấu hình PAGE_ACCESS_TOKEN trong file .env");
    }

    // --- BƯỚC 1: Upload ảnh QR Code lên để lấy attachment_id ---
    console.log(`[Facebook API] Đang upload ảnh QR code lên Facebook Message Attachments...`);
    const form = new FormData();
    form.append('message', JSON.stringify({
      attachment: {
        type: 'image',
        payload: {
          is_reusable: true
        }
      }
    }));
    // Append buffer ảnh QR code dạng file png
    form.append('filedata', qrBuffer, {
      filename: 'solana-pay-qr.png',
      contentType: 'image/png'
    });

    const uploadResponse = await axios.post(
      `${FACEBOOK_GRAPH_URL}/me/message_attachments?access_token=${accessToken}`,
      form,
      {
        headers: {
          ...form.getHeaders()
        }
      }
    );

    const attachmentId = uploadResponse.data.attachment_id;
    console.log(`[Facebook API] Upload ảnh thành công. attachment_id: ${attachmentId}`);

    // --- BƯỚC 2: Gửi tin nhắn chứa attachment_id đó cho khách hàng ---
    console.log(`[Facebook API] Đang gửi tin nhắn đính kèm QR code tới khách hàng ${recipientId}...`);
    const sendResponse = await axios.post(
      `${FACEBOOK_GRAPH_URL}/me/messages?access_token=${accessToken}`,
      {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'image',
            payload: {
              attachment_id: attachmentId
            }
          }
        }
      }
    );

    console.log(`[Facebook API] Đã gửi ảnh QR code thành công. Message ID: ${sendResponse.data.message_id}`);
    return sendResponse.data;
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error(`[Facebook API] Lỗi khi gửi ảnh QR tới ${recipientId}:`, JSON.stringify(errorData));
    throw error;
  }
}

module.exports = {
  sendTextMessage,
  sendQRImage
};
