const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const db = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const { verifyAccessToken } = require('./utils/token');

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Serve Frontend Static Files
const path = require('path');
const frontendPath = path.resolve(__dirname, '../../frontend/public');
app.use(express.static(frontendPath));

// Request logger for API calls
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith('/api')) {
      console.log(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Binary Options Automation Engine & API',
  });
});

// Auth API Routes
app.use('/api/v1/auth', authRoutes);

// Public Signals feed & stats endpoint
app.get('/api/v1/signals', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const signals = db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json({ success: true, count: signals.length, data: signals });
});

// Setup WebSocket server for real-time live trading signals
const wss = new WebSocketServer({ server, path: '/ws/signals' });

wss.on('connection', (ws, req) => {
  console.log('[WebSocket] Client connected for live signals');

  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'Subscribed to live binary options signals feed',
    timestamp: new Date().toISOString(),
  }));

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error occurred.',
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Binary Options API Server running on port ${PORT}`);
  console.log(`👉 Health check: http://localhost:${PORT}/health`);
  console.log(`👉 Auth endpoints: http://localhost:${PORT}/api/v1/auth/*`);
  console.log(`👉 Signals WebSocket: ws://localhost:${PORT}/ws/signals`);
  console.log(`====================================================`);
});

module.exports = { app, server, wss };
