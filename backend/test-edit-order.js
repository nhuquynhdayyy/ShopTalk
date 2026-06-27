const axios = require('axios');

const BACKEND_URL = 'http://localhost:3000';

async function run() {
  console.log('Starting PATCH /orders/:id API verification test...');

  try {
    // 1. Create a new order first
    console.log('1. Creating a new test order...');
    const createRes = await axios.post(`${BACKEND_URL}/orders`, {
      product_name: 'Test Cotton Hoodie',
      amount: 0.25,
      seller_wallet: '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ',
      customer_name: 'Original Name',
      customer_phone: '0111111111',
      customer_address: 'Original Address'
    });

    if (!createRes.data.success) {
      throw new Error('Failed to create test order');
    }

    const orderId = createRes.data.data.id;
    console.log(`✅ Test order created successfully. ID: ${orderId}`);

    // 2. Perform the PATCH request to update info
    console.log('\n2. Updating customer info via PATCH...');
    const patchRes = await axios.patch(`${BACKEND_URL}/orders/${orderId}`, {
      customer_name: 'Jane Doe',
      customer_phone: '0999888777',
      customer_address: '456 New Road, HCMC, Vietnam'
    });

    console.log('Response Status:', patchRes.status);
    const result = patchRes.data;

    // 3. Validate response
    if (result.success && result.data && result.data.order && result.data.qrCodeImage) {
      console.log('✅ PASS: API returned success status');
      
      const { order, qrCodeImage } = result.data;
      
      if (order.customer_name === 'Jane Doe') {
        console.log('✅ PASS: customer_name updated correctly');
      } else {
        console.error('❌ FAIL: customer_name did not update');
      }

      if (order.customer_phone === '0999888777') {
        console.log('✅ PASS: customer_phone updated correctly');
      } else {
        console.error('❌ FAIL: customer_phone did not update');
      }

      if (order.customer_address === '456 New Road, HCMC, Vietnam') {
        console.log('✅ PASS: customer_address updated correctly');
      } else {
        console.error('❌ FAIL: customer_address did not update');
      }

      if (qrCodeImage.startsWith('data:image/png;base64,')) {
        console.log('✅ PASS: qrCodeImage is a valid base64 data URI');
      } else {
        console.error('❌ FAIL: qrCodeImage is not a base64 image string');
      }

    } else {
      console.error('❌ FAIL: API did not return correct response structure:', result);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  } finally {
    console.log('\nTest finished.');
    process.exit(0);
  }
}

run();
