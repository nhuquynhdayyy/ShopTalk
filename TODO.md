# KẾ HOẠCH HOÀN THIỆN & SỬA LỖI HỆ THỐNG ĐA NGÔN NGỮ (I18N)

> **Trạng thái hiện tại:** 🔴 **CHƯA HOÀN THÀNH**
> 
> **Yêu cầu từ Tech Lead:** Tập trung cao độ để sửa dứt điểm các lỗi logic ở Backend liên quan đến xử lý Prompt của AI Agent (Chat & Voice) và cấu trúc dữ liệu sản phẩm, đồng thời giải quyết triệt để lỗi text cứng còn sót ở Frontend.

---

## 🚨 CẢNH BÁO LỖI NGHIÊM TRỌNG (CẦN SỬA NGAY)

Trong file [api.js](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/api.js#L40-L59), hai hàm `getAgoraToken` và `startAgoraAgent` đang sử dụng sai đối tượng `api` để gọi request (gây ra lỗi **`ReferenceError: api is not defined`** và crash ứng dụng khi chạy).

### Hướng dẫn sửa nhanh tại `frontend/src/api.js`:
Chuyển đổi toàn bộ lệnh gọi từ `api.post(...)` hoặc `api.get(...)` thành `http.post(...)` hoặc `http.get(...)`:

```diff
  const getAgoraToken = async (channelName, uid) => {
-   const response = await api.post('/agora/token', { channelName, uid });
+   const response = await http.post('/agora/token', { channelName, uid });
    return response.data;
  };
  
  const startAgoraAgent = async (channelName, language = 'vi', sessionId = null) => {
-   const response = await api.post('/agora/start-agent', { 
+   const response = await http.post('/agora/start-agent', { 
      channelName, 
      agentUid: 999,
      language,
      sessionId
    });
    return response.data;
  };
```

---

## DANH SÁCH NHIỆM VỤ CHI TIẾT (TASK 1 - 5)

### 🌐 TASK 1: Hoàn thiện hệ thống quản lý bản dịch (i18n) cho Frontend
*   [ ] Thay thế các đoạn text cứng còn sót lại sau bằng hàm dịch `t()`:
    *   Nhãn `"👤 Nhân viên hỗ trợ"` tại [ChatWidget.jsx](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/pages/ChatWidget.jsx#L262).
    *   Các đoạn text cứng trong Floating Live Chat của chủ shop tại [Dashboard.jsx](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/pages/Dashboard.jsx#L515-L554) gồm: `"Đóng"`, `"Khách hàng"`, `"Bạn (Chủ shop)"`, `placeholder="Nhập câu trả lời..."`, nút `"Gửi"`.
    *   Các nhãn thô và text cứng `"Voice transcript - "` trong [TranscriptBubble.jsx](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/components/TranscriptBubble.jsx#L4-L37).
*   [ ] Sửa lỗi gán giá trị thô khi click các gợi ý câu hỏi (Suggestion Prompts) trong [ChatWidget.jsx](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/pages/ChatWidget.jsx#L567-L569) để gán chuỗi đã dịch tương ứng.
*   [ ] Dịch động tin nhắn chào mừng ban đầu (`mockMessages` dòng 12-18 trong `ChatWidget.jsx`).

#### Code mẫu tham khảo cho `TranscriptBubble.jsx`:
```javascript
import { useTranslation } from 'react-i18next';

function TranscriptBubble({ message }) {
  const { t } = useTranslation();
  const isCustomer = message.role === 'user' || message.sender === 'user';
  const sender = message.sender || (message.role === 'assistant' ? 'ai' : message.role);
  
  const senderLabels = {
    user: t('chat.staff.customer_label', 'Khách hàng'),
    ai: 'AI',
    assistant: 'AI',
    agent: t('chat.staff.agent_label', 'Nhân viên')
  };

  return (
    // ...
    <span>{t('chat.voice.transcript_title', 'Voice transcript')} - {senderLabels[sender] || senderLabels.ai}</span>
    // ...
  );
}
```

#### Code mẫu tham khảo sửa Suggestion Prompts (`ChatWidget.jsx`):
```javascript
  const handlePromptClick = (prompt) => {
    // Sử dụng i18n key để gán chuỗi đã dịch vào ô nhập liệu
    setInputValue(t(`chat.prompts.${prompt}`, prompt));
  };
```

---

### 🤖 TASK 2: Đồng bộ ngôn ngữ cho AI Agent (Chat Text)
*   [ ] Cập nhật Frontend truyền state `language` khi gọi API gửi tin nhắn tới AI.
*   [ ] Cập nhật Router backend `/chat` nhận tham số `language` từ request body và truyền vào hàm `chat()`.
*   [ ] Cập nhật Hàm `chat()` và `getOrCreateSession()` trong `ai.service.js` nhận tham số `language` để áp dụng dynamic prompt (`SYSTEM_PROMPT` cho tiếng Việt, `SYSTEM_PROMPT_EN` cho tiếng Anh).

#### Code mẫu sửa Frontend (`ChatWidget.jsx`):
```javascript
// Dòng ~526
response = await api.sendChatMessage(text, sessionId, language); // Truyền thêm language từ state
```

#### Code mẫu sửa Backend Router (`backend/src/routes/ai.routes.js`):
```javascript
router.post('/chat', async (req, res) => {
  const { message, language } = req.body; // Bổ sung language
  let { sessionId } = req.body;
  // ...
  const result = await chat(sessionId, message, language || 'vi'); // Truyền vào service
  // ...
});
```

#### Code mẫu sửa Backend Service (`backend/src/services/ai.service.js`):
```javascript
const getOrCreateSession = (sessionId, language = 'vi') => {
  if (!chatSessions.has(sessionId)) {
    const systemPrompt = language.startsWith('en') ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT;
    chatSessions.set(sessionId, [
      { role: 'system', content: systemPrompt }
    ]);
  }
  return chatSessions.get(sessionId);
};

const chat = async (sessionId, userMessage, language = 'vi') => {
  // ...
  const sessionMessages = getOrCreateSession(sessionId, language);
  // ...
};
```

---

### 🎙️ TASK 3: Đồng bộ ngôn ngữ cho Agora Voice Call (ASR & TTS)
*   [ ] Cập nhật Frontend Hook `useAgoraVoice.js` truyền tham số `language` và `sessionId` của phiên chat lên API `/api/ai/start-agent`.
*   [ ] Cập nhật Service backend `startAgoraAgent` trong `ai.service.js` thay đổi động các thuộc tính của Agora Agent dựa trên `language`:
    *   ASR: `'en-US'` hoặc `'vi-VN'`
    *   TTS: `'en-US-JennyNeural'` hoặc `'vi-VN-NamMinhNeural'` (hoặc `'vi-VN-HoaiMyNeural'`)
    *   System Prompt & Lời chào (Greeting Message) tương ứng với ngôn ngữ được truyền vào.
*   [ ] Đồng bộ ngôn ngữ trong file [agora.routes.js](file:///d:/CONVO%20HACKATHON/ShopTalk/backend/src/routes/agora.routes.js) ở Webhook xử lý thoại để trả về văn bản dịch tiếng Anh khi khách nói tiếng Anh.

#### Code mẫu sửa Frontend Hook (`useAgoraVoice.js`):
```javascript
// Thay đổi hàm khởi tạo để nhận ngôn ngữ & sessionId
const joinChannel = async (language = 'vi', sessionId = null) => {
  // ...
  await api.http.post('/api/ai/start-agent', { channelName, language, sessionId });
  // ...
};
```

#### Code mẫu cấu hình Agora Agent động (`ai.service.js`):
```javascript
const startAgoraAgent = async (channelName, agentUid = 999, language = 'vi', sessionId = null) => {
  // ...
  const isEn = language.startsWith('en');
  const asrLanguage = isEn ? 'en-US' : 'vi-VN';
  const ttsVoice = isEn ? 'en-US-JennyNeural' : 'vi-VN-NamMinhNeural';
  const greeting = isEn 
    ? 'Hello! I am Mia, your AI Sales Assistant. What kind of outfit are you looking for today?'
    : 'Dạ, ShopTalk xin chào anh/chị! Em là Mia, nhân viên tư vấn thời trang của shop...';
  const systemPrompt = isEn ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_VOICE;

  const body = {
    name: agentName,
    properties: {
      channel: channelName,
      token: agentToken,
      agent_rtc_uid: String(agentUid),
      remote_rtc_uids: ['*'],
      asr: {
        vendor: 'ares',
        language: asrLanguage, // Động hóa
        params: {}
      },
      llm: {
        vendor: 'custom',
        url: `${ngrokUrl}/api/agora/llm-webhook?sessionId=${encodeURIComponent(sessionId || channelName)}&language=${language}`, // Đưa language vào webhook query
        params: { model: 'llama-3.3-70b-versatile' },
        greeting_message: greeting, // Động hóa
        system_messages: [
          { role: 'system', content: systemPrompt } // Động hóa
        ]
      },
      tts: {
        vendor: 'microsoft',
        credential_name: 'Azure_Voice',
        params: {
          voice_name: ttsVoice, // Động hóa
          key: process.env.AZURE_TTS_KEY,
          region: process.env.AZURE_TTS_REGION
        }
      },
      // ...
    }
  };
  // ...
};
```

---

### 📦 TASK 4: Hỗ trợ đa ngôn ngữ cho dữ liệu sản phẩm (Products Data)
*   [ ] Cập nhật cấu trúc của file dữ liệu [products.json](file:///d:/CONVO%20HACKATHON/ShopTalk/backend/data/products.json) bằng cách thêm trường `translations` (chứa các bản dịch `name` và `description` cho `'vi'` và `'en'`).
*   [ ] Cập nhật file Migration database [migrate.js](file:///d:/CONVO%20HACKATHON/ShopTalk/backend/src/config/migrate.js) để thêm cột `translations JSONB` và chạy lệnh cập nhật database.
*   [ ] Cập nhật file import [import-products.js](file:///d:/CONVO%20HACKATHON/ShopTalk/backend/src/config/import-products.js) để lưu được trường `translations` từ JSON vào database.
*   [ ] Sửa hàm `getProducts` và `checkInventory` tại [inventory.service.js](file:///d:/CONVO%20HACKATHON/ShopTalk/backend/src/services/inventory.service.js) để tự động trả về thông tin sản phẩm đã được map tương ứng theo ngôn ngữ được gửi từ client.

#### Cấu trúc sản phẩm mới trong `products.json`:
```json
{
  "id": "prod-at-001",
  "sku": "AT-001",
  "name": "Áo Thun Basic Cotton Unisex",
  "price_usdc": 0.25,
  "description": "Áo thun basic chất liệu cotton 100% thoáng mát...",
  "translations": {
    "vi": {
      "name": "Áo Thun Basic Cotton Unisex",
      "description": "Áo thun basic chất liệu cotton 100% thoáng mát..."
    },
    "en": {
      "name": "Unisex Basic Cotton T-Shirt",
      "description": "Basic 100% cotton T-shirt, breathable and comfortable..."
    }
  }
}
```

#### Sửa logic map ngôn ngữ sản phẩm (`inventory.service.js`):
```javascript
const getProducts = async (language = 'vi') => {
  try {
    const products = await ProductModel.findAll();
    return products.map(p => {
      if (p.translations && p.translations[language]) {
        return {
          ...p,
          name: p.translations[language].name || p.name,
          description: p.translations[language].description || p.description
        };
      }
      return p;
    });
  } catch (error) {
    console.error('Lỗi khi đọc sản phẩm:', error.message);
    return [];
  }
};
```

---

### 📱 TASK 5: Cải thiện trải nghiệm chuyển đổi ngôn ngữ (UX)
*   [ ] Gửi API signal thông báo sang Backend khi người dùng chuyển đổi ngôn ngữ trên giao diện để cập ngữ cảnh tiếp theo.
*   [ ] Thêm logic phát hiện nếu người dùng đang trong Voice Call (`isInCall === true`) mà bấm đổi ngôn ngữ: hiển thị Confirm Modal hỏi người dùng có muốn dừng cuộc gọi và bắt đầu cuộc gọi mới bằng ngôn ngữ kia không.

#### Hướng dẫn xử lý thay đổi ngôn ngữ khi đang gọi thoại (`App.jsx`):
```javascript
  const handleLanguageChange = (lng) => {
    // Giả sử có cách truy cập trạng thái cuộc gọi từ ChatWidget (hoặc qua Context/State chung)
    if (isInCall) {
      const confirmRestart = window.confirm(
        lng === 'en' 
          ? 'Do you want to switch language and restart the voice call?' 
          : 'Bạn có muốn chuyển đổi ngôn ngữ và bắt đầu lại cuộc gọi không?'
      );
      if (confirmRestart) {
        // Gọi hàm kết thúc cuộc gọi cũ
        // Đổi ngôn ngữ
        // Khởi động lại cuộc gọi mới
      } else {
        return; // Hủy chuyển ngôn ngữ
      }
    }
    
    i18n.changeLanguage(lng);
    sessionStorage.setItem('shoptalk_language', lng);
    setIsLangMenuOpen(false); 
  };
```

---

## HƯỚNG DẪN KIỂM THỬ (SELF-TESTING)

Các thành viên sau khi hoàn thành việc fix code bắt buộc phải chạy các bước kiểm thử sau để đảm bảo chất lượng:

1.  **Kiểm tra Khởi động (Build & Run)**:
    *   Chạy backend: `npm start` trong thư mục `backend/`, đảm bảo không có lỗi kết nối RPC, DB và các file prompt.
    *   Chạy frontend: `npm run dev` trong thư mục `frontend/`, kiểm tra xem web có chạy bình thường tại port `5173`.
2.  **Kiểm tra Giao diện (Static UI)**:
    *   Tại Header, click chọn **English** -> Kiểm tra xem toàn bộ thanh điều hướng, các nút bấm, text trong hộp chat, các badge và bảng điều khiển có dịch sang Tiếng Anh hay không.
    *   F5 lại trang, kiểm tra xem ngôn ngữ được chọn có được lưu lại và giữ nguyên trạng thái cũ nhờ `sessionStorage` không.
3.  **Kiểm tra Chat AI**:
    *   Chuyển sang Tiếng Anh -> Gõ `"Hello"`. AI phải phản hồi lại bằng Tiếng Anh dựa trên prompt tiếng Anh.
    *   Hỏi thông tin sản phẩm bằng tiếng Anh -> AI phải trả về tên sản phẩm bằng tiếng Anh (lấy từ dữ liệu `translations` của products).
    *   Thực hiện chốt đơn: AI phải hỏi bằng tiếng Anh lần lượt các thông tin: *Name*, *Phone*, và *Address*.
4.  **Kiểm tra Voice Call**:
    *   Click bắt đầu Voice Call khi giao diện đang ở Tiếng Anh. 
    *   Nghe lời chào đầu tiên của AI Agent (phải là tiếng Anh: *"Hello! I am Mia..."*).
    *   Nói chuyện bằng tiếng Anh và xem transcript trên chat box hiển thị chính xác ngôn ngữ Anh.
