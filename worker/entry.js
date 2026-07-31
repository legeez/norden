import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import app from '../server.js';

const server = createServer(app);
const handler = httpServerHandler(server);

export default {
  async fetch(request, env, ctx) {
    Object.assign(process.env, env);
    return handler.fetch(request, env, ctx);
  }
};
