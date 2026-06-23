const fetch = require('node-fetch');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

async function checkAgent() {
  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const agentId = process.argv[2];

  if (!agentId) {
    console.error("Please provide agent ID");
    process.exit(1);
  }

  const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

  const resp = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}`, {
    method: 'GET',
    headers: { 'Authorization': authHeader }
  });
  
  const text = await resp.text();
  console.log(`Agent ${agentId} status: ${resp.status} ${text}`);
}

checkAgent();
