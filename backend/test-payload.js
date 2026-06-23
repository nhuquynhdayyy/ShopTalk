const fetch = require('node-fetch');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { RtcTokenBuilder, RtcRole } = require('agora-token');

async function testVariations() {
  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const groqApiKey = process.env.GROQ_API_KEY;

  const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
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

  const baseProps = {
    channel: channelName,
    token: token,
    agent_rtc_uid: String(agentUid),
    remote_rtc_uids: ["*"],
    asr: { vendor: "ares", language: "vi-VN" },
    tts: { vendor: "microsoft", params: { voice_name: "vi-VN-HoaiMyNeural" } }
  };

  const variations = [
    {
      name: "Groq LLaMA 3.1 8B",
      llm: {
        url: "https://api.groq.com/openai/v1/chat/completions",
        api_key: groqApiKey,
        system_messages: [{ role: "system", content: "Xin chào" }],
        params: { model: "llama-3.1-8b-instant", max_tokens: 300 }
      }
    },
    {
      name: "OpenAI GPT-4o-mini (Mock Key)",
      llm: {
        url: "https://api.openai.com/v1/chat/completions",
        api_key: "sk-mockmockmockmockmock",
        system_messages: [{ role: "system", content: "Xin chào" }],
        params: { model: "gpt-4o-mini", max_tokens: 300 }
      }
    }
  ];

  for (const v of variations) {
    const requestBody = {
      name: `test-agent-${Date.now()}`,
      properties: { ...baseProps, llm: v.llm }
    };

    console.log(`Testing variation: ${v.name}...`);
    const resp = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify(requestBody)
    });
    const text = await resp.text();
    console.log(`Response for ${v.name}: ${resp.status} ${text}`);
  }
}

testVariations();
