import 'dotenv/config';
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
