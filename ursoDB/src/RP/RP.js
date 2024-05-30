const { createServer } = require('../controllers/serverTemplate');
const proxy = require('express-http-proxy');
const config = require('../../etc/configure.json');

const start_at = new Date();
const servers = config.DNs.flatMap(dn => dn.servers.map(server => ({
  id: `${dn.name}_${server.id}`,
  host: `http://${server.host}:${server.port}`,
  proxy: proxy(`http://${server.host}:${server.port}`),
  usage: 0
})));

async function re_direct(req, resp, next) {
  const id = req.query.id;
  const server = servers.find(s => s.id === id);

  if (!server) {
    return next({ error: "wrong server id" });
  }

  server.usage++;
  server.proxy(req, resp, next);
}

const routes = [
  {
    method: 'use',
    path: '/api',
    handler: re_direct
  },
  {
    method: 'get',
    path: '/stat',
    handler: (req, resp) => {
      const stat = servers.map(server => ({
        id: server.id,
        host: server.host,
        usage: server.usage
      }));

      resp.status(200).send({
        success: true,
        start_at: start_at.toISOString(),
        now: new Date().toISOString(),
        living_time_in_secs: Math.round((Date.now() - start_at.getTime()) / 1000),
        stat
      });
    }
  }
];

createServer(config.RP.port, routes);
