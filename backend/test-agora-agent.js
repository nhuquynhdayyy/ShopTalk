require('dotenv').config();
const { RtcTokenBuilder, RtcRole } = require('agora-token');

async function testAgoraAgent() {
  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const groqApiKey = process.env.GROQ_API_KEY;

  const channelName = "test-channel-" + Math.floor(Math.random() * 1000);
  const agentUid = 999;
  
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    process.env.AGORA_APP_CERTIFICATE,
    channelName,
    agentUid,
    RtcRole.PUBLISHER,
    Math.floor(Date.now() / 1000) + 3600
  );

  const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
  const agentName = `test-agent-${Date.now()}`;

  const requestBody = {
    name: agentName,
    properties: {
      channel: channelName,
      token: token,
      agent_rtc_uid: String(agentUid),
      remote_rtc_uids: ["*"],
      asr: {
        language: "vi-VN"
      },
      llm: {
        url: "https://api.groq.com/openai/v1/chat/completions",
        api_key: groqApiKey,
        system_messages: [{ role: "system", content: "Xin chào, bạn tên là gì?" }],
        params: { model: "llama-3.3-70b-versatile" }
      },
      tts: {
        vendor: "microsoft",
        params: { voice_name: "vi-VN-HoaiMyNeural" }
      }
    }
  };

  console.log("Sending request...", requestBody);
  const resp = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify(requestBody)
  });

  const text = await resp.text();
  console.log("Response:", resp.status, text);
}

testAgoraAgent();
