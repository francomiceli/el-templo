import Fastify from 'fastify';
import cors from '@fastify/cors';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // CORS for local development
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'development'
      ? ['http://localhost:9000', 'capacitor://localhost', 'http://localhost']
      : (process.env.FRONTEND_URL || 'https://app.eltemplo.com'),
  });

  // Health check endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
