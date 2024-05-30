const express = require('express');
const createLogger = require('../node_modules/logger/logger');

function createServer(port, routes) {
  let app = express();
  let logger = createLogger(port);

  app.use(express.json());

  routes.forEach(route => {
    app[route.method](route.path, route.handler);
  });

  app.listen(port, () => {
    logger.info(`Server started on port ${port}`);
  });

  return app;
}

module.exports = { createServer };
