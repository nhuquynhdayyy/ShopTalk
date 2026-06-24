const mockProducts = [
  {
    id: 'prod-essential-tee',
    sku: 'ST-TEE-ESSENTIAL',
    name: 'Ao thun ShopTalk Essential',
    category: 'Apparel',
    price_usdc: 18,
    price_vnd: 458100,
    stock: 42,
    size_options: ['S', 'M', 'L', 'XL'],
    color_options: ['den', 'trang', 'xanh navy'],
    description: 'Ao thun cotton form regular, phu hop ban hang online va dong goi qua tang.',
    selling_points: [
      'Chat cotton day dan, it nhan',
      'Form de mac cho nhieu dang nguoi',
      'Co san anh san pham de dang len bai'
    ],
    reviews: [
      { id: 'review-tee-001', rating: 5, author: 'Minh Anh', content: 'Vai day va len form gon, khach shop minh hoi lai nhieu.' },
      { id: 'review-tee-002', rating: 4, author: 'Thanh', content: 'Mau den de ban, dong goi chac chan.' }
    ],
    images: [
      '/mock-products/essential-tee-black.jpg',
      '/mock-products/essential-tee-white.jpg'
    ],
    created_at: '2026-06-01T08:00:00.000Z',
    updated_at: '2026-06-20T08:00:00.000Z'
  },
  {
    id: 'prod-bluetooth-headset',
    sku: 'ST-AUD-BT28',
    name: 'Tai nghe Bluetooth ShopTalk',
    category: 'Electronics',
    price_usdc: 32,
    price_vnd: 814400,
    stock: 18,
    size_options: [],
    color_options: ['den', 'bac'],
    description: 'Tai nghe bluetooth pin dai, hop voi khach can goi video va livestream ban hang.',
    selling_points: [
      'Pin toi da 28 gio voi hop sac',
      'Micro loc on cho cuoc goi ro hon',
      'Bao hanh 12 thang'
    ],
    reviews: [
      { id: 'review-headset-001', rating: 5, author: 'Khanh Linh', content: 'Mic nghe ro khi livestream, pin dung du lau.' },
      { id: 'review-headset-002', rating: 4, author: 'Duc', content: 'Hop sac nho, de tu van cho khach mua qua tang.' }
    ],
    images: [
      '/mock-products/bluetooth-headset-black.jpg',
      '/mock-products/bluetooth-headset-silver.jpg'
    ],
    created_at: '2026-06-03T08:00:00.000Z',
    updated_at: '2026-06-21T08:00:00.000Z'
  },
  {
    id: 'prod-logo-cap',
    sku: 'ST-CAP-LOGO',
    name: 'Mu ShopTalk Logo',
    category: 'Accessories',
    price_usdc: 12,
    price_vnd: 305400,
    stock: 31,
    size_options: ['free-size'],
    color_options: ['xanh navy', 'kem'],
    description: 'Mu luoi trai theu logo nho, de ban kem trong combo hang thoi trang.',
    selling_points: [
      'Logo nho, de phoi do',
      'Day dieu chinh phia sau',
      'Gia tot cho combo'
    ],
    reviews: [
      { id: 'review-cap-001', rating: 4, author: 'Bao Tran', content: 'Mau navy nhin lich su, khach nam mua nhieu.' }
    ],
    images: [
      '/mock-products/logo-cap-navy.jpg',
      '/mock-products/logo-cap-cream.jpg'
    ],
    created_at: '2026-06-05T08:00:00.000Z',
    updated_at: '2026-06-19T08:00:00.000Z'
  }
];

export default mockProducts;
