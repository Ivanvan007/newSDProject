const loggerTemp = require('../node_modules/logger/logger');
const Raft = require('./raft');

const express = require('express');
const proxy = require('express-http-proxy');

const path = require('path');

const crypto = require('crypto');
const fs = require('fs');
const config = require('../../etc/configure.json');

let app = express();
let logger;

function createServer(port, routes) {
    logger = loggerTemp.createLogger(port)
    loggerTemp.
    
    app.use(express.json());
    routes.forEach(route => {app[route.method](route.path, route.handler);
    });
    app.listen(port, () => {
        logger.info(`Server started on port ${port}`);
    });
    return app;
}

module.exports = serverTemplate;
