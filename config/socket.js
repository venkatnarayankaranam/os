const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

const init = (server) => {
  io = new Server(server, {
    cors: {
      origin: ['https://outingapplication.vercel.app/', process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: '/socket.io' // Explicitly set socket path
  });

  // Debug middleware for all connections
  io.use((socket, next) => {
    console.log('[Socket] Connection attempt:', {
      id: socket.id,
      namespace: socket.nsp.name,
      auth: socket.handshake.auth,
      headers: socket.handshake.headers
    });
    next();
  });

  // Authentication middleware
  const authenticateSocket = (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'OutingApplication@2026');
      socket.user = decoded;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  };

  // Debug middleware for namespace connections
  const debugNamespace = (namespace) => {
    namespace.use((socket, next) => {
      console.log(`[Socket][${namespace.name}] Namespace connection:`, {
        id: socket.id,
        user: socket.user
      });
      next();
    });
  };

  // Floor Incharge namespace
  const floorInchargeNamespace = io.of('/floor-incharge');
  const hostelInchargeNamespace = io.of('/hostel-incharge');
  const wardenNamespace = io.of('/warden');
  const studentNamespace = io.of('/student');

  [floorInchargeNamespace, hostelInchargeNamespace, wardenNamespace, studentNamespace].forEach(namespace => {
    namespace.use(authenticateSocket);
    debugNamespace(namespace);
    
    namespace.on('connection', (socket) => {
      console.log(`Connected to ${socket.nsp.name}:`, socket.id);
      
      socket.on('join-room', (data) => {
        if (data.room) {
          socket.join(data.room);
          console.log(`Socket ${socket.id} joined room:`, data.room);
        }
      });

      socket.on('disconnect', () => {
        console.log(`Disconnected from ${socket.nsp.name}:`, socket.id);
      });
    });
  });

  // Security namespace
  const securityNamespace = io.of('/security');
  securityNamespace.use(authenticateSocket);
  debugNamespace(securityNamespace);
  
  securityNamespace.on('connection', (socket) => {
    console.log('Security connected:', socket.id);
    
    socket.on('verify-qr', async (data) => {
      try {
        // Handle QR verification events
        const decodedData = JSON.parse(data.qrData);
        socket.emit('verification-result', {
          success: true,
          data: decodedData
        });
      } catch (error) {
        socket.emit('verification-error', {
          success: false,
          message: error.message
        });
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

const emitToFloor = (hostelBlock, floor, event, data) => {
  try {
    if (!io) throw new Error('Socket.IO not initialized');
    const room = `${hostelBlock}-${floor}`;
    io.of('/floor-incharge').to(room).emit(event, data);
  } catch (error) {
    console.error('Socket emission error:', error);
  }
};

module.exports = { init, getIO, emitToFloor };
