import { type Router, Router as createRouter } from 'express';

export const serviceInfoRouter: Router = createRouter();

serviceInfoRouter.get('/info', (_req, res) => {
  res.json({
    serviceName: 'orbit-mcp-server',
    serviceGroup: 'search',
    githubUrl: 'https://github.com/postmanlabs/orbit-mcp-server',
  });
});
