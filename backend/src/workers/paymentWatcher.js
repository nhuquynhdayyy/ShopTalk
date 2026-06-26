/**
 * paymentWatcher.js — Background worker tự động đối soát thanh toán Solana Pay
 *
 * Cách hoạt động (theo kiến trúc ShopTalk mục 6.4):
 *  - Mỗi POLL_INTERVAL ms: lấy danh sách đơn hàng pending từ DB
 *  - Gọi verifyPayment() cho từng đơn hàng
 *  - Nếu verified → cập nhật status = 'paid' trong DB + in log nổi bật
 *  - Nếu bị Rate Limit (429) → tự động tăng delay (Exponential Backoff) và thử lại
 *  - Backoff giảm dần về bình thường khi RPC hết bị giới hạn
 */

const { getPendingOrders, updateOrderStatus } = require('../models/order.model');
const { verifyPayment } = require('../services/verify.service');
const { emitOrderPaid } = require('../websocket/socket.server');

// ─── Cấu hình ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS   = 3000;   // Interval mặc định: 3 giây
const BACKOFF_MIN_MS     = 3000;   // Backoff tối thiểu (= poll bình thường)
const BACKOFF_MAX_MS     = 60000;  // Backoff tối đa: 60 giây
const BACKOFF_MULTIPLIER = 2;      // Nhân đôi mỗi lần bị rate limit

// ─── State ──────────────────────────────────────────────────────────────────

let currentIntervalMs = POLL_INTERVAL_MS;  // Interval hiện tại (có thể tăng khi backoff)
let watcherTimer      = null;              // Tham chiếu tới setTimeout hiện tại
let isRunning         = false;             // Tránh chạy song song 2 vòng poll

// ─── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In log với màu nổi bật ra terminal */
const logSuccess = (orderId, signature) => {
  const border = '═'.repeat(60);
  console.log(`\n\x1b[42m\x1b[30m ${border} \x1b[0m`);
  console.log(`\x1b[32m✅ [SUCCESS] Order #${orderId} has been verified on-chain!\x1b[0m`);
  console.log(`\x1b[36m   TX Signature : ${signature}\x1b[0m`);
  console.log(`\x1b[42m\x1b[30m ${border} \x1b[0m\n`);
};

const logRateLimit = (nextDelayMs) => {
  console.warn(`\x1b[33m⚠️  [Watcher] RPC rate limit — backoff ${nextDelayMs / 1000}s trước lần poll tiếp theo\x1b[0m`);
};

// ─── Core poll logic ─────────────────────────────────────────────────────────

/**
 * Thực hiện một vòng poll: kiểm tra tất cả đơn hàng pending
 * @returns {{ rateLimited: boolean }} Trả về flag để điều chỉnh backoff
 */
const runOnePoll = async () => {
  let hitRateLimit = false;

  try {
    const pendingOrders = await getPendingOrders();

    if (pendingOrders.length === 0) return { rateLimited: false };

    console.log(`[Watcher] 🔍 Đang kiểm tra ${pendingOrders.length} đơn hàng pending...`);

    for (const order of pendingOrders) {
      try {
        const result = await verifyPayment(order);

        if (result.success) {
          // ✅ Thanh toán thành công — cập nhật DB ngay lập tức
          const updatedOrder = await updateOrderStatus(order.id, 'paid', result.signature);
          if (updatedOrder) {
            emitOrderPaid(updatedOrder);
            logSuccess(order.id, result.signature);

            // Trigger AI Agent to speak congratulations and emit transcript to UI
            try {
              const { orderSessions, triggerAgentSpeak } = require('../services/ai.service');
              const sessionId = orderSessions.get(updatedOrder.id);
              if (sessionId) {
                const congratulationText = 'Tuyệt vời! Mình đã nhận được thanh toán. Đơn hàng của bạn đang được xử lý ngay đây.';
                await triggerAgentSpeak(sessionId, congratulationText);

                const { emitTranscriptReceived } = require('../websocket/socket.server');
                emitTranscriptReceived({
                  sessionId,
                  sender: 'assistant',
                  transcript: congratulationText,
                  type: 'voice',
                  id: 'ai-congratulation-' + Date.now()
                });
              }
            } catch (err) {
              console.error('[PaymentWatcher] Lỗi khi trigger AI nói chúc mừng:', err.message);
            }
          }
        } else if (result.error === 'PAYMENT_MISMATCH') {
          await updateOrderStatus(order.id, 'payment_mismatch', result.signature || null);
          console.warn(
            `[Watcher] PAYMENT_MISMATCH order #${order.id}: expected ${result.expectedAmount}, received ${result.receivedAmount}, signature ${result.signature || 'unknown'}`
          );
        } else if (result.error === 'PAYMENT_NOT_FOUND') {
          // Chưa có thanh toán — bỏ qua, tiếp tục đơn hàng kế tiếp
        } else if (result.error === 'RATE_LIMITED') {
          hitRateLimit = true;
          break; // Dừng vòng lặp ngay, không kiểm tra đơn tiếp theo
        }
        // VALIDATION_FAILED: log lỗi nhưng vẫn tiếp tục đơn hàng khác
        else {
          console.error(`[Watcher] ❌ Lỗi xác thực đơn #${order.id}: ${result.message}`);
        }
      } catch (orderErr) {
        // Lỗi không mong muốn cho một đơn hàng — log và tiếp tục
        console.error(`[Watcher] ❌ Lỗi khi xử lý đơn #${order.id}:`, orderErr.message);
      }

      // Nhỏ delay giữa các đơn hàng để tránh burst requests
      if (pendingOrders.length > 1) await sleep(500);
    }
  } catch (pollErr) {
    // Lỗi ở cấp DB hoặc nghiêm trọng hơn
    const isRateLimit = pollErr.message && (
      pollErr.message.includes('429') ||
      pollErr.message.includes('rate limit') ||
      pollErr.message.includes('Too Many Requests')
    );
    if (isRateLimit) {
      hitRateLimit = true;
    } else {
      console.error('[Watcher] ❌ Lỗi poll nghiêm trọng:', pollErr.message);
    }
  }

  return { rateLimited: hitRateLimit };
};

// ─── Backoff scheduler ───────────────────────────────────────────────────────

/**
 * Lên lịch cho vòng poll tiếp theo với delay hiện tại.
 * Sau mỗi lần chạy:
 *  - Nếu bị rate limit → tăng delay (exponential backoff)
 *  - Nếu bình thường → đưa delay về giá trị mặc định
 */
const scheduleNextPoll = () => {
  watcherTimer = setTimeout(async () => {
    if (isRunning) return scheduleNextPoll(); // Bảo vệ concurrent runs

    isRunning = true;
    const { rateLimited } = await runOnePoll();
    isRunning = false;

    if (rateLimited) {
      // Tăng delay: nhân đôi, nhưng không vượt max
      currentIntervalMs = Math.min(currentIntervalMs * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS);
      logRateLimit(currentIntervalMs);
    } else {
      // Phục hồi về interval mặc định
      if (currentIntervalMs !== POLL_INTERVAL_MS) {
        currentIntervalMs = POLL_INTERVAL_MS;
        console.log(`[Watcher] ✅ RPC ổn định — đã phục hồi về interval ${POLL_INTERVAL_MS / 1000}s`);
      }
    }

    scheduleNextPoll(); // Lên lịch lần tiếp theo
  }, currentIntervalMs);
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Khởi động Payment Watcher
 * Gọi hàm này 1 lần trong app.js sau khi server đã listen
 */
const startPaymentWatcher = () => {
  console.log(`\n\x1b[36m[Watcher] 🚀 Payment Watcher đã khởi động — poll mỗi ${POLL_INTERVAL_MS / 1000}s\x1b[0m`);
  console.log(`\x1b[36m[Watcher] 📡 RPC Endpoint: ${process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'}\x1b[0m\n`);
  scheduleNextPoll();
};

/**
 * Dừng Payment Watcher (hữu ích khi graceful shutdown)
 */
const stopPaymentWatcher = () => {
  if (watcherTimer) {
    clearTimeout(watcherTimer);
    watcherTimer = null;
    console.log('[Watcher] ⏹️  Payment Watcher đã dừng.');
  }
};

module.exports = { startPaymentWatcher, stopPaymentWatcher, runOnePoll };
