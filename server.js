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

// ─── Socket.IO ────────────────────────────────────────────────
const allowedOrigins = [
  'https://emergencymedicalsystem.vercel.app'
];
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Socket.IO CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('io', io);

// ─── Database ─────────────────────────────────────────────────
connectDB();

// ─── Core Middleware ──────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: process.env.CLIENT_URL || 'https://emergencymedicalsystem.vercel.app',
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With']
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate Limiting ────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Too many auth attempts. Please wait 15 minutes.' }
});

const emergencyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many emergency requests in a short time.' }
});

app.use('/api/', globalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/emergency', emergencyLimiter);

// ─── Static Files ─────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/emergency',  emergencyRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/ambulances', ambulanceRoutes);
app.use('/api/hospitals',  hospitalRoutes);

// ─── Health Check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '🚑 EMS Kenya API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: `${Math.round(process.uptime())}s`
  });
});

// ─── Socket.IO Real-time Engine ───────────────────────────────
const connectedClients = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  connectedClients.set(socket.id, { connectedAt: new Date() });

  // ── Room Joins ──
  socket.on('join_emergency', (emergencyId) => {
    socket.join(`emergency_${emergencyId}`);
    console.log(`📍 Socket ${socket.id} joined emergency_${emergencyId}`);
  });

  socket.on('leave_emergency', (emergencyId) => {
    socket.leave(`emergency_${emergencyId}`);
  });

  socket.on('join_emt', (emtId) => {
    socket.join(`emt_${emtId}`);
    connectedClients.set(socket.id, { ...connectedClients.get(socket.id), emtId });
    console.log(`🚑 EMT ${emtId} joined their room`);
  });

  socket.on('join_admin', () => {
    socket.join('admin_room');
    console.log(`🛡️  Admin joined admin_room`);
  });

  // ── Live Location Updates from Ambulance ──
  socket.on('ambulance_location_update', (data) => {
    // Broadcast to anyone tracking this emergency
    if (data.emergencyId) {
      socket.to(`emergency_${data.emergencyId}`).emit('ambulance_moved', {
        coordinates: data.coordinates,
        heading: data.heading,
        speed: data.speed,
        timestamp: new Date()
      });
    }
    // Broadcast to admin map
    io.to('admin_room').emit('ambulance_location', {
      id: data.ambulanceId,
      registrationNumber: data.registrationNumber,
      coordinates: data.coordinates,
      status: data.status,
      timestamp: new Date()
    });
  });

  // ── EMT Status Updates ──
  socket.on('emt_status_update', (data) => {
    io.to('admin_room').emit('emt_status_changed', data);
  });

  // ── Patient SOS from native app (USSD/SMS gateway) ──
  socket.on('ussd_emergency', (data) => {
    io.to('admin_room').emit('new_emergency', {
      ...data,
      source: 'USSD',
      timestamp: new Date()
    });
  });

  // ── Ping / keep alive ──
  socket.on('ping_client', () => {
    socket.emit('pong_server', { timestamp: new Date() });
  });

  socket.on('disconnect', (reason) => {
    connectedClients.delete(socket.id);
    console.log(`🔌 Socket ${socket.id} disconnected: ${reason}`);
  });

  socket.on('error', (err) => {
    console.error(`Socket error for ${socket.id}:`, err.message);
  });
});

// Expose connected count
app.get('/api/health/connections', (req, res) => {
  res.json({
    success: true,
    connections: connectedClients.size,
    adminRoomSize: io.sockets.adapter.rooms.get('admin_room')?.size || 0
  });
});

// ─── Error Handling ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Graceful Shutdown ────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.message);
  server.close(() => process.exit(1));
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   🚑  EMS KENYA — BACKEND SERVER      ║
  ╠═══════════════════════════════════════╣
  ║  Port:        ${PORT}                     ║
  ║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(12)} ║
  ║  API:         /api/*                  ║
  ║  Socket.IO:   Active                  ║
  ╚═══════════════════════════════════════╝
  `);
  startCronJobs();
});

module.exports = { app, server, io };
