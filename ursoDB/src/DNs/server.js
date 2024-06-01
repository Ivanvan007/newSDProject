"use strict";
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../../etc/configure.json');
const Raft = require('./raft');
//const loggerTemp = require('../node_modules/logger/logger');
const loggerTemp = require('../node_modules/logger/logger');
const { error } = require('console');

class Server {
  constructor(port) {
    this.port = port;
    this.app = express();
    this.logger = new loggerTemp(port);
    this.raft = new Raft(port, config.DNs);
    this.dnName = `dn0${Math.floor((port / 100) % 10)-1}`;
    this.dataDir = path.join(__dirname, '../../DB-data/', this.dnName, `/s0${port % 100}`);
    this.setupRoutes();
    this.initiateElection();
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
    this.app.get('/stop', this.stopHandler.bind(this));
    this.app.get('/maintenance', this.maintenanceHandler.bind(this));
    this.app.get('/sync', this.syncIniciatedFromMaster.bind(this));
  }

  /*
   (req, res) => {
      res.json({ data: { message: 'Stopping RP' }, error: 0 });
      process.exit(0);
    });
  */

  statusHandler(req, res) {
    res.send({
      status: 'ok',
      master: this.raft.getLeader(),
      start_time: this.raft.startTime.toISOString(),
      living_time: `${Math.round((Date.now() - this.raft.startTime.getTime()) / 1000)}s`,
      dataDir: this.dataDir
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
      living_time_in_secs: Math.round((Date.now() - this.raft.startTime.getTime()) / 1000),
      dataDir: this.dataDir,
      stat
    });
  }

  readHandler(req, res) {
    let key = req.query.key;
    let hash = crypto.createHash('md5').update(key).digest('hex') +".json";
    let filePath = path.join(this.dataDir, hash);

    try
    {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath));
        res.send({ success: true, data });
      } else {
        res.status(404).send({ error: 'Key not found' });
      }
    }catch(error2)
    {
      res.status(500).send({ error: `${error2}` });
      this.logger.error(`Data on Server on port ${this.port} cannot be read, error: ${error2}`);
    }
  }

  deleteHandler(req, res) {
    if (!this.raft.isLeader()) {
      return res.status(403).send({ error: 'Not the leader' });
    }
    let key = req.query.key;
    let hash = crypto.createHash('md5').update(key).digest('hex') + ".json";
    let filePath = path.join(this.dataDir, hash);
    try
    {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.send({ success: true });
        this.logger.info(`Data ${hash} on Server on port ${this.port} delete successfully`);
      } else {
        res.status(404).send({ error: 'Key not found' });
      }
    }catch(error2)
    {
      res.status(500).send({ error: `${error2}` });
      this.logger.error(`Data on Server on port ${this.port} cannot be deleted, error: ${error2}`);
    }
    
  }

  electionHandler(req, res) {
    try
    {
      this.raft.startElection();
      res.send({ status: 'Election started' });
      this.logger.info(`Server on port ${this.port} vote for election`);
    }catch(error2)
    {
      res.status(500).send({ error: `${error2}` });
      this.logger.error(`Server on port ${this.port} cannot start election, error: ${error2}`);
    }
    
  }

  createHandler(req, res) {
    /*if (!this.raft.isLeader()) {
      return res.status(403).send({ error: 'Not the leader' });
      this.logger.error(`Data on Server on port ${this.port} cannot be created ${this.error}: 'Not the leader'}`);
    }*/
    let key = req.body.key;
    let value = req.body.value;
    let hash = crypto.createHash('md5').update(key).digest('hex') + ".json";
    try
    {
      fs.writeFileSync(path.join(this.dataDir, hash), JSON.stringify({key, value }));
      res.send({ success: true });
      this.logger.info(`Data ${hash} on Server on port ${this.port} created`);
      //this.syncIniciatedFromMaster;
    }catch(error2)
    {
      res.status(500).send({ error: `${error2}` });
      this.logger.error(`Data ${hash} on Server on port ${this.port} not created, error: ${error2}`);
    }

  }

  updateHandler(req, res) {
    /*if (!this.raft.isLeader()) {
      return res.status(403).send({ error: 'Not the leader' });
      //this.logger.error(`Data on Server on port ${this.port} cannot be created ${this.error}: 'Not the leader'`);
    }
    */
    let key = req.body.key;
    let value = req.body.value;
    let hash = crypto.createHash('md5').update(key).digest('hex') +".json";
    let filePath = path.join(this.dataDir, hash);
    try
    {
      if (fs.existsSync(filePath)) {
        let data = JSON.parse(fs.readFileSync(filePath));
        Object.assign(data.value, value);
        fs.writeFileSync(filePath, JSON.stringify(data));
        res.send({ success: true });
        this.logger.info(`Data ${hash} on Server on port ${this.port} updated`);
        //this.syncIniciatedFromMaster;
      } else {
      res.status(404).send({ error: 'Key not found' });
      this.logger.error(`Data ${hash} on Server on port ${this.port} cannot be updated ${this.error}`);
      }
    }catch(error2)
    {
      res.status(500).send({ error: `${error2}` });
      this.logger.error(`Data ${hash} on Server on port ${this.port} cannot be updated, error: ${error2}`);
    }    
  }

  stopHandler(req, res){
    try
    {
      res.send({success: true});
      this.logger.info(`Server on port ${this.port} stopped`);
      process.exit(0);
    }catch(error2)
    {
      res.status(500).send({ error: `${error2}` });
      this.logger.error(`Server on port ${this.port} cannot be stopped, error: ${error2}`);
    }
    
  };

  maintenanceHandler(req, res){
    res.json({ data: { message: 'Maintenance not implemented yet' }, error: 0 });
    this.logger.info(`Server on port ${this.port} did maintenance`);
  };

  async initiateElection(){
    try {
      const rpConfig = config.RP;
      this.logger = logger;
      await axios.get(`http://${rpConfig.host}:${rpConfig.port}/set_master`);
    } catch (error) {
      this.logger.error(`error:${error}`);
    }
  };

  async syncIniciatedFromMaster()
  {
    try
    {
      this.raft.syncDataToServers;
    }catch(error){
      this.logger.error(`Master Server on port ${this.port} cannot sync data with not servers on DN, error: ${error}`);
    }
    
  }

  async syncInciatedFromServers()
  {
    let leader = this.raft.getLeader;
    if (!leader) {
      res.status(400).send({ error: 'No leader available for synchronization' });
      this.logger.error(`There is no Leader/Master on ${this.dnName}`)
    }
    try
    {
      axios.get(leader,"/sync");
    }catch(error)
    {
      this.logger.error(`Server on port ${this.port} didnt be able to sync from Master:${leader} due to error:${error}`)
    }
    

  }


  start() {
    this.app.listen(this.port, () => {
      this.logger.info(`Server started on port ${this.port}`);
    });
  }
}

function generateMD5Hash(input) {
  return crypto.createHash('md5').update(input).digest('hex');
}

const port = parseInt(process.argv[2].split(':')[2], 10);
const server = new Server(port);
server.start();

