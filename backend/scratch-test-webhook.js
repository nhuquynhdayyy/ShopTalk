const app = require('./src/app');
const http = require('http');

const PORT = 3005;
const server = app.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);
  
  try {
    const url = `http://localhost:${PORT}/webhook?hub.mode=subscribe&hub.verify_token=mytoken123&hub.challenge=TEST123`;
    console.log(`Fetching: ${url}`);
    const res = await fetch(url);
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: "${text}"`);
    
    if (res.status === 200 && text === 'TEST123') {
      console.log('✅ TEST PASSED!');
    } else {
      console.error('❌ TEST FAILED!');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    process.exitCode = 1;
  } finally {
    server.close(() => {
      console.log('Test server closed.');
      process.exit(process.exitCode || 0);
    });
  }
});
