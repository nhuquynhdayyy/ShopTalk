const { Server } = require('socket.io');

let io = null;

/**
 * Khởi tạo Socket.io Server gắn liền với HTTP Server
 * @param {Object} server - Instance của HTTP server Express
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Cho phép kết nối từ mọi nguồn (bao gồm cả port 5173 của frontend)
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] 🔌 Client mới đã kết nối: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[Socket.io] ❌ Client đã ngắt kết nối: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Lấy instance của Socket.io đã được khởi tạo
 * @returns {Object|null}
 */
const getIo = () => {
  return io;
};

module.exports = {
  initSocket,
  getIo
};
