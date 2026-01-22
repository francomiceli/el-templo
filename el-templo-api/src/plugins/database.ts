import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../db/schema';

declare module 'fastify' {
  interface FastifyInstance {
    db: MySql2Database<typeof schema>;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'eltemplo',
  });

  const db = drizzle(connection, { schema, mode: 'default' });

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await connection.end();
  });

  fastify.log.info('Database connected');
};

export default fp(databasePlugin, { name: 'database' });
