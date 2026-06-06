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
const updatesRoutes = require('./routes/updatesRoutes');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);

//
// 🚑 ALLOWED ORIGINS (PRODUCTION SAFE)
//
const allowedOrigins = [
  'https://emergencymedicalsystem.vercel.app'
];

//
// 🚑 SOCKET.IO SETUP
//
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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
// 🚑 SECURITY MIDDLEWARE
//
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

//
// 🚑 CRITICAL FIX: CORS MUST BE FIRST
//
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

//
// OPTIONAL: CORS LIB (SAFE FALLBACK)
//
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS blocked: ' + origin));
  },
  credentials: true
}));

//
// LOGGING + BODY PARSING
//
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

//
// RATE LIMITING
//
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
}));

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15
}));

app.use('/api/emergency', rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10
}));

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
app.use('/api/emt', require('./routes/emtRoutes'));
app.use('/api/updates', require("./routes/updateRoutes"));
app.use('/api/uploads', require('./routes/uploadRoutes'));
//
// HEALTH CHECK
//
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '🚑 EMS Kenya API Running',
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
  console.log(`🔌 Connected: ${socket.id}`);
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
// START SERVER
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