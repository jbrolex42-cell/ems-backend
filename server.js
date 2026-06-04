const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { startCronJobs } = require('./services/cronJobs');

// Routes
const authRoutes = require('./routes/authRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const ambulanceRoutes = require('./routes/ambulanceRoutes');
const hospitalRoutes = require('./routes/hospitalRoutes');

const app = express();
const server = http.createServer(app);

//
// 🚑 FIX 1: SINGLE SOURCE OF TRUTH FOR ORIGINS
//
const allowedOrigins = [
  'https://emergencymedicalsystem.vercel.app'
];

//
// 🚑 FIX 2: SOCKET.IO CORS (STRICT + SAFE)
//
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ Socket.IO blocked origin:", origin);
      return callback(new Error("Socket.IO CORS blocked"));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('io', io);

//
// 🚑 DATABASE
//
connectDB();

//
// 🚑 FIX 3: EXPRESS CORS (MATCH SOCKET.IO EXACTLY)
//
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("❌ Express blocked origin:", origin);
    return callback(new Error("CORS blocked"));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With']
}));

//
// SECURITY + LOGGING
//
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

//
// RATE LIMITING
//
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15
});

const emergencyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10
});

app.use('/api/', globalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/emergency', emergencyLimiter);

//
// STATIC FILES
//
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//
// ROUTES
//
app.use('/api/auth', authRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ambulances', ambulanceRoutes);
app.use('/api/hospitals', hospitalRoutes);

//
// HEALTH CHECK
//
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '🚑 EMS Kenya API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: `${Math.round(process.uptime())}s`
  });
});

//
// SOCKET ENGINE
//
const connectedClients = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  connectedClients.set(socket.id, { connectedAt: new Date() });

  socket.on('join_emergency', (id) => {
    socket.join(`emergency_${id}`);
  });

  socket.on('join_emt', (id) => {
    socket.join(`emt_${id}`);
  });

  socket.on('join_admin', () => {
    socket.join('admin_room');
  });

  socket.on('ambulance_location_update', (data) => {
    if (data.emergencyId) {
      socket.to(`emergency_${data.emergencyId}`).emit('ambulance_moved', data);
    }

    io.to('admin_room').emit('ambulance_location', data);
  });

  socket.on('emt_status_update', (data) => {
    io.to('admin_room').emit('emt_status_changed', data);
  });

  socket.on('ussd_emergency', (data) => {
    io.to('admin_room').emit('new_emergency', {
      ...data,
      source: 'USSD',
      timestamp: new Date()
    });
  });

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
  });
});

//
// CONNECTIONS MONITOR
//
app.get('/api/health/connections', (req, res) => {
  res.json({
    success: true,
    connections: connectedClients.size,
    adminRoomSize: io.sockets.adapter.rooms.get('admin_room')?.size || 0
  });
});

//
// ERROR HANDLERS
//
app.use(notFound);
app.use(errorHandler);

//
// SERVER START
//
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`
🚑 EMS KENYA BACKEND RUNNING
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
  `);

  startCronJobs();
});

module.exports = { app, server, io };