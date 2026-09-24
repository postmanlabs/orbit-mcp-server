import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface PackageJson {
  name: string;
  version: string;
}

const pkg = require('../package.json') as PackageJson;

export const SERVER_NAME = 'orbit-mcp-server';
export const VERSION: string = pkg.version;
