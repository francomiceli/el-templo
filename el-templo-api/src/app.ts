import Fastify from 'fastify';
import cors from '@fastify/cors';
import databasePlugin from './plugins/database';
import authPlugin from './plugins/auth';
import spomPlugin from './plugins/spom';
import sessionsPlugin from './plugins/sessions';
import progressionPlugin from './plugins/progression';
import { authRoutes } from './modules/auth/routes';
import { adminRoutes } from './modules/admin';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // CORS configuration
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'development'
      ? ['http://localhost:9000', 'http://localhost:9100', 'http://localhost:9101', 'capacitor://localhost', 'http://localhost']
      : [
          process.env.FRONTEND_URL || 'https://app.eltemplo.org',
          process.env.ADMIN_URL || 'https://admin.eltemplo.org',
          'capacitor://localhost',  // Android Capacitor
          'http://localhost',       // iOS Capacitor
        ],
    methods: ['GET', 'HEAD', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Database plugin (decorates fastify.db)
  await app.register(databasePlugin);

  // Auth plugin (decorates fastify.jwt and fastify.authenticate)
  await app.register(authPlugin);

  // SPOM plugin (SPOM data access endpoints)
  await app.register(spomPlugin);

  // Sessions plugin (session generation and retrieval)
  await app.register(sessionsPlugin);

  // Progression plugin (member stats and evaluation requests)
  await app.register(progressionPlugin);

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Admin routes (session management for coaches/admins)
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // Health check endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
