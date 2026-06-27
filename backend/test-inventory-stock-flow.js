const db = require('./src/config/db');
const ProductModel = require('./src/models/product.model');
const { createOrder, updateOrderStatus } = require('./src/models/order.model');
const { Keypair } = require('@solana/web3.js');

async function run() {
  console.log('🧪 Bắt đầu chạy test tự động Stock Reservation & Restoration Flow...');

  let testProduct = null;
  let originalStock = 0;
  let createdOrderId = null;

  try {
    // 1. Tìm sản phẩm test (Áo Thun Basic Cotton Unisex hoặc SKU: AT-001)
    const productSku = 'AT-001';
    testProduct = await ProductModel.findBySKU(productSku);
    if (!testProduct) {
      throw new Error(`Không tìm thấy sản phẩm với SKU: ${productSku} trong database`);
    }

    originalStock = testProduct.stock;
    console.log(`ℹ️ Sản phẩm test: "${testProduct.name}" (SKU: ${productSku})`);
    console.log(`ℹ️ Tồn kho ban đầu: ${originalStock}`);

    // 2. Tạo đơn hàng mới để test stock reservation
    console.log('\n--- Test 1: Tạo đơn hàng (Pending) -> Giảm stock ---');
    const referenceKey = Keypair.generate().publicKey.toBase58();
    const orderData = {
      reference: referenceKey,
      product_name: testProduct.name, // Khớp chính xác tên canonical
      amount: 0.25,
      seller_wallet: '5hrFH2N3hCRaGNMUbALRhT7R3qWWe9uHMkCFhFa1JReJ',
      status: 'pending',
      customer_name: 'Test Stock Customer',
      customer_phone: '0999000111',
      customer_address: '123 Test Street'
    };

    const newOrder = await createOrder(orderData);
    createdOrderId = newOrder.id;
    console.log(`✅ Đã tạo đơn hàng thành công, ID: ${createdOrderId}`);

    // Kiểm tra stock sau khi tạo đơn
    const productAfterCreate = await ProductModel.findBySKU(productSku);
    console.log(`ℹ️ Tồn kho sau khi tạo đơn: ${productAfterCreate.stock}`);
    if (productAfterCreate.stock === originalStock - 1) {
      console.log('✅ PASS: Tồn kho giảm đi 1 đơn vị');
    } else {
      throw new Error(`FAIL: Tồn kho không giảm đúng. Thực tế: ${productAfterCreate.stock}, Mong đợi: ${originalStock - 1}`);
    }

    // 3. Cho đơn hàng hết hạn để test stock restoration
    console.log('\n--- Test 2: Đơn hàng hết hạn (Expired) -> Hoàn lại stock ---');
    await updateOrderStatus(createdOrderId, 'expired');
    console.log(`✅ Đã cập nhật trạng thái đơn hàng thành 'expired'`);

    // Kiểm tra stock sau khi hết hạn
    const productAfterExpire = await ProductModel.findBySKU(productSku);
    console.log(`ℹ️ Tồn kho sau khi đơn hàng hết hạn: ${productAfterExpire.stock}`);
    if (productAfterExpire.stock === originalStock) {
      console.log('✅ PASS: Tồn kho đã được hoàn lại đầy đủ');
    } else {
      throw new Error(`FAIL: Tồn kho không được hoàn lại. Thực tế: ${productAfterExpire.stock}, Mong đợi: ${originalStock}`);
    }

    // 4. Test chặn đặt hàng khi hết stock
    console.log('\n--- Test 3: Chặn đặt hàng khi tồn kho = 0 ---');
    // Set stock về 0 tạm thời
    await ProductModel.updateStock(testProduct.id, 0);
    console.log(`ℹ️ Đã cập nhật tồn kho tạm thời của sản phẩm về 0`);

    const outOfStockRef = Keypair.generate().publicKey.toBase58();
    try {
      await createOrder({
        ...orderData,
        reference: outOfStockRef
      });
      throw new Error('FAIL: Cho phép tạo đơn hàng dù sản phẩm hết hàng');
    } catch (err) {
      if (err.message === 'Out of stock') {
        console.log('✅ PASS: Hệ thống báo lỗi "Out of stock" thành công và từ chối tạo đơn');
      } else {
        throw err;
      }
    }

  } catch (error) {
    console.error('\n❌ Thất bại: Gặp lỗi trong quá trình test:', error.message);
    console.error(error.stack);
  } finally {
    // Khôi phục lại tồn kho ban đầu
    if (testProduct) {
      try {
        await ProductModel.updateStock(testProduct.id, originalStock);
        console.log(`\n🧹 Khôi phục tồn kho sản phẩm về giá trị ban đầu: ${originalStock}`);
      } catch (err) {
        console.error('Lỗi khi khôi phục tồn kho:', err.message);
      }
    }

    // Đóng pool kết nối DB
    try {
      const { pool } = require('./src/config/db');
      await pool.end();
      console.log('🔌 Đã đóng kết nối database.');
    } catch (_) {}

    console.log('\n--- Hoàn tất test ---');
    process.exit(0);
  }
}

run();
