"use strict";
//const serverTemplate = require('../controllers/serverTemplate');
//const Raft = require('./raft');
//const proxy = require('express-http-proxy');
//const loggerTemp = require('../node_modules/logger/logger');
const loggerTemp = require('../node_modules/logger/logger');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const path = require('path');
const config = require('../../etc/configure.json');

/*const servers = config.DNs.flatMap(dn => dn.servers.map(server => ({
  id: `${dn.name}_${server.id}`,
  host: `http://${server.host}:${server.port}`,
  proxy: proxy(`http://${server.host}:${server.port}`),
  usage: 0
})));
*/
class ReverseProxy {
  constructor(port) {
    this.port = port;
    this.app = express();
    this.logger = new loggerTemp(port);
    this.startAt = new Date();
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.get('/status', this.statusHandler.bind(this));
    this.app.get('/stats', this.statsHandler.bind(this));
    this.app.use('/api', this.reDirect.bind(this));
    this.app.get('/db/r', this.readHandler.bind(this));
    this.app.get('/db/d', this.deleteHandler.bind(this));
    //this.app.get('/election', this.electionHandler.bind(this));
    this.app.post('/db/c', this.createHandler.bind(this));
    this.app.post('/db/u', this.updateHandler.bind(this));
    this.app.get('/stop', this.stopHandler.bind(this));

    //RP SPECIFIC
    this.app.get('/set_master', this.set_masterHandler.bind(this));
  }

  statusHandler(req, res) {
    res.send({
      status: 'ok',
      start_time: this.startAt.toISOString(),
      living_time: `${Math.round((Date.now() - this.startAt.getTime()) / 1000)}s`
    });
  }

  statsHandler(req, res) {
    const stat = this.servers.map(server => ({
      id: server.id,
      host: server.host,
      usage: server.usage
    }));

    res.status(200).send({
      success: true,
      start_at: this.startAt.toISOString(),
      now: new Date().toISOString(),
      living_time_in_secs: Math.round((Date.now() - this.startAt.getTime()) / 1000),
      stat
    });
  }

  reDirect(req, res, next) {
    const id = req.query.id;
    const server = this.servers.find(s => s.id === id);

    if (!server) {
      return next({ error: "wrong server id" });
    }

    server.usage++;
    server.proxy(req, res, next);
  }

  readHandler(req, res) {
    const key = req.query.key;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const filePath = path.join(this.dataDir, hash);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath));
      res.send({ success: true, data });
    } else {
      res.status(404).send({ error: 'Key not found' });
    }
  }

  deleteHandler(req, res) {
    const key = req.query.key;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const filePath = path.join(this.dataDir, hash);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.send({ success: true });
    } else {
      res.status(404).send({ error: 'Key not found' });
    }
  }

  createHandler(req, res) {
    const key = req.body.key;
    const value = req.body.value;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    fs.writeFileSync(path.join(this.dataDir, hash), JSON.stringify({ key, value }));
    res.send({ success: true });
  }

  updateHandler(req, res) {
    const key = req.body.key;
    const value = req.body.value;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const filePath = path.join(this.dataDir, hash);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath));
      Object.assign(data.value, value);
      fs.writeFileSync(filePath, JSON.stringify(data));
      res.send({ success: true });
    } else {
      res.status(404).send({ error: 'Key not found' });
    }
  }

  stopHandler (req, res){
    res.send({ data: { message: 'Stopping reverse proxy' }, error: 0 });
    this.logger.info(`Reverse Proxy on port ${this.port} stopped`);
    process.exit(0);
  };

  set_masterHandler(req, res){
    res.json({ data: { message: 'set_master not implemented yet' }, error: 0 });
    this.logger.info(`Reverse Proxy on port ${this.port} set master as porto do novo master`);
  };

  start() {
    this.app.listen(this.port, () => {
      this.logger.info(`Reverse Proxy started on port ${this.port}`);
    });
  }
}

const rp = new ReverseProxy(config.RP.port);
rp.start();