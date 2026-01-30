import dotenv from 'dotenv';
import path from 'path';

// Load environment-specific .env file
const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env.development';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Fallback to .env if specific file doesn't exist
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { buildApp } from './app';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      port: Number(process.env.PORT) || 3000,
      host: '0.0.0.0', // Listen on all interfaces for mobile emulator access
    });
    console.log(`Server listening on http://0.0.0.0:${process.env.PORT || 3000}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
