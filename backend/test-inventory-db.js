/**
 * Test script để kiểm tra inventory service với database
 */
const { getProducts, checkInventory } = require('./src/services/inventory.service');

async function testInventoryService() {
  console.log('🧪 Bắt đầu test Inventory Service với Database...\n');

  try {
    // Test 1: Lấy tất cả sản phẩm
    console.log('📋 Test 1: Lấy tất cả sản phẩm từ database');
    const allProducts = await getProducts();
    console.log(`✅ Tìm thấy ${allProducts.length} sản phẩm`);
    if (allProducts.length > 0) {
      console.log(`   Ví dụ: ${allProducts[0].name} (${allProducts[0].sku})`);
    }
    console.log();

    // Test 2: Tìm kiếm chính xác
    console.log('🔍 Test 2: Tìm kiếm chính xác "Áo Thun Basic"');
    const product1 = await checkInventory('Áo Thun Basic');
    if (product1) {
      console.log(`✅ Tìm thấy: ${product1.name}`);
      console.log(`   SKU: ${product1.sku}`);
      console.log(`   Giá: ${product1.price_usdc} USDC`);
      console.log(`   Tồn kho: ${product1.stock}`);
    } else {
      console.log('❌ Không tìm thấy sản phẩm');
    }
    console.log();

    // Test 3: Tìm kiếm không dấu
    console.log('🔍 Test 3: Tìm kiếm không dấu "ao thun"');
    const product2 = await checkInventory('ao thun');
    if (product2) {
      console.log(`✅ Tìm thấy: ${product2.name}`);
    } else {
      console.log('❌ Không tìm thấy sản phẩm');
    }
    console.log();

    // Test 4: Fuzzy search
    console.log('🔍 Test 4: Fuzzy search "quan jins" (gõ sai chính tả)');
    const product3 = await checkInventory('quan jins');
    if (product3) {
      console.log(`✅ Tìm thấy: ${product3.name}`);
    } else {
      console.log('❌ Không tìm thấy sản phẩm');
    }
    console.log();

    // Test 5: Tìm theo category
    console.log('🔍 Test 5: Tìm "váy midi"');
    const product4 = await checkInventory('váy midi');
    if (product4) {
      console.log(`✅ Tìm thấy: ${product4.name}`);
      console.log(`   Màu sắc: ${product4.color_options?.join(', ')}`);
      console.log(`   Size: ${product4.size_options?.join(', ')}`);
    } else {
      console.log('❌ Không tìm thấy sản phẩm');
    }
    console.log();

    console.log('🎉 Hoàn tất test!');
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error(error.stack);
  } finally {
    // Đóng pool connection
    const { pool } = require('./src/config/db');
    await pool.end();
    console.log('\n🔌 Đã đóng kết nối database.');
  }
}

testInventoryService();
