// PM2 Ecosystem Configuration
// https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      name: 'eltemplo-api',
      script: 'dist/index.js',
      cwd: '/var/www/el-templo/el-templo-api',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // Environment variables - NODE_ENV tells the app to load .env.production
      env: {
        NODE_ENV: 'production',
      },
      // Logging
      error_file: '/var/log/pm2/eltemplo-api-error.log',
      out_file: '/var/log/pm2/eltemplo-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'eltemplo-bot',
      script: 'dist/index.js',
      cwd: '/var/www/el-templo/el-templo-bot',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/pm2/eltemplo-bot-error.log',
      out_file: '/var/log/pm2/eltemplo-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
