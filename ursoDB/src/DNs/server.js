"use strict";
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../../etc/configure.json');
const Raft = require('./raft');
//const loggerTemp = require('../node_modules/logger/logger');
const loggerTemp = require('../node_modules/logger/logger');

class Server {
  constructor(port) {
    this.port = port;
    this.app = express();
    this.logger = new loggerTemp(port);
    this.raft = new Raft(port, config.DNs);
    this.dnName = `dn${Math.floor(port / 1000) - 3}`;
    this.dataDir = path.join(__dirname, '../../DB-data/', this.dnName, `/s${port % 100}`);
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.get('/status', this.statusHandler.bind(this));
    this.app.get('/stats', this.statsHandler.bind(this));
    this.app.get('/db/r', this.readHandler.bind(this));
    this.app.get('/db/d', this.deleteHandler.bind(this));
    this.app.get('/election', this.electionHandler.bind(this));
    this.app.post('/db/c', this.createHandler.bind(this));
    this.app.post('/db/u', this.updateHandler.bind(this));
  }

  statusHandler(req, res) {
    res.send({
      status: 'ok',
      master: this.raft.getLeader(),
      start_time: this.raft.startTime.toISOString(),
      living_time: `${Math.round((Date.now() - this.raft.startTime.getTime()) / 1000)}s`
    });
  }

  statsHandler(req, res) {
    const stat = servers.map(server => ({
      id: server.id,
      host: server.host,
      usage: server.usage
    }));

    res.status(200).send({
      success: true,
      start_at: start_at.toISOString(),
      now: new Date().toISOString(),
      living_time_in_secs: Math.round((Date.now() - start_at.getTime()) / 1000),
      stat
    });
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
    if (!this.raft.isLeader()) {
      return res.status(403).send({ error: 'Not the leader' });
    }
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

  electionHandler(req, res) {
    this.raft.startElection();
    res.send({ status: 'Election started' });
  }

  createHandler(req, res) {
    if (!this.raft.isLeader()) {
      return res.status(403).send({ error: 'Not the leader' });
    }
    const key = req.body.key;
    const value = req.body.value;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    fs.writeFileSync(path.join(this.dataDir, hash), JSON.stringify({ key, value }));
    res.send({ success: true });
  }

  updateHandler(req, res) {
    if (!this.raft.isLeader()) {
      return res.status(403).send({ error: 'Not the leader' });
    }
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

  start() {
    this.app.listen(this.port, () => {
      this.logger.info(`Server started on port ${this.port}`);
    });
  }
}

const port = parseInt(process.argv[2].split(':')[2], 10);
const server = new Server(port);
server.start();

