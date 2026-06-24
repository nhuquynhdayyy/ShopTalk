/**
 * Tool: getReviews
 * Nhiệm vụ: Lấy đánh giá sản phẩm từ DB (hoặc mock data) để AI dùng trong tư vấn
 * Thảo Nguyên - feature/ai-agora-v2
 */

// ─── Mock Reviews Data ────────────────────────────────────────────────────────
// Dùng khi chưa có DB — reviews mẫu cho shop áo quần

const MOCK_REVIEWS = {
  "AT-001": [
    { user: "Ngọc Anh", rating: 5, comment: "Vải mềm mịn lắm, mặc cả ngày không bí. Mua lần 2 rồi vì quá thích!", size_bought: "M" },
    { user: "Minh Tuấn", rating: 4, comment: "Chất vải đúng như mô tả, màu đẹp, giao hàng nhanh.", size_bought: "L" },
    { user: "Thu Hà", rating: 5, comment: "Đặt size S vừa đẹp, dáng áo thanh mảnh. Giá hợp lý!", size_bought: "S" },
  ],
  "AT-002": [
    { user: "Bảo Trân", rating: 5, comment: "Áo thun oversize mặc với quần baggy rất cool, shop tư vấn phối đồ cũng nhiệt tình.", size_bought: "L" },
    { user: "Khánh Linh", rating: 4, comment: "Màu thực tế đẹp hơn ảnh. Mua thêm 2 màu nữa rồi 😄", size_bought: "M" },
  ],
  "SM-001": [
    { user: "Phúc Nguyên", rating: 5, comment: "Áo sơ mi đi làm nhìn rất chỉnh, vải không nhăn dù ngồi cả ngày.", size_bought: "L" },
    { user: "Hoài Thu", rating: 5, comment: "Mặc đi họp khách hàng, được khen mặc đẹp. Chất lượng xứng đáng với giá.", size_bought: "M" },
    { user: "Duy Anh", rating: 4, comment: "Form áo chuẩn, đường may sắc sảo. Chỉ tiếc là giao hơi lâu 1 chút.", size_bought: "XL" },
  ],
  "QJ-001": [
    { user: "Lan Phương", rating: 5, comment: "Quần jeans co giãn cực tốt, mặc cả ngày vẫn thoải mái. Mua 2 màu luôn!", size_bought: "28" },
    { user: "Trọng Nhân", rating: 4, comment: "Chất denim dày dặn, màu không bị phai sau 5 lần giặt. Hài lòng!", size_bought: "30" },
  ],
  "VY-001": [
    { user: "Huyền Trang", rating: 5, comment: "Váy midi này mặc đi làm hay đi chơi đều hợp. Vải không bị nhăn, nhẹ mát.", size_bought: "M" },
    { user: "Kim Ngân", rating: 5, comment: "Xinh lắm! Đặt size S vừa đẹp, eo được tôn lên. Sẽ mua tiếp!", size_bought: "S" },
    { user: "Phương Vy", rating: 4, comment: "Màu thật rất đẹp, giao đúng hàng. Chỉ ước có thêm màu navy.", size_bought: "M" },
  ],
  "AK-001": [
    { user: "Thanh Thảo", rating: 5, comment: "Áo khoác dù nhẹ nhưng giữ ấm tốt, mặc đi máy bay vừa đủ ấm.", size_bought: "M" },
    { user: "Minh Khoa", rating: 4, comment: "Form áo đẹp, màu navy thanh lịch. Mua làm quà tặng bạn bè.", size_bought: "L" },
  ],
};

// ─── Tool Definition ──────────────────────────────────────────────────────────

const getReviewsToolDefinition = {
  type: "function",
  function: {
    name: "get_reviews",
    description:
      "Lấy đánh giá (reviews) của một sản phẩm để AI dùng khi tư vấn khách hàng. " +
      "Dùng khi cần tăng độ tin tưởng — chia sẻ feedback từ người mua thực tế.",
    parameters: {
      type: "object",
      properties: {
        product_sku: {
          type: "string",
          description: "Mã SKU của sản phẩm cần lấy reviews",
        },
        limit: {
          type: "number",
          description: "Số lượng reviews muốn lấy (mặc định 3, tối đa 5)",
          default: 3,
        },
        min_rating: {
          type: "number",
          minimum: 1,
          maximum: 5,
          description: "Chỉ lấy reviews có rating >= giá trị này (mặc định 1 = lấy tất cả)",
          default: 1,
        },
      },
      required: ["product_sku"],
    },
  },
};

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * @param {object} args
 * @param {object} deps - { db, logger }
 */
async function getReviewsHandler(args, deps = {}) {
  const { product_sku, limit = 3, min_rating = 1 } = args;
  const { db, logger } = deps;

  const safeLimit = Math.min(Number(limit) || 3, 5);
  const safeMinRating = Number(min_rating) || 1;

  // ── Mock mode ──────────────────────────────────────────────────────────────
  if (!db) {
    const allMockReviews = MOCK_REVIEWS[product_sku] || [];
    const filtered = allMockReviews
      .filter((r) => r.rating >= safeMinRating)
      .slice(0, safeLimit);

    if (filtered.length === 0) {
      return {
        success: true,
        product_sku,
        reviews: [],
        summary: "Chưa có đánh giá nào cho sản phẩm này.",
        average_rating: null,
      };
    }

    const avgRating =
      filtered.reduce((sum, r) => sum + r.rating, 0) / filtered.length;

    return {
      success: true,
      product_sku,
      reviews: filtered,
      summary: buildReviewSummary(filtered, avgRating),
      average_rating: Math.round(avgRating * 10) / 10,
      total_reviews: allMockReviews.length,
    };
  }

  // ── Production mode ────────────────────────────────────────────────────────
  try {
    // Lấy reviews từ cột `reviews` (JSON[]) trong bảng products
    const query = `
      SELECT
        r->>'user'    AS "user",
        (r->>'rating')::int AS rating,
        r->>'comment' AS comment,
        r->>'size_bought' AS size_bought
      FROM products,
           jsonb_array_elements(reviews::jsonb) AS r
      WHERE sku = $1
        AND (r->>'rating')::int >= $2
      ORDER BY (r->>'rating')::int DESC
      LIMIT $3
    `;

    const result = await db.query(query, [product_sku, safeMinRating, safeLimit]);

    if (result.rowCount === 0) {
      return {
        success: true,
        product_sku,
        reviews: [],
        summary: "Sản phẩm này chưa có đánh giá.",
        average_rating: null,
      };
    }

    const reviews = result.rows;
    const avgRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    // Lấy tổng số reviews
    const countResult = await db.query(
      "SELECT jsonb_array_length(reviews::jsonb) AS total FROM products WHERE sku = $1",
      [product_sku]
    );
    const total_reviews = countResult.rows[0]?.total || reviews.length;

    return {
      success: true,
      product_sku,
      reviews,
      summary: buildReviewSummary(reviews, avgRating),
      average_rating: Math.round(avgRating * 10) / 10,
      total_reviews,
    };
  } catch (error) {
    const errMsg = error.message || "Unknown error";
    if (logger) logger.error("[getReviews] Error:", errMsg);
    else console.error("[getReviews] Error:", errMsg);

    return {
      success: false,
      product_sku,
      reviews: [],
      summary: "Không thể tải đánh giá lúc này.",
      error: errMsg,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tạo summary text từ list reviews — AI dùng để nói chuyện với khách
 */
function buildReviewSummary(reviews, avgRating) {
  if (!reviews || reviews.length === 0) return "Chưa có đánh giá.";

  const stars = "⭐".repeat(Math.round(avgRating));
  const highlights = reviews
    .slice(0, 2)
    .map((r) => `"${r.comment}" — ${r.user} (${r.rating}⭐)`)
    .join(" | ");

  return `Đánh giá trung bình: ${avgRating}/5 ${stars}. Khách hàng nói: ${highlights}`;
}

// ─── Result Formatter ─────────────────────────────────────────────────────────

/**
 * Format kết quả để AI đọc và tư vấn khách
 */
function formatGetReviewsResult(result) {
  if (!result.success) {
    return "Hiện tại không thể tải đánh giá sản phẩm, bạn ơi.";
  }

  if (result.reviews.length === 0) {
    return "Sản phẩm này chưa có đánh giá từ khách hàng, nhưng shop đảm bảo chất lượng nhé ạ!";
  }

  const lines = [
    `📊 Đánh giá sản phẩm (${result.total_reviews} lượt):`,
    `⭐ Trung bình: ${result.average_rating}/5`,
    "",
    ...result.reviews.map(
      (r) =>
        `• "${r.comment}" — ${r.user}${r.size_bought ? ` (mua size ${r.size_bought})` : ""} · ${"⭐".repeat(r.rating)}`
    ),
  ];

  return lines.join("\n");
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  definition: getReviewsToolDefinition,
  handler: getReviewsHandler,
  formatResult: formatGetReviewsResult,
  MOCK_REVIEWS, // export để test
};