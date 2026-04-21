const services = [
  'api-gateway',
  'auth-service',
  'user-service',
  'job-service',
  'escrow-service',
  'launchpad-service',
  'notification-service',
  'upload-service',
  'chat-service',
];

module.exports = {
  apps: services.map((service) => ({
    name: service,
    cwd: __dirname,
    script: 'node_modules/@nestjs/cli/bin/nest.js',
    args: `start ${service}`,
    interpreter: 'node',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
      TS_NODE_TRANSPILE_ONLY: 'true',
    },
  })),
};
