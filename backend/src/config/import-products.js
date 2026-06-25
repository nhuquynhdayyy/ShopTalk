const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

/**
 * Script import dữ liệu sản phẩm từ products.json vào database
 * Chạy bằng lệnh: node src/config/import-products.js từ thư mục backend/
 */
async function importProducts() {
  console.log('🚀 Bắt đầu import sản phẩm từ products.json vào database...');

  try {
    // Đọc file products.json
    const productsFilePath = path.join(__dirname, '../../data/products.json');
    if (!fs.existsSync(productsFilePath)) {
      console.error('❌ File products.json không tồn tại!');
      process.exit(1);
    }

    const rawData = fs.readFileSync(productsFilePath, 'utf8');
    const products = JSON.parse(rawData);

    console.log(`📦 Tìm thấy ${products.length} sản phẩm trong file JSON.`);

    // Xóa dữ liệu cũ (nếu có)
    console.log('🗑️  Xóa dữ liệu sản phẩm cũ (nếu có)...');
    await pool.query('DELETE FROM products;');
    console.log('✅ Đã xóa dữ liệu cũ.');

    // Insert từng sản phẩm
    let successCount = 0;
    let errorCount = 0;

    for (const product of products) {
      try {
        const queryText = `
          INSERT INTO products (
            sku, name, category, price_usdc, price_vnd, stock,
            size_options, color_options, description, selling_points, reviews, images
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
          )
          ON CONFLICT (sku) DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            price_usdc = EXCLUDED.price_usdc,
            price_vnd = EXCLUDED.price_vnd,
            stock = EXCLUDED.stock,
            size_options = EXCLUDED.size_options,
            color_options = EXCLUDED.color_options,
            description = EXCLUDED.description,
            selling_points = EXCLUDED.selling_points,
            reviews = EXCLUDED.reviews,
            images = EXCLUDED.images,
            updated_at = CURRENT_TIMESTAMP;
        `;

        const values = [
          product.sku,
          product.name,
          product.category,
          product.price_usdc,
          product.price_vnd,
          product.stock,
          JSON.stringify(product.size_options || []),
          JSON.stringify(product.color_options || []),
          product.description,
          JSON.stringify(product.selling_points || []),
          JSON.stringify(product.reviews || []),
          JSON.stringify(product.images || [])
        ];

        await pool.query(queryText, values);
        console.log(`✅ Imported: ${product.sku} - ${product.name}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Lỗi khi import ${product.sku}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n🎉 Hoàn tất import!');
    console.log(`✅ Thành công: ${successCount} sản phẩm`);
    if (errorCount > 0) {
      console.log(`❌ Lỗi: ${errorCount} sản phẩm`);
    }

    // Kiểm tra kết quả
    const result = await pool.query('SELECT COUNT(*) as total FROM products;');
    console.log(`\n📊 Tổng số sản phẩm trong database: ${result.rows[0].total}`);

  } catch (error) {
    console.error('❌ Lỗi xảy ra trong quá trình import:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔌 Pool kết nối database đã đóng.');
    console.log('✅ Xong!');
  }
}

importProducts();
