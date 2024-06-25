"use strict";
const loggerTemp = require('../node_modules/logger/logger');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const path = require('path');
const config = require('../../etc/configure.json');

class ReverseProxy {
  constructor(port) {
    this.port = port;
    this.app = express();
    this.logger = new loggerTemp(port);
    this.startAt = new Date();
    this.setupRoutes();
    this.leaders = {}; // Store leaders for each datanode
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.get('/status', this.statusHandler.bind(this));
    this.app.get('/stats', this.statsHandler.bind(this));
    this.app.use('/api', this.reDirect.bind(this));
    this.app.get('/db/r', this.readHandler.bind(this));
    this.app.get('/db/d', this.deleteHandler.bind(this));
    this.app.post('/db/c', this.createHandler.bind(this));
    this.app.post('/db/u', this.updateHandler.bind(this));
    this.app.get('/stop', this.stopHandler.bind(this));

    // RP SPECIFIC
    this.app.get('/set_master', this.set_masterHandler.bind(this));
  }

  statusHandler(req, res) {
    res.send({
      status: 'ok',
      start_time: this.startAt.toISOString(),
      living_time: `${Math.round((Date.now() - this.startAt.getTime()) / 1000)}s`,
      leaders: this.leaders
    });
  }

  statsHandler(req, res) {
    res.status(200).send({
      success: true,
      start_at: this.startAt.toISOString(),
      now: new Date().toISOString(),
      living_time_in_secs: Math.round((Date.now() - this.startAt.getTime()) / 1000),
      leaders: this.leaders
    });
  }

  reDirect(req, res, next) {
    next();
  }

  readHandler(req, res) {
    const key = req.query.key;
    const hash = crypto.createHash('md5').update(key).digest('hex') + ".json";
    const filePath = path.join(this.dataDir, hash);

    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath));
        res.send({ success: true, data });
      } else {
        res.status(404).send({ error: 'Key not found' });
      }
    } catch (error) {
      res.status(500).send({ error: `${error.message || error}` });
      this.logger.error(`Data on Server on port ${this.port} cannot be read, error: ${error.message || error}`);
    }
  }

  deleteHandler(req, res) {
    const key = req.query.key;
    const hash = crypto.createHash('md5').update(key).digest('hex') + ".json";
    const filePath = path.join(this.dataDir, hash);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.send({ success: true });
        this.logger.info(`Data ${hash} on Server on port ${this.port} deleted successfully`);
      } else {
        res.status(404).send({ error: 'Key not found' });
      }
    } catch (error) {
      res.status(500).send({ error: `${error.message || error}` });
      this.logger.error(`Data on Server on port ${this.port} cannot be deleted, error: ${error.message || error}`);
    }
  }

  createHandler(req, res) {
    const key = req.body.key;
    const value = req.body.value;
    const hash = crypto.createHash('md5').update(key).digest('hex') + ".json";
    try {
      fs.writeFileSync(path.join(this.dataDir, hash), JSON.stringify({ key, value }));
      res.send({ success: true });
      this.logger.info(`Data ${hash} on Server on port ${this.port} created`);
    } catch (error) {
      res.status(500).send({ error: `${error.message || error}` });
      this.logger.error(`Data ${hash} on Server on port ${this.port} not created, error: ${error.message || error}`);
    }
  }

  updateHandler(req, res) {
    const key = req.body.key;
    const value = req.body.value;
    const hash = crypto.createHash('md5').update(key).digest('hex') + ".json";
    const filePath = path.join(this.dataDir, hash);
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath));
        Object.assign(data.value, value);
        fs.writeFileSync(filePath, JSON.stringify(data));
        res.send({ success: true });
        this.logger.info(`Data ${hash} on Server on port ${this.port} updated`);
      } else {
        res.status(404).send({ error: 'Key not found' });
      }
    } catch (error) {
      res.status(500).send({ error: `${error.message || error}` });
      this.logger.error(`Data ${hash} on Server on port ${this.port} cannot be updated, error: ${error.message || error}`);
    }
  }

  stopHandler(req, res) {
    try {
      res.send({ data: { message: 'Stopping reverse proxy' }, error: 0 });
      this.logger.info(`Reverse Proxy on port ${this.port} stopped`);
      process.exit(0);
    } catch (error) {
      res.status(500).send({ error: `${error.message || error}` });
      this.logger.error(`Reverse Proxy on port ${this.port} cannot be stopped, error: ${error.message || error}`);
    }
  }

  set_masterHandler(req, res) {
    try {
      const { leader, dnName } = req.query;
      this.leaders[dnName] = leader;
      res.json({ data: { message: `New master for ${dnName} set to port ${leader}` }, error: 0 });
      this.logger.info(`Reverse Proxy on port ${this.port} set master for ${dnName} to port ${leader}`);
    } catch (error) {
      res.status(500).send({ error: `${error.message || error}` });
      this.logger.error(`Reverse Proxy on port ${this.port} cannot set master, error: ${error.message || error}`);
    }
  }

  start() {
    this.app.listen(this.port, () => {
      this.logger.info(`Reverse Proxy started on port ${this.port}`);
    });
  }
}

const rp = new ReverseProxy(config.RP.port);
rp.start();

