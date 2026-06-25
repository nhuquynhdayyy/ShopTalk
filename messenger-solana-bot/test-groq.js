require('dotenv').config();
const { analyzeConversation, PRODUCTS } = require('./groqService');

async function runSimulation() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes('your_groq_api_key_here')) {
    console.log("⚠️  LƯU Ý: Vui lòng điền GROQ_API_KEY hợp lệ vào file .env trước khi chạy kiểm thử này!");
    return;
  }

  console.log("==================================================");
  console.log("🧪 BẮT ĐẦU CHẠY GIẢ LẬP HỘI THOẠI VỚI GROQ AI...");
  console.log("==================================================\n");

  // Giả lập session khách hàng
  const session = {
    productName: null,
    price: null,
    customerName: null,
    phone: null,
    address: null,
    history: []
  };

  // Các tin nhắn giả lập của khách hàng gửi theo thứ tự thời gian
  const userMessages = [
    "Xin chào shop, shop có gì bán vậy?",
    "Mình muốn mua cái Áo hoodie",
    "Mình tên là Nguyễn Văn B",
    "Số điện thoại mình là 0912345678, giao qua 234 Trần Hưng Đạo, Quận 1, TP HCM nhé",
    "Xác nhận chốt đơn"
  ];

  for (let i = 0; i < userMessages.length; i++) {
    const text = userMessages[i];
    console.log(`💬 Khách hàng: "${text}"`);
    
    // Lưu vào lịch sử
    session.history.push({ role: 'user', content: text });

    try {
      // Gọi phân tích hội thoại
      const result = await analyzeConversation(session.history, session);
      const { intent, product, customerName, phone, address, reply } = result;

      // Đồng bộ thông tin vào session tương tự như index.js
      if (product) {
        session.productName = product;
        const matched = PRODUCTS.find(p => p.name.toLowerCase() === product.toLowerCase());
        if (matched) session.price = matched.price;
      }
      if (customerName) session.customerName = customerName;
      if (phone) session.phone = phone;
      if (address) session.address = address;

      // In kết quả
      console.log(`🤖 Bot trả lời: "${reply}"`);
      console.log(`📊 [Trạng thái phân tích]`);
      console.log(`   - Intent: ${intent}`);
      console.log(`   - Tên sản phẩm: ${session.productName || 'null'} (${session.price ? session.price + ' SOL' : '0 SOL'})`);
      console.log(`   - Khách hàng: ${session.customerName || 'null'}`);
      console.log(`   - SĐT: ${session.phone || 'null'}`);
      console.log(`   - Địa chỉ: ${session.address || 'null'}`);
      console.log("--------------------------------------------------\n");

      // Lưu câu trả lời của trợ lý vào lịch sử để duy trì context
      session.history.push({ role: 'assistant', content: reply });

    } catch (err) {
      console.error(`❌ Lỗi tại bước ${i + 1}:`, err.message);
      break;
    }
  }

  console.log("🏁 Hoàn thành mô phỏng hội thoại.");
}

runSimulation();
