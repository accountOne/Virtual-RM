import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { apiRouter } from './routes';

const CLIENT_DIST = path.join(__dirname, '..', '..', 'dist', 'client', 'browser');

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', apiRouter);

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'Not found' });
    }
    next();
  });

  // Serve the built Angular app (production: `npm run build && npm run build:server`).
  // In dev mode this directory doesn't exist yet — `npm run dev` serves the client via `ng serve` instead.
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  return app;
}
