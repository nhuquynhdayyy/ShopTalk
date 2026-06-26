const Groq = require('groq-sdk');

// Danh sách sản phẩm mẫu bán tại cửa hàng Queen Shop
const PRODUCTS = [
  { name: "Áo thun basic", price: 0.05 },   // Giá trị tính bằng SOL
  { name: "Áo hoodie", price: 0.1 },
  { name: "Quần jean", price: 0.12 },
  { name: "Váy hoa", price: 0.08 }
];

// Khởi tạo client Groq SDK
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

/**
 * Gửi lịch sử hội thoại và trạng thái session hiện tại lên Groq AI để phân tích thực thể và ý định.
 * 
 * @param {Array} history - Lịch sử hội thoại dạng [ { role: 'user'|'assistant', content: '...' } ]
 * @param {Object} currentSession - Trạng thái session của khách hàng hiện tại
 * @returns {Promise<Object>} Object chứa: intent, product, customerName, phone, address, reply
 */
async function analyzeConversation(history, currentSession) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.includes('your_groq_api_key_here')) {
      throw new Error("Chưa cấu hình GROQ_API_KEY hợp lệ trong file .env");
    }

    // Xây dựng system prompt hướng dẫn chi tiết cho Groq AI
    const systemPrompt = `Bạn là trợ lý bán hàng tự động (AI Assistant) vô cùng thân thiện của Queen Shop.
Nhiệm vụ của bạn là tư vấn sản phẩm, thu thập đầy đủ thông tin giao hàng của khách và hướng dẫn thanh toán qua Solana Pay.

Đây là danh sách sản phẩm mẫu của Queen Shop:
${PRODUCTS.map(p => `- ${p.name}: ${p.price} SOL`).join('\n')}

Trạng thái thông tin đơn hàng hiện tại của khách hàng này (lưu từ session bộ nhớ):
- Sản phẩm đã chọn: ${currentSession.productName || 'Chưa chọn'}
- Tên khách hàng: ${currentSession.customerName || 'Chưa có'}
- Số điện thoại: ${currentSession.phone || 'Chưa có'}
- Địa chỉ nhận hàng: ${currentSession.address || 'Chưa có'}

HƯỚNG DẪN XỬ LÝ VÀ PHẢN HỒI:
1. Phân tích tin nhắn của khách hàng và xác định "intent" (ý định):
   - "greeting": Chào hỏi ban đầu khi khách bắt đầu chat.
   - "browse": Khách muốn hỏi danh sách sản phẩm, giá cả, hoặc tìm hiểu shop có gì.
   - "order": Khách muốn đặt hàng, hoặc đang cung cấp các thông tin giao hàng (Tên, SĐT, Địa chỉ). Bạn cần dẫn dắt khách hàng cung cấp từng thông tin một cách tự nhiên.
   - "confirm": Khách hàng đồng ý chốt đơn hàng và tiến hành thanh toán (ví dụ khách nhắn: "Xác nhận", "Đúng rồi", "Thanh toán đi", "Mua", v.v.) SAU KHI tất cả thông tin đơn hàng (Sản phẩm + Tên + SĐT + Địa chỉ) đã được thu thập đầy đủ.
   - "other": Câu hỏi ngoài lề không liên quan.

2. Trích xuất thông tin (Entity Extraction) từ tin nhắn mới nhất để cập nhật đơn hàng:
   - "product": Tìm kiếm xem khách hàng có chỉ định sản phẩm cụ thể nào thuộc danh sách trên không. Trả về đúng tên sản phẩm ở danh sách (ví dụ: "Áo hoodie") hoặc null.
   - "customerName": Trích xuất tên của khách nếu khách giới thiệu hoặc cung cấp thông tin giao hàng.
   - "phone": Trích xuất số điện thoại (chuỗi số).
   - "address": Trích xuất địa chỉ giao nhận.
   * LƯU Ý: Nếu các thông tin này đã có trong trạng thái đơn hàng hiện tại ở trên, hãy GIỮ NGUYÊN trừ khi khách hàng nói rõ họ muốn thay đổi thông tin đó.

3. Tạo phản hồi "reply" bằng tiếng Việt:
   - Nếu khách chưa chọn sản phẩm: Giới thiệu các sản phẩm của shop kèm mức giá SOL.
   - Nếu đã chọn sản phẩm nhưng thiếu thông tin giao hàng: Hãy hỏi một cách lịch sự để lấy thông tin còn thiếu tiếp theo (Hỏi Tên trước -> sau đó đến SĐT -> sau đó đến Địa chỉ). Không hỏi dồn dập cùng lúc.
   - Nếu đã đủ tất cả thông tin đơn hàng: Tóm tắt lại đơn hàng (Sản phẩm, Giá, Tên khách, SĐT, Địa chỉ) và hỏi khách có "Xác nhận" để chuyển sang thanh toán hay không.
   - Nếu khách đồng ý xác nhận đơn và thông tin đã hoàn tất đầy đủ: Ghi nhận intent = "confirm", viết câu reply ngắn gọn báo rằng bot đang gửi mã QR Solana Pay để thanh toán.

QUY TẮC PHẢN HỒI BẮT BUỘC:
Bạn chỉ được trả về duy nhất một chuỗi JSON hợp lệ. KHÔNG bọc JSON trong khối mã markdown (\`\`\`json ... \`\`\`), không viết thêm lời dẫn giải thích hay bất cứ văn bản nào bên ngoài JSON.

Cấu trúc JSON phản hồi như sau:
{
  "intent": "greeting|browse|order|confirm|other",
  "product": "Tên sản phẩm (hoặc null)",
  "customerName": "Tên khách hàng (hoặc null)",
  "phone": "Số điện thoại (hoặc null)",
  "address": "Địa chỉ giao nhận (hoặc null)",
  "reply": "Nội dung phản hồi gửi tới khách hàng"
}`;

    // Lắp ghép messages gửi lên API
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ];

    console.log(`[Groq] Đang gọi model llama-3.3-70b-versatile để phân tích...`);
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0.2 // Thiết lập nhiệt độ thấp để nhận kết quả phân tích nhất quán
    });

    const responseContent = completion.choices[0].message.content.trim();
    console.log(`[Groq] Phản hồi JSON nhận được:`, responseContent);

    // Parse JSON kết quả
    const parsedResult = JSON.parse(responseContent);
    return parsedResult;
  } catch (error) {
    console.error('[Groq Service] Lỗi khi xử lý hội thoại với Groq:', error);
    throw error;
  }
}

module.exports = {
  PRODUCTS,
  analyzeConversation
};
