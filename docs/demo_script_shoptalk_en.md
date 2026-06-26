# END-TO-END VIDEO DEMO SCRIPT: SHOPTALK
*AI Conversational Voice Sales Agent & Instant Solana Pay Settlement*

**Production Role:** Product Manager & Demo Director
**Video Goal:** Show the ShopTalk product in action, highlighting the key benefits of AI and Web3 (Solana Pay, Off-ramp) in a simple way so that hackathon judges and non-technical viewers alike can grasp the real-world value immediately.
**Estimated Duration:** 3 - 4 minutes.
**Recommended Filming Devices & Layout:**
- **Web Screen (Desktop):** High-definition screen recording of the Storefront (Chat Widget) and the Merchant Dashboard.
- **Phone (Mobile):** Over-the-shoulder close-up camera shot of the user opening the Phantom Wallet on their phone to scan the QR code on the desktop PC.
- **Graphics Overlay:** Add a latency and fee tracker in the corner of the screen to highlight the speed and efficiency of Groq AI and the Solana Blockchain.

---

## 🎬 SCENE OUTLINE
1. **Scene 1: Introduction (0:00 - 0:30)** – The pain points of online merchants & introducing ShopTalk.
2. **Scene 2: Consultation (0:30 - 1:30)** – Hands-free voice consultation via Agora & Groq AI.
3. **Scene 3: Payment (1:30 - 2:15)** – Instant borderless payments with Solana Pay QR.
4. **Scene 4: Fulfillment & Dashboard (2:15 - 3:00)** – Real-time merchant dashboard updates & the "tinh-tinh" chime.
5. **Scene 5: Off-ramp (3:00 - 3:45)** – Cashing out to a Vietnamese bank account (VPBank CAEX pilot) instantly.
6. **Scene 6: Conclusion (3:45 - 4:15)** – The core value proposition of ShopTalk.

---

## 📽️ DETAILED SCENE-BY-SCENE SCRIPT

### SCENE 1: INTRODUCTION
*Duration: 30 seconds. Goal: State the problem and introduce the solution.*

| **Camera Angles & On-screen Action (Video)** | **Voiceover & Dialogues (Audio)** | **Wow Points & Graphics Overlay** |
| :--- | :--- | :--- |
| **0:00 - 0:10**<br>Close-up of a tired online merchant staring at a Zalo/Facebook inbox flooded with repetitive messages: *"Is this available?", "How much?", "What is the shipping fee?"* | **Voiceover (Warm & friendly):**<br>"Are you an online merchant? Have you ever felt overwhelmed answering the same customer questions over and over again, losing potential sales during late nights or busy hours?" | **Graphics:**<br>Red text overlay: **"Lost Customers = Lost Revenue?"** which then shatters. |
| **0:10 - 0:20**<br>Quick cut to a legacy chatbot giving a generic error: The customer asks: *"Is the battery life good on this phone?"*, and the chatbot replies: *"Sorry, I didn't understand your question. Please choose from the menu below."* | **Voiceover:**<br>"Traditional chatbots are too rigid. The moment a customer asks something slightly off-script, they fail..." | **Graphics:**<br>Flashing red **"Chatbot Error ❌"** icon on the legacy chat interface. |
| **0:20 - 0:30**<br>Transition to the sleek and modern ShopTalk web storefront. The "ShopTalk AI" chat widget floats friendly in the bottom-right corner. | **Voiceover:**<br>"That's why we built **ShopTalk** - the next-generation AI Sales Agent with real-time voice, integrated with instant payments on Solana." | **Graphics:**<br>**ShopTalk** logo appears with a premium gold/teal metallic shimmer effect. |

---

### SCENE 2: CONSULTATION (VOICE CHAT WITH AI)
*Duration: 60 seconds. Goal: Showcase Agora (Voice) & Groq AI Speed (Llama 3.3).*

| **Camera Angles & On-screen Action (Video)** | **Voiceover & Dialogues (Audio)** | **Wow Points & Graphics Overlay** |
| :--- | :--- | :--- |
| **0:30 - 0:40**<br>The customer (male, played by Phúc) visits the store and clicks on the floating **Chat Widget**.<br>The customer clicks the green **"Voice call"** button on the widget. | **Voiceover:**<br>"Let's see how easy it is for a customer to enjoy a hands-free shopping experience using just their voice." | **Wow Point 1: Agora Voice Connection**<br>The [VoiceCallUI](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/components/VoiceCallUI.jsx) transitions smoothly. Connection status moves from **CONNECTING** to **CONNECTED** in just **0.5 seconds**. |
| **0:40 - 0:55**<br>The teal waveform on the screen starts pulsing dynamically as Phúc speaks.<br>**Customer (Phúc) says:**<br>*"Hi, do you have the Solana Saga v2 phone in stock? How much is it?"* | **Sound FX:**<br>A soft "Beep" indicating a successful voice channel connection.<br><br>**On-screen Subtitles:**<br>Real-time speech-to-text transcript displays exactly what the customer says (transcribed by Agora ASR). | **Graphics:**<br>Latency indicator: **"Speech-to-Text: Instant Transcription"**. |
| **0:55 - 1:10**<br>The AI Agent instantly replies with a natural voice via Agora TTS (warm voice).<br>**ShopTalk AI replies:**<br>*"Hello Phúc! Yes, we have the Solana Mobile Saga v2 in stock. It features a beautiful AMOLED display, a powerful Snapdragon 8 Gen 2 processor, and is currently priced at a special test price of 0.1 USDC. Would you like to order one?"* | **Voiceover:**<br>"No waiting around. The AI agent understands your intent immediately and responds in under 1 second, powered by ultra-fast Groq AI inference." | **Wow Point 2: Groq AI Speed**<br>Displays response speed: **"Groq LLM Latency: 0.8s"** in the corner.<br>The audience is wowed by the human-like voice response speed without lags. |
| **1:10 - 1:30**<br>**Customer (Phúc) says:**<br>*"Awesome, order one for me. Deliver it to 123 Đường Láng, Hà Nội. My phone number is 0987654321."*<br><br>The chat screen displays the call transcript, and the AI automatically parses the details (Slot filling):<br>- *Product: Solana Mobile Saga v2*<br>- *Quantity: 1*<br>- *Address: 123 Đường Láng, Hà Nội*<br>- *Phone: 0987654321* | **ShopTalk AI replies:**<br>*"Great! I have created an order for Phúc: 1 Solana Mobile Saga v2, total 0.1 USDC. I am generating a Solana Pay QR code on your screen now. You can scan it with your crypto wallet to complete the payment!"* | **Wow Point 3: Auto-Slot Filling**<br>The AI automatically extracts shipping details to call the `createOrder` tool. The customer doesn't have to fill out any form manually.<br>Perfect for hands-free shopping while driving or multitasking. |

---

### SCENE 3: PAYMENT (SOLANA PAY)
*Duration: 45 seconds. Goal: Demonstrate Solana Pay and Phantom wallet.*

| **Camera Angles & On-screen Action (Video)** | **Voiceover & Dialogues (Audio)** | **Wow Points & Graphics Overlay** |
| :--- | :--- | :--- |
| **1:30 - 1:45**<br>The web screen automatically triggers a beautiful payment QR modal [QRModal](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/components/QRModal.jsx) with a glassmorphism frosted effect. It displays the Solana Pay QR code, the order total of **0.10 USDC**, and Phúc's shipping details. | **Voiceover:**<br>"Instantly, a dynamic Solana Pay QR code is generated. The customer does not need to enter card details or type the merchant's bank account number." | **Graphics:**<br>Arrow pointing to the QR code: **"Dynamic Solana Pay QR (Prevents wrong amount inputs)"**. |
| **1:45 - 2:05**<br>Over-the-shoulder shot: The customer holds their phone, opens the **Phantom Wallet** (on Devnet), taps scan, and points the camera at the PC screen.<br>The phone immediately pulls up the bill: **"ShopTalk - 0.1 USDC"**. The customer swipes to confirm the payment (Swipe to Pay). | **Voiceover:**<br>"The customer simply scans and confirms. The USDC stablecoin is transferred directly from the buyer's wallet to the seller's wallet without any credit card processors or transaction middlemen." | **Wow Point 4: Seamless Solana Pay UX**<br>No OTPs, no manual inputs. A simple scan and face/fingerprint authentication on the phone is all it takes. |
| **2:05 - 2:15**<br>The phone screen displays *"Transaction Sent"* with a green checkmark indicating successful confirmation on the Solana Devnet blockchain. | **Voiceover:**<br>"Using the Solana blockchain network, the transaction is validated and finalized on-chain in the blink of an eye." | **Graphics:**<br>**"Solana Block Time: ~400ms"**<br>**"Transaction Fee: ~0.00001$"** (Virtually Free). |

---

### SCENE 4: FULFILLMENT & MERCHANT DASHBOARD
*Duration: 45 seconds. Goal: Show real-time dashboard updates via WebSockets.*

| **Camera Angles & On-screen Action (Video)** | **Voiceover & Dialogues (Audio)** | **Wow Points & Graphics Overlay** |
| :--- | :--- | :--- |
| **2:15 - 2:30**<br>The screen cuts to the [Merchant Dashboard](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/pages/Dashboard.jsx) running on the seller's computer. In the order list, Phúc's order is highlighted in yellow as **"Pending"**. | **Voiceover:**<br>"Meanwhile, on the merchant's end, the dashboard shows the order in a pending state, waiting for on-chain payment." | **Graphics:**<br>Animated data path flowing from the Solana Blockchain to the ShopTalk backend via WebSockets. |
| **2:30 - 2:45**<br>Suddenly, the pending order card changes color to a vibrant green with a **"Paid"** badge.<br>A success banner slides down from the top: *"Order Solana Mobile Saga v2 paid successfully: +0.10 USDC"*. | **Sound FX:**<br>A loud, satisfying bank-like **"Tinh Tinh!"** chime (generated from the codebase audio context).<br><br>**Voiceover:**<br>"And... Tinh Tinh! The moment the block is written on-chain, the system updates the dashboard in real-time. No page refreshes (F5) needed!" | **Wow Point 5: Real-time Auto-Reconciliation**<br>The merchant doesn't need to ask for screenshots of bank transfers. The system verifies the blockchain signature automatically.<br>Eliminates the risk of fake bank transaction receipts. |
| **2:45 - 3:00**<br>Close-up of the dashboard stats: The **USDC Received** total counter increases by **+0.10 USDC**, and the paid order count increases by **+1**. | **Voiceover:**<br>"All funds go straight into the merchant's non-custodial wallet, ensuring complete safety and transparent cash flow." | **Graphics:**<br>Animated coins flying into the wallet icon as the total balance jumps. |

---

### SCENE 5: OFF-RAMP (CASH OUT TO BANK)
*Duration: 45 seconds. Goal: Show CAEX/TCEX pilot VND off-ramp.*

| **Camera Angles & On-screen Action (Video)** | **Voiceover & Dialogues (Audio)** | **Wow Points & Graphics Overlay** |
| :--- | :--- | :--- |
| **3:00 - 3:15**<br>The merchant clicks the **"Withdraw"** button on the paid order card.<br>The [OffRampModal](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/components/OffRampModal.jsx) pops up. On the right, a smooth sinus exchange rate chart [OffRampChart](file:///d:/CONVO%20HACKATHON/ShopTalk/frontend/src/components/OffRampChart.jsx) is displayed.<br>On the left, it shows:<br>- *Balance to withdraw: 0.1 USDC*<br>- *Exchange rate: 25,450 VND/USDC*<br>- *VND Net Received: 2,545 VND* | **Voiceover:**<br>"But how does a local merchant spend this? Easily. ShopTalk integrates with CAEX, a pilot digital asset exchange, to off-ramp stablecoins into Vietnamese Dong instantly." | **Graphics:**<br>Highlighting the conversion: **"0.1 USDC -> 2,545 VND"** and the **"Confirm Withdrawal"** button. |
| **3:15 - 3:30**<br>The merchant selects **"VPBank (CAEX Pilot)"**, enters their bank account number, and clicks the teal **"Confirm Withdrawal"** button.<br>A loading spinner runs for **1.2 seconds**: *"ShopTalk is sending withdrawal request to off-ramp partner"* | **Voiceover:**<br>"Simply choose your local bank, enter the account details, and confirm." | **Graphics:**<br>Sleek loading spinner animation showing progress. |
| **3:30 - 3:45**<br>The screen displays a success message: *"Withdrawal successful! 0.1 USDC converted to 2,545 VND and sent to account 1234567890 at VPBank."*<br>Next to the computer, the merchant's phone vibrates and shows an SMS notification: *"+2,545 VND from CAEX-VPBank"* | **Voiceover:**<br>"In seconds, the crypto is converted and deposited straight into your traditional bank account. The entire sales cycle is closed seamlessly!" | **Wow Point 6: Instant Fiat Off-ramp**<br>A bridge between Web3 and Web2. International clients pay in USDC, and local merchants receive VND in their local bank accounts in seconds. |

---

### SCENE 6: CONCLUSION
*Duration: 30 seconds. Goal: Highlight value proposition and call to action.*

| **Camera Angles & On-screen Action (Video)** | **Voiceover & Dialogues (Audio)** | **Wow Points & Graphics Overlay** |
| :--- | :--- | :--- |
| **3:45 - 4:00**<br>Close-up of the merchant sipping coffee while their phone screen lights up on the table, showing the AI agent automatically taking orders and processing transactions in the background. | **Voiceover:**<br>"ShopTalk automates the entire sales process 24/7—from voice consultation and order placement to on-chain verification and bank cashouts." | **Graphics (Summary of benefits):**<br>- **24/7 Automation**<br>- **Zero Lost Leads**<br>- **Instant Settlement** |
| **4:00 - 4:15**<br>Screen displays the **ShopTalk** logo and slogan:<br>**"ShopTalk - Smart Sales, Instant Cash."** | **Voiceover:**<br>"Bring your retail business into the digital and Web3 era. Try ShopTalk today!" | **Graphics:**<br>Logo shimmers and fades out to black. |

---

## 🛠️ SIMPLE TECH EXPLANATION FOR ALL AUDIENCES
*Can be used in captions or video annotations:*

1. **Agora RTC (Voice Chat):** Instead of typing, customers talk to the bot just like making a phone call to a real human clerk.
2. **Groq Speed (Instant AI):** Most bots take 5–10 seconds to respond. Groq processes LLM requests under 1 second, making conversations feel natural and fluid.
3. **Solana Pay (Fast Crypto Payments):** No credit card numbers or banking logins needed. Scan a QR with a crypto wallet, click pay, and the merchant receives the funds in **0.4 seconds** with negligible fees.
4. **Instant Off-ramp (Cash-out):** Converts stablecoins to Vietnamese Dong (VND) directly into your local bank account at the click of a button.

---

## 🎬 PRODUCTION TIPS FOR THE DIRECTOR

- **Background Music:** Use modern *Corporate Tech* or *Future Bass* music. Let the beat build up during the payment scene and drop when the payment succeeds.
- **Sound FX (SFX):**
  - "Click" sounds for button clicks.
  - A gentle chime when the voice call connects.
  - A crisp, loud **"Tinh Tinh!"** cash register chime when the payment is confirmed.
- **Visual Color Palette:** Stick to bright, modern teal and slate colors. The green "Paid" badge and green indicators should stand out visually.
- **Phone Scan Angle:** Zoom in on the physical phone screen scanning the QR code on the desktop monitor to show that it is a live, functional Web3 integration.
