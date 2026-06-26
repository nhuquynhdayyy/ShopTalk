const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });

const { chat, executeTool, sessionLanguages, mockChatFlow } = require('./src/services/ai.service');
const { checkInventory } = require('./src/services/inventory.service');

async function run() {
  console.log('=== RUNNING SCRATCH TEST FOR BILINGUAL AND CANONICAL CHANGES ===\n');

  // Set languages
  sessionLanguages.set('session-en-1', 'en');
  sessionLanguages.set('session-vi-1', 'vi');
  sessionLanguages.set('session-en-2', 'en');
  sessionLanguages.set('session-vi-2', 'vi');
  sessionLanguages.set('session-en-3', 'en');
  sessionLanguages.set('session-vi-3', 'vi');

  // Test 1: executeTool('check_inventory', ...) in English (found: false)
  console.log('Test 1: check_inventory found: false in English...');
  const res1 = await executeTool('check_inventory', { product_name: 'flying shoes' }, 'session-en-1');
  console.log('Result:', res1);
  const parsed1 = JSON.parse(res1);
  if (!parsed1.found && parsed1.message === 'Product not found in inventory.') {
    console.log('✅ Test 1 Passed!');
  } else {
    console.error('❌ Test 1 Failed!', parsed1);
  }
  console.log('--------------------------------------------------\n');

  // Test 2: executeTool('check_inventory', ...) in Vietnamese (found: false)
  console.log('Test 2: check_inventory found: false in Vietnamese...');
  const res2 = await executeTool('check_inventory', { product_name: 'giay bay' }, 'session-vi-1');
  console.log('Result:', res2);
  const parsed2 = JSON.parse(res2);
  if (!parsed2.found && parsed2.message === 'Không tìm thấy sản phẩm trong kho.') {
    console.log('✅ Test 2 Passed!');
  } else {
    console.error('❌ Test 2 Failed!', parsed2);
  }
  console.log('--------------------------------------------------\n');

  // Test 3: executeTool('create_order', ...) in English (found: false / not in stock)
  console.log('Test 3: create_order found: false in English...');
  const res3 = await executeTool('create_order', {
    product_name: 'flying shoes',
    amount: 10,
    customer_name: 'John',
    customer_phone: '123456',
    customer_address: 'Main St'
  }, 'session-en-2');
  console.log('Result:', res3);
  const parsed3 = JSON.parse(res3);
  if (parsed3.message === 'Sorry, we couldn\'t find the product "flying shoes" in stock.') {
    console.log('✅ Test 3 Passed!');
  } else {
    console.error('❌ Test 3 Failed!', parsed3);
  }
  console.log('--------------------------------------------------\n');

  // Test 4: executeTool('create_order', ...) in Vietnamese (found: false / not in stock)
  console.log('Test 4: create_order found: false in Vietnamese...');
  const res4 = await executeTool('create_order', {
    product_name: 'giay bay',
    amount: 10,
    customer_name: 'Minh',
    customer_phone: '123456',
    customer_address: 'Hanoi'
  }, 'session-vi-2');
  console.log('Result:', res4);
  const parsed4 = JSON.parse(res4);
  if (parsed4.message === 'Không thể tạo đơn hàng vì không tìm thấy sản phẩm "giay bay" trong kho.') {
    console.log('✅ Test 4 Passed!');
  } else {
    console.error('❌ Test 4 Failed!', parsed4);
  }
  console.log('--------------------------------------------------\n');

  // Test 5: mockChatFlow in English (Greeting)
  console.log('Test 5: mockChatFlow English greeting...');
  const messages5 = [{ role: 'system', content: 'system prompt' }];
  const res5 = await mockChatFlow(messages5, 'hello', 'session-en-5', 'en');
  console.log('Result reply:', res5.reply);
  if (res5.reply.includes('Hi there! Welcome to the **ShopTalk** store!')) {
    console.log('✅ Test 5 Passed!');
  } else {
    console.error('❌ Test 5 Failed!');
  }
  console.log('--------------------------------------------------\n');

  // Test 6: mockChatFlow in Vietnamese (Greeting)
  console.log('Test 6: mockChatFlow Vietnamese greeting...');
  const messages6 = [{ role: 'system', content: 'system prompt' }];
  const res6 = await mockChatFlow(messages6, 'xin chao', 'session-vi-6', 'vi');
  console.log('Result reply:', res6.reply);
  if (res6.reply.includes('Dạ cửa hàng **ShopTalk** xin chào anh/chị!')) {
    console.log('✅ Test 6 Passed!');
  } else {
    console.error('❌ Test 6 Failed!');
  }
  console.log('--------------------------------------------------\n');

  // Test 7: mockChatFlow English Catalog
  console.log('Test 7: mockChatFlow English Catalog...');
  const messages7 = [{ role: 'system', content: 'system prompt' }];
  const res7 = await mockChatFlow(messages7, 'show me catalog', 'session-en-7', 'en');
  console.log('Result reply:', res7.reply);
  if (res7.reply.includes('Hi there! Here are the products we currently have!')) {
    console.log('✅ Test 7 Passed!');
  } else {
    console.error('❌ Test 7 Failed!');
  }
  console.log('--------------------------------------------------\n');

  // Test 8: checkInventory product translation canonical_name verification
  console.log('Test 8: checkInventory canonical_name check...');
  const res8 = await checkInventory('basic cotton unisex t-shirt', 'en');
  console.log('Result name:', res8.name);
  console.log('Result canonical_name:', res8.canonical_name);
  if (res8.found && res8.name === 'Basic Cotton Unisex T-Shirt' && res8.canonical_name === 'Áo Thun Basic Cotton Unisex') {
    console.log('✅ Test 8 Passed!');
  } else {
    console.error('❌ Test 8 Failed!', res8);
  }
  console.log('--------------------------------------------------\n');

  process.exit(0);
}

run().catch(err => {
  console.error('Error running scratch tests:', err);
  process.exit(1);
});
