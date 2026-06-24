/**
 * Test Script: Kiểm tra cấu hình Agora Voice Chat
 * Chạy: node backend/test-agora-voice.js
 */

require('dotenv').config({ path: __dirname + '/.env' });
const { generateAgoraToken, startAgoraAgent } = require('./src/services/ai.service');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.cyan}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${colors.reset}\n`)
};

async function testAgoraConfig() {
  log.section('🔧 TEST 1: Kiểm tra Environment Variables');

  const requiredEnvVars = [
    'AGORA_APP_ID',
    'AGORA_APP_CERTIFICATE',
    'AGORA_CUSTOMER_ID',
    'AGORA_CUSTOMER_SECRET',
    'GROQ_API_KEY',
    'WEBHOOK_URL'
  ];

  let allEnvPresent = true;
  
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      log.success(`${envVar}: ${process.env[envVar].substring(0, 20)}...`);
    } else {
      log.error(`${envVar}: THIẾU`);
      allEnvPresent = false;
    }
  }

  if (!allEnvPresent) {
    log.error('Vui lòng cập nhật file backend/.env với đầy đủ thông tin!');
    process.exit(1);
  }

  log.section('🔧 TEST 2: Generate Agora RTC Token');
  
  try {
    const testChannel = 'test-channel-' + Date.now();
    const testUid = 1;
    
    const tokenData = generateAgoraToken(testChannel, testUid);
    const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
    const appId = typeof tokenData === 'string' ? process.env.AGORA_APP_ID : tokenData.appId;
    
    log.success(`Channel: ${testChannel}`);
    log.success(`UID: ${testUid}`);
    log.success(`Token: ${token.substring(0, 50)}...`);
    log.success(`AppId: ${appId}`);
  } catch (error) {
    log.error(`Lỗi khi generate token: ${error.message}`);
    process.exit(1);
  }

  log.section('🔧 TEST 3: Khởi động Agora AI Agent');
  
  try {
    const testChannel = 'test-voice-' + Date.now();
    const testSessionId = 'test-session-' + Date.now();
    
    log.info(`Đang gửi request tới Agora API...`);
    log.info(`Channel: ${testChannel}`);
    log.info(`Session: ${testSessionId}`);
    log.info(`Language: vi`);
    
    const result = await startAgoraAgent(testChannel, 999, 'vi', testSessionId);
    
    if (result.success) {
      log.success(`Agent đã join channel thành công!`);
      log.success(`Agent name: ${result.agentName}`);
      log.info(`Response data:\n${JSON.stringify(result.data, null, 2)}`);
    } else {
      log.error(`Agent KHÔNG join được channel!`);
      log.error(`Message: ${result.message || 'Unknown error'}`);
      if (result.data) {
        log.error(`Response data:\n${JSON.stringify(result.data, null, 2)}`);
      }
      process.exit(1);
    }
  } catch (error) {
    log.error(`Exception khi gọi startAgoraAgent: ${error.message}`);
    log.error(`Stack: ${error.stack}`);
    process.exit(1);
  }

  log.section('🎉 TẤT CẢ TESTS ĐỀU PASS!');
  log.success('Cấu hình Agora Voice Chat hoạt động bình thường.');
  log.info('Bây giờ bạn có thể test trên Frontend!');
  
  // Lưu ý: Agent sẽ ở trong channel một lúc, sau đó tự động rời
  log.warning('Lưu ý: Agent test sẽ tự động timeout sau vài giây vì không có người dùng thật trong channel.');
  
  process.exit(0);
}

// Chạy test
console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     🧪 AGORA VOICE CHAT CONFIGURATION TEST              ║
║                                                          ║
║     ShopTalk - AI Sales Agent with Voice                ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);

testAgoraConfig().catch(error => {
  log.error(`Unhandled error: ${error.message}`);
  log.error(error.stack);
  process.exit(1);
});
