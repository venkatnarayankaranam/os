require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const socketConfig = require('./config/socket');

const app = express();
const server = http.createServer(app);
const io = socketConfig.init(server);

const connectWithRetry = (retries = 5, delay = 5000) => {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in environment variables');
    process.exit(1);
  }

  mongoose
    .connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // Increased timeout
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
      dbName: process.env.MONGODB_DB || 'outing-system'
    })
    .then(async () => {
      console.log('🚀 Connected to MongoDB Atlas');
      console.log('Database:', mongoose.connection.name);
      
      // Verify collections exist
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('Available collections:', collections.map(c => c.name));
      
      // Verify staff exists
      const usersCollection = mongoose.connection.db.collection('users');
      const floorIncharges = await usersCollection.countDocuments({ role: 'floor-incharge' });
      const hostelIncharges = await usersCollection.countDocuments({ role: 'hostel-incharge' });
      const wardens = await usersCollection.countDocuments({ role: 'warden' });
      console.log(`Staff verification - Floor Incharges: ${floorIncharges}, Hostel Incharges: ${hostelIncharges}, Wardens: ${wardens}`);
      
      // Monitor database connection
      mongoose.connection.on('disconnected', () => {
        console.log('❌ Lost MongoDB connection');
        connectWithRetry();
      });
      
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB error:', err);
      });
    })
    .catch((err) => {
      console.error('❌ MongoDB Atlas connection error:', err.message);
      if (retries > 0) {
        console.log(`Retrying connection in ${delay / 1000} seconds... (${retries} attempts remaining)`);
        setTimeout(() => connectWithRetry(retries - 1, delay), delay);
      } else {
        console.error('Failed to connect to MongoDB Atlas after multiple attempts');
        process.exit(1);
      }
    });
};

connectWithRetry();

// Update CORS configuration
app.use(cors({
  origin: ['https://outingapplication.vercel.app', process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  
  // Special logging for QR validation requests
  if (req.originalUrl.includes('/gate/qr/validate')) {
    console.log('🔥🔥🔥 QR VALIDATION REQUEST DETECTED!');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
  }
  
  next();
});

app.get('/', (req, res) => {
  res.status(200).send('Outing Backend is running 🚀');
});


// Add detailed request logging before routes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, {
    headers: req.headers,
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined
  });
  next();
});

// Add request debugging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Query params:', req.query);
  console.log('Request body:', req.body);
  console.log('MongoDB connection state:', mongoose.connection.readyState);
  next();
});

// Import routes
const outingRoutes = require('./routes/outings');
const userRoutes = require('./routes/users');
const gateRoutes = require('./routes/gate');
const reportRoutes = require('./routes/reports');
const homePermissionRoutes = require('./routes/homePermissions');
const disciplinaryRoutes = require('./routes/disciplinary');
const studentsRoutes = require('./routes/students');
const notificationRoutes = require('./routes/notifications');

// Register routes
app.use('/auth', require('./routes/auth'));
app.use('/outings', outingRoutes);
app.use('/home-permissions', homePermissionRoutes);
app.use('/dashboard', require('./routes/dashboard'));
app.use('/users', userRoutes);
app.use('/gate', gateRoutes);
app.use('/disciplinary', disciplinaryRoutes);
app.use('/students', studentsRoutes);
app.use('/notifications', notificationRoutes);

app.use('/reports', reportRoutes);

// Start QR scheduler for automatic incoming QR generation and midnight expiry
const { startQRScheduler, startMidnightExpiryScheduler } = require('./services/qrScheduler');
startQRScheduler();
startMidnightExpiryScheduler();

// Add error handling for 404s
app.use((req, res) => {
  const requestPath = `${req.method} ${req.originalUrl}`;
  console.log(`404 - Route not found: ${requestPath}`);
  
  // Get all registered routes
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push(`${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          routes.push(`${Object.keys(handler.route.methods)} ${middleware.regexp} ${handler.route.path}`);
        }
      });
    }
  });

  res.status(404).json({
    success: false,
    message: 'Route not found',
    request: {
      path: req.originalUrl,
      method: req.method,
      headers: req.headers,
      body: req.body,
    },
    availableRoutes: {
      auth: '/api/auth/*',
      outings: '/api/outings/*',
      dashboard: '/api/dashboard/*',
      users: '/api/users/*'
    },
    registeredRoutes: routes,
    suggestion: 'Please check the API documentation for correct endpoints'
  });
});

app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    console.error('Auth Error:', {
      path: req.originalUrl,
      method: req.method,
      headers: req.headers,
      error: err.message
    });
    return res.status(401).json({
      success: false,
      message: 'Invalid token or no token provided',
      details: {
        error: err.message,
        requiredHeaders: ['Authorization: Bearer <token>']
      }
    });
  }
  next(err);
});

app.use((err, req, res, next) => {
  const errorDetails = {
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };
  
  console.error('Server Error:', errorDetails);
  
  res.status(err.status || 500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
    requestId: req.id,
    documentation: 'Please refer to API documentation for correct usage'
  });
});

const PORT = parseInt(process.env.PORT) || 5000;
const MAX_PORT_ATTEMPTS = 10;

const startServer = (port = PORT, attempt = 1) => {
  if (attempt > MAX_PORT_ATTEMPTS) {
    console.error('Failed to find an available port after', MAX_PORT_ATTEMPTS, 'attempts');
    process.exit(1);
  }

  try {
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      console.log('Socket.IO is ready for connections');
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy. Trying ${port + 1}...`);
        startServer(port + 1, attempt + 1);
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});
