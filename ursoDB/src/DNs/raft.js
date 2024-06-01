const axios = require('axios');
const loggerTemp = require('../node_modules/logger/logger');
const config = require('../../etc/configure.json');

class Raft {
  constructor(port, DNs) {
    this.port = port;
    this.DNs = DNs;
    this.state = 'follower';
    this.votesReceived = 0;
    this.logger = new loggerTemp(port);
    this.leader = null;
    this.startTime = new Date();
  }

  isLeader() {
    return this.state === 'leader';
  }

  getLeader() {
    return this.leader;
  }

  async startElection() {
    this.state = 'candidate';
    this.votesReceived++;
    const dn = this.DNs.find(dn => dn.servers.some(server => server.port === this.port));
    dn.servers.forEach(server => {
      if (server.port !== this.port) {
        axios.get(`http://${server.host}:${server.port}/election`).then(response => {
          if (response.data.voteGranted) {
            this.logger.info(`Server on ${this.port} has voted`)
            //this.votesReceived++;
          }
        }).catch(error => {
          logger.error(`Server on port ${this.port} election error: ${error}`);
        });
      }
    });
    if (this.votesReceived > dn.servers.length / 2) {
      this.state = 'leader';
      this.leader = `http://${server.host}:${server.port}`;
      this.state = 'leader';
      this.logger.info(`Server on port ${this.port} elected as leader`);
      this.notifyRP();
    }
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
