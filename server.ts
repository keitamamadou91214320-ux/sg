import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initSchema } from './server/db.ts';
import authAndUsersRoutes from './server/routes/authAndUsers.ts';
import academicsAndGradesRoutes from './server/routes/academicsAndGrades.ts';
import bulletinsAndOperationsRoutes from './server/routes/bulletinsAndOperations.ts';
import campusModulesRoutes from './server/routes/campusModules.ts';

initSchema();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', authAndUsersRoutes);
app.use('/api', academicsAndGradesRoutes);
app.use('/api', bulletinsAndOperationsRoutes);
app.use('/api', campusModulesRoutes);

// Central API error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ error: err.message || 'Erreur lors du traitement de la requête.' });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'));

  // Serve standalone pure HTML/CSS/JS vitrine directory cleanly in both dev and prod
  const publicVitrineDir = path.resolve(process.cwd(), 'public', 'vitrine');
  if (fs.existsSync(publicVitrineDir)) {
    app.use('/vitrine', express.static(publicVitrineDir));
  }

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PROSPER KAMARA – GESTION SCOLAIRE actif sur http://localhost:${PORT}`);
  });
}

startServer();
