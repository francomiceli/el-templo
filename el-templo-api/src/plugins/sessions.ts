import fp from 'fastify-plugin';
import { sessionRoutes } from '../modules/sessions/routes';

export default fp(async (fastify) => {
  fastify.register(sessionRoutes, { prefix: '/sessions' });
}, {
  name: 'sessions-plugin',
  dependencies: ['database', 'auth', 'spom-plugin'],
});
