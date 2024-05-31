const express = require('express');
const {createLogger} = require('../node_modules/logger/logger');

let app = express();
let logger;

function createServer(port, routes) {
    logger = createLogger(port)
    
    app.use(express.json());
    routes.forEach(route => {app[route.method](route.path, route.handler);
    });
    app.listen(port, () => {
        logger.info(`Server started on port ${port}`);
    });
    return app;
}

module.exports = { createServer };
