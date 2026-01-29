import fp from 'fastify-plugin';
import { progressionRoutes } from '../modules/progression/routes';

export default fp(async (fastify) => {
  fastify.register(progressionRoutes, { prefix: '/api/progression' });
}, {
  name: 'progression-plugin',
  dependencies: ['database', 'auth'],
});
