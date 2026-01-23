import Fastify from 'fastify';
import cors from '@fastify/cors';
import databasePlugin from './plugins/database';
import authPlugin from './plugins/auth';
import spomPlugin from './plugins/spom';
import { authRoutes } from './modules/auth/routes';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // CORS for local development
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'development'
      ? ['http://localhost:9000', 'capacitor://localhost', 'http://localhost']
      : (process.env.FRONTEND_URL || 'https://app.eltemplo.com'),
  });

  // Database plugin (decorates fastify.db)
  await app.register(databasePlugin);

  // Auth plugin (decorates fastify.jwt and fastify.authenticate)
  await app.register(authPlugin);

  // SPOM plugin (SPOM data access endpoints)
  await app.register(spomPlugin);

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Health check endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
