'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const templateRoutes = require('./routes/template');
const orderRoutes = require('./routes/orders');
const customerRoutes = require('./routes/customers');
const catalogRoutes = require('./routes/catalog');
const {
  requireSession,
  refreshHandler,
  logoutHandler,
} = require('./middleware/sessionAuth');

const app = express();

const PUBLIC_DIR =
  process.env.STATIC_DIR || path.join(__dirname, '..', 'public');

app.use(cors());
/** preparedSvg (text → paths) can be several MB */
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '20mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Public: identify / confirm (issue session token on success)
app.use('/api/customers', customerRoutes);

// Session lifecycle (refresh requires valid token; logout is best-effort)
app.post('/api/session/refresh', refreshHandler);
app.post('/api/session/logout', logoutHandler);

// Protected API — expired/missing token → 401
// Font is public: CSS @font-face / FontFace cannot send Authorization headers.
app.use(
  '/api/template',
  (req, res, next) => {
    if (req.path === '/font') return next();
    return requireSession(req, res, next);
  },
  templateRoutes
);
app.use('/api/orders', requireSession, orderRoutes);
app.use('/api/products', requireSession, catalogRoutes);

// Production / Docker: serve the Vite client build from server/public.
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl || req.url, err.message || err);
    if (err.stack) console.error(err.stack);
  }

  let message = err.message || 'Internal server error.';
  if (err.code === '42703') {
    message =
      `עמודה חסרה במסד הנתונים (${err.message}). ` +
      'הריצו: npm --prefix server run db:schema';
  }

  const body = { error: message };
  if (status === 401 && err.code) body.code = err.code;
  res.status(status).json(body);
});

const PORT = Number(process.env.PORT || 4100);
/** Cloud Run / Docker require binding all interfaces; override with HOST if needed. */
const HOST = process.env.HOST || '0.0.0.0';
if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[server] port ${PORT} already in use — stop the other instance (Ctrl+C) or run: netstat -ano | findstr :${PORT}`
      );
      process.exit(1);
    }
    if (err.code === 'EACCES') {
      console.error(
        `[server] permission denied on port ${PORT} (often a Windows excluded port range). ` +
          'Set PORT in server/.env to a free port outside `netsh interface ipv4 show excludedportrange protocol=tcp`.'
      );
      process.exit(1);
    }
    throw err;
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
