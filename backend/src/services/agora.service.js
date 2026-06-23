const path = require('path');
// Tải các biến môi trường từ .env nếu chưa được load
if (!process.env.AGORA_APP_ID || !process.env.AGORA_APP_CERTIFICATE) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

/**
 * Tạo token RTC dùng cho user/agent tham gia kênh voice
 * @param {string} channelName - Tên kênh RTC
 * @param {number|string} uid - ID người dùng/agent
 * @param {string|number} [role] - Vai trò (PUBLISHER hoặc SUBSCRIBER)
 * @returns {string} RTC Token
 */
function generateRtcToken(channelName, uid, role) {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    throw new Error('AGORA_APP_ID or AGORA_APP_CERTIFICATE is not configured in .env');
  }

  // Khởi tạo role mặc định là PUBLISHER
  let rtcRole = RtcRole.PUBLISHER;

  const roleMap = {
    'PUBLISHER': RtcRole.PUBLISHER,
    'SUBSCRIBER': RtcRole.SUBSCRIBER,
    'ATTENDEE': RtcRole.ATTENDEE,
    'ADMIN': RtcRole.ADMIN,
    '1': RtcRole.PUBLISHER,
    '2': RtcRole.SUBSCRIBER,
    '0': RtcRole.ATTENDEE,
    '101': RtcRole.ADMIN
  };

  if (role !== undefined && role !== null && role !== '') {
    if (typeof role === 'number') {
      if (Object.values(RtcRole).includes(role)) {
        rtcRole = role;
      }
    } else {
      const roleStr = String(role).toUpperCase();
      if (roleMap[roleStr] !== undefined) {
        rtcRole = roleMap[roleStr];
      }
    }
  }

  const expirationTimeInSeconds = 3600; // Hết hạn sau 1 giờ
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const finalUid = Number(uid) || 0;

  // Sử dụng RtcTokenBuilder.buildTokenWithUid
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    finalUid,
    rtcRole,
    privilegeExpiredTs
  );

  return token;
}

module.exports = {
  generateRtcToken
};
