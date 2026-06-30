import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import xss from 'xss-clean';
import rateLimit from 'express-rate-limit';
import path from 'path';
import os from 'os';
import apiRouter from './routes/api.js';

const app = express();

// ==========================================
// Security Middlewares
// ==========================================

// Helmet for secure HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: false, // Allows cross-origin image requests
  })
);

// Prevent cross-site scripting (XSS) injections
app.use(xss());

// CORS configuration - support development and production endpoints
app.use(
  cors({
    origin: '*', // Allow all origins for easier portfolio deployment (can restrict in production)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Rate Limiting to prevent API abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ==========================================
// Parsing & Routing Setup
// ==========================================

// Parse JSON request bodies
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Serve file uploads statically
if (process.env.VERCEL === '1') {
  app.use('/uploads', express.static(os.tmpdir()));
} else {
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
}

// Main API Router mount
app.use('/api', apiRouter);

// Root path diagnostic route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'StudyAI Smart Learning Assistant API Server is running.',
    timestamp: new Date(),
  });
});

// ==========================================
// Error Handling
// ==========================================

// 404 Fallback Route
app.use((req, res, next) => {
  res.status(404).json({ message: `API Route not found: ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  console.error(`[Error Handler] ${err.stack}`);
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

export default app;
