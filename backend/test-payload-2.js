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

  const llmConfig = {
    url: "https://api.groq.com/openai/v1/chat/completions",
    api_key: groqApiKey,
    system_messages: [{ role: "system", content: "Xin chào" }],
    params: { model: "llama-3.1-8b-instant", max_tokens: 300 }
  };

  const variations = [
    {
      name: "English ARES + English TTS",
      asr: { vendor: "ares", language: "en-US" },
      tts: { vendor: "microsoft", params: { voice_name: "en-US-AriaNeural" } }
    },
    {
      name: "Vietnamese ARES + English TTS",
      asr: { vendor: "ares", language: "vi-VN" },
      tts: { vendor: "microsoft", params: { voice_name: "en-US-AriaNeural" } }
    },
    {
      name: "English ARES + Vietnamese TTS",
      asr: { vendor: "ares", language: "en-US" },
      tts: { vendor: "microsoft", params: { voice_name: "vi-VN-HoaiMyNeural" } }
    }
  ];

  const agentIds = [];

  for (const v of variations) {
    const requestBody = {
      name: `test-agent-${Date.now()}`,
      properties: { 
        channel: channelName,
        token: token,
        agent_rtc_uid: String(agentUid),
        remote_rtc_uids: ["*"],
        asr: v.asr, 
        tts: v.tts, 
        llm: llmConfig 
      }
    };

    console.log(`Starting variation: ${v.name}...`);
    const resp = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify(requestBody)
    });
    const text = await resp.text();
    console.log(`Response: ${resp.status} ${text}`);
    try {
      agentIds.push({ name: v.name, id: JSON.parse(text).agent_id });
    } catch(e) {}
  }
  
  console.log("\nWaiting 10 seconds for agents to potentially crash...");
  await new Promise(r => setTimeout(r, 10000));
  
  for (const agent of agentIds) {
    const resp = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agent.id}`, {
      method: 'GET',
      headers: { 'Authorization': authHeader }
    });
    const text = await resp.text();
    console.log(`Status for ${agent.name}: ${JSON.parse(text).status}`);
  }
}

testVariations();
