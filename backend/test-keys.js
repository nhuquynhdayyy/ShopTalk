const fetch = require('node-fetch');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

async function testKeys() {
  console.log("Testing Groq...");
  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ 
        model: "llama-3.1-8b-instant", 
        messages: [{role: "user", content: "Say hello!"}],
        max_tokens: 10
      })
    });
    const groqData = await groqRes.json();
    console.log("Groq Response:", groqRes.status, groqData.choices ? groqData.choices[0].message.content : groqData);
  } catch (e) { console.error("Groq Error:", e.message); }

  console.log("\nFetching ElevenLabs voices...");
  try {
    const elRes = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }
    });
    const data = await elRes.json();
    if (data.voices) {
      console.log("Found voices:", data.voices.slice(0, 3).map(v => `${v.name}: ${v.voice_id} (category: ${v.category})`));
    } else {
      console.log("ElevenLabs Response:", data);
    }
  } catch (e) { console.error("ElevenLabs Error:", e.message); }
}

testKeys();
