"use strict"
const axios = require('axios');
const fs = require('fs');
const loggerTemp = require('../node_modules/logger/logger');
const config = require('../../etc/configure.json');

class Raft {
  constructor(port, DNs) {
    this.port = port;
    this.DNs = DNs;
    this.state = 'follower';
    this.votesReceived = 0;
    this.logger = new loggerTemp(port);
    this.leader = undefined;
    this.startTime = new Date();
  }

  isLeader() {
    return this.state === 'leader';
  }

  getLeader() {
    return this.leader;
  }

  setLeader(port)
  {
    this.leader = `http://localhost:${port}`;
  }

  async startElection() {
    try
    {
      this.state = 'candidate';
      this.votesReceived++;
      const dn = this.DNs.find(dn => dn.servers.some(server => server.port === this.port));
      dn.servers.forEach(server => {
        if (server.port != this.port) {
          axios.get(`http://${server.host}:${server.port}/election`).then(response => {

            if (response.data.voteGranted) {
              this.logger.info(`Server on ${this.port} has voted`)
              //this.votesReceived++;
            }
          }).catch(error => {
            this.logger.error(`Server on port ${this.port} election error: ${error}`);
          });
        }
      });
      if (this.votesReceived > dn.servers.length / 2) {
        this.state = 'leader';
        this.logger.info("host: ",server.host,"\n","port", server.port);
        this.leader = `http://${server.host}:${server.port}`;
        this.logger.info(`Server on port ${this.port} elected as leader`);
        this.notifyRP();
      }
    } catch(error)
    {
      this.logger.error(`Server on port ${this.port} couldnot be elected as leader cause of ${error}`);
    }
    
  }

  async syncDataToServers() {
    if (!this.isLeader()){
      return;
    }
    
    const dn = this.DNs.find(dn => dn.servers.some(server => server.port === this.port));
    const dataDir = path.join(__dirname, '../../DB-data/', `dn0${Math.floor((this.port / 100) % 10)-1}`, `/s0${this.port % 100}`);
    let newdataDir;
    let filePath;
    let data;
    const files = fs.readdirSync(dataDir);
    dn.servers.forEach(server =>{
      newdataDir= path.join(__dirname,'../../DB-data/', `dn0${Math.floor((server.port / 100) % 10)-1}`, `/s0${server.port % 100}`);
      if (server.port !== this.port) {
        for (const file of files) {
          filePath = path.join(newdataDir, file);
          data = fs.readFileSync(filePath, 'utf8');
  
          try {
            axios.get(`http://${server.host}:${server.port}/status`).then(response => {
              if (response.status == 'ok' ){
                fs.writeFileSync(filePath, data);
                this.logger.info(`Data ${file} synced to server on port ${server.port}`);
              }
            });
          } catch (error) {
            this.logger.error(`Failed to sync data to server ${server.port}: ${error}`);
          }
        }
      }
    });
  }

  async notifyRP() {
    try {
      const rpConfig = new ReverseProxy(config.RP.port);
      await axios.get(`http://${rpConfig.host}:${rpConfig.port}/set_master`);
      this.logger.info(`RP notified of new leader on port ${this.port}`);
    } catch (error) {
      this.logger.error(`Error notifying RP: ${error}`);
    }
  }
}



module.exports = Raft;
