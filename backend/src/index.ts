import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import requestsRoutes from './routes/requestsRoutes.js';
import chatRoutes from './routes/chatRoutes.js';

const app = express();

// Configure CORS allowed origins
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
];

// Additional origins configured via CLIENT_URL (supports comma-separated URLs)
const configuredOrigins =
  config.clientUrl && config.clientUrl !== '*'
    ? config.clientUrl.split(',').map((u) => u.trim().replace(/\/$/, '')).filter(Boolean)
    : [];

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...configuredOrigins]));

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, Render health checks)
      if (!origin) return callback(null, true);

      // Allow all if explicitly configured with wildcard
      if (config.clientUrl === '*') return callback(null, true);

      const normalizedOrigin = origin.replace(/\/$/, '');

      // Check exact match in configured & local origins
      if (allowedOrigins.some((allowed) => allowed.toLowerCase() === normalizedOrigin.toLowerCase())) {
        return callback(null, true);
      }

      // Automatically allow any Vercel production or preview subdomain
      if (/^https:\/\/[a-zA-Z0-9_.-]+\.vercel\.app$/.test(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn(`[CORS] Denied request from unauthorized origin: ${origin}`);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    product: 'Sahaay MVP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/chat', chatRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// Start Server
app.listen(config.port, () => {
  console.log(`===============================================`);
  console.log(`🚀 Sahaay API running on http://localhost:${config.port}`);
  console.log(`📡 Environment: ${config.nodeEnv}`);
  console.log(`💬 Nexconn App Key: ${config.nexconn.appKey ? 'Configured ✅' : 'Pending ⚠️'}`);
  console.log(`🔐 Nexconn App Secret: ${config.nexconn.appSecret ? 'Configured ✅' : 'Pending ⚠️'}`);
  console.log(`🔒 CORS Policy: ${config.clientUrl === '*' ? 'Wildcard (*)' : allowedOrigins.join(', ') + ' (+ *.vercel.app)'}`);
  console.log(`===============================================`);
});
