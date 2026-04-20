import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SERVICES = [
  'api-gateway',
  'auth-service',
  'user-service',
  'job-service',
  'escrow-service',
  'launchpad-service',
  'notification-service',
];

const nestCli = path.join(process.cwd(), 'node_modules/@nestjs/cli/bin/nest.js');

function printUsage() {
  console.error(`Usage:
  npm run start:dev -- <service|all>
  npm run start:prod -- <service|all>

Services: ${SERVICES.join(', ')}
Examples:
  npm run start:dev -- job-service
  npm run start:dev -- all
  npm run start:prod -- api-gateway
  npm run start:prod -- all

Production requires a prior build (e.g. npm run build or nest build <service>).`);
}

function distMain(service) {
  return path.join(process.cwd(), 'dist', 'apps', service, 'main.js');
}

const [, , mode, target] = process.argv;

if (!mode || !target || !['dev', 'prod'].includes(mode)) {
  printUsage();
  process.exit(1);
}

const name = target.toLowerCase();

if (name !== 'all' && !SERVICES.includes(name)) {
  console.error(`Unknown service "${target}".`);
  printUsage();
  process.exit(1);
}

const servicesToRun = name === 'all' ? SERVICES : [name];
const children = [];

function shutdown(signal) {
  for (const c of children) {
    try {
      c.kill(signal);
    } catch {
      /* ignore */
    }
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    shutdown(sig);
    process.exit(sig === 'SIGINT' ? 130 : 1);
  });
}

if (mode === 'dev') {
  for (const svc of servicesToRun) {
    const child = spawn(process.execPath, [nestCli, 'start', svc, '--watch'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
    });
    children.push(child);
  }
} else {
  for (const svc of servicesToRun) {
    const main = distMain(svc);
    if (!fs.existsSync(main)) {
      console.error(
        `Missing build output: ${main}\nRun \`npm run build\` or \`nest build ${svc}\` first.`,
      );
      process.exit(1);
    }
    const child = spawn(process.execPath, [main], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });
    children.push(child);
  }
}

if (servicesToRun.length === 1) {
  children[0].on('exit', (code, sig) => {
    process.exit(code ?? (sig ? 1 : 0));
  });
} else {
  for (const child of children) {
    child.on('exit', (code) => {
      if (code !== 0 && code != null) {
        shutdown('SIGTERM');
        process.exit(code);
      }
    });
  }
}
