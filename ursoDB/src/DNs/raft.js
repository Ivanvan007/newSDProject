const axios = require('axios');

class Raft {
  constructor(port, DNs) {
    this.port = port;
    this.DNs = DNs;
    this.state = 'follower';
    this.votesReceived = 0;
    this.leader = null;
    this.startTime = new Date();
  }

  isLeader() {
    return this.state === 'leader';
  }

  getLeader() {
    return this.leader;
  }

  startElection() {
    this.state = 'candidate';
    this.votesReceived = 1;
    const dn = this.DNs.find(dn => dn.servers.some(server => server.port === this.port));
    dn.servers.forEach(server => {
      if (server.port !== this.port) {
        axios.get(`http://${server.host}:${server.port}/election`).then(response => {
          if (response.data.voteGranted) {
            this.votesReceived++;
            if (this.votesReceived > dn.servers.length / 2) {
              this.state = 'leader';
              this.leader = `http://${server.host}:${server.port}`;
              this.state = 'leader';
            }
          }
        }).catch(error => {
          console.error(`Election error: ${error}`);
        });
      }
    });
  }
}

module.exports = Raft;
