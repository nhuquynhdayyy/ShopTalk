const fetch = require('node-fetch');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  console.log("Testing Groq API Key...");
  
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 300,
      stream: true
    })
  });
  
  console.log("Status:", response.status);
  if (!response.ok) {
    const text = await response.text();
    console.log("Error:", text);
  } else {
    // just read first chunk
    const reader = response.body;
    reader.on('data', chunk => {
        console.log("Chunk received:", chunk.toString());
        process.exit(0);
    });
  }
}

testGroq();
