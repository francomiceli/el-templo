import fp from 'fastify-plugin';
import { spomRoutes } from '../modules/spom/routes';

export default fp(async (fastify) => {
  fastify.register(spomRoutes);
}, {
  name: 'spom-plugin',
  dependencies: ['database', 'auth']
});
