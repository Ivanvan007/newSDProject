"use strict";
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../../etc/configure.json');
const Raft = require('./raft'); // Correct class name
const loggerTemp = require('../node_modules/logger/logger');
const axios = require('axios');

class Server {
  constructor(port) {
    this.port = port;
    this.app = express();
    this.logger = new loggerTemp(port);
    this.raft = new Raft(port, config.DNs);
    this.dnName = `dn0${Math.floor((port / 100) % 10) - 1}`;
    this.dataDir = path.join(__dirname, '../../DB-data/', this.dnName, `/s0${port % 100}`);
    this.setupRoutes();
    this.raft.resetElectionTimeout();
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.get('/status', this.statusHandler.bind(this));
    this.app.get('/stats', this.statsHandler.bind(this));
    this.app.get('/db/r', this.readHandler.bind(this));
    this.app.get('/db/d', this.deleteHandler.bind(this));
    this.app.get('/election', this.handleElectionRequest.bind(this));
    this.app.post('/db/c', this.createHandler.bind(this));
    this.app.post('/db/u', this.updateHandler.bind(this));
    this.app.get('/stop', this.stopHandler.bind(this));
    this.app.get('/maintenance', this.maintenanceHandler.bind(this));
    this.app.get('/sync', this.syncIniciatedFromMaster.bind(this));
    this.app.get('/heartbeat', this.heartbeatHandler.bind(this));
  }

  statusHandler(req, res) {
    res.send({
      status: 'ok',
      master: this.raft.leader,
      start_time: this.raft.startTime.toISOString(),
      living_time: `${Math.round((Date.now() - this.raft.startTime.getTime()) / 1000)}s`,
      dataDir: this.dataDir
    });
  }

  statsHandler(req, res) {
    res.json({ success: true });
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
      res.status(500).send({ error: `${error}` });
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
      res.status(500).send({ error: `${error}` });
      this.logger.error(`Data on Server on port ${this.port} cannot be deleted, error: ${error.message || error}`);
    }
  }

  handleElectionRequest(req, res) {
    const { term, candidateId } = req.query;
    if (term > this.raft.currentTerm) {
      this.raft.currentTerm = term;
      this.raft.votedFor = candidateId;
      this.raft.state = 'follower';
      this.raft.resetElectionTimeout();
      res.send({ term: this.raft.currentTerm, voteGranted: true });
    } else if (term === this.raft.currentTerm && (this.raft.votedFor === null || this.raft.votedFor === candidateId)) {
      this.raft.votedFor = candidateId;
      res.send({ term: this.raft.currentTerm, voteGranted: true });
    } else {
      res.send({ term: this.raft.currentTerm, voteGranted: false });
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
      res.status(500).send({ error: `${error}` });
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
      res.status(500).send({ error: `${error}` });
      this.logger.error(`Data ${hash} on Server on port ${this.port} cannot be updated, error: ${error.message || error}`);
    }
  }

  stopHandler(req, res) {
    try {
      res.send({ success: true });
      this.logger.info(`Server on port ${this.port} stopped`);
      process.exit(0);
    } catch (error) {
      res.status(500).send({ error: `${error}` });
      this.logger.error(`Server on port ${this.port} cannot be stopped, error: ${error.message || error}`);
    }
  }

  maintenanceHandler(req, res) {
    res.json({ data: { message: 'Maintenance not implemented yet' }, error: 0 });
    this.logger.info(`Server on port ${this.port} did maintenance`);
  }

  heartbeatHandler(req, res) {
    this.raft.resetElectionTimeout();
    res.send({ status: 'ok' });
  }

  async syncIniciatedFromMaster(req, res) {
    try {
      this.logger.info(`Server/Master on port ${this.port} has started a sync`);
      await this.raft.syncDataToServers();
      res.json({ success: true });
    } catch (error) {
      this.logger.error(`Master Server on port ${this.port} cannot sync data with other servers on DN, error: ${error.message || error}`);
      res.status(500).send({ error: `${error.message || error}` });
    }
  }

  async syncIniciatedFromServers(req, res) {
    const leader = this.raft.leader;
    if (!leader) {
      this.logger.error(`No Leader/Master on ${this.dnName} available for synchronization`);
      return res.status(500).send({ error: 'No leader available for synchronization' });
    }
    try {
      await axios.get(`${leader}/sync`);
      res.json({ success: true });
    } catch (error) {
      this.logger.error(`Server on port ${this.port} couldn't sync from Master: ${leader} due to error: ${error.message || error}`);
      res.status(500).send({ error: `${error.message || error}` });
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

