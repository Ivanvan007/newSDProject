"use strict";
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const loggerTemp = require('../node_modules/logger/logger');
const config = require('../../etc/configure.json');

const ELECTION_TIMEOUT_MIN = 150; // In milliseconds
const ELECTION_TIMEOUT_MAX = 300; // In milliseconds
const HEARTBEAT_INTERVAL = 50; // In milliseconds

var dn_Name = "";

class Raft {
  constructor(port, DNs) {
    this.port = port;
    this.DNs = DNs;
    this.state = 'follower';
    this.votesReceived = 0;
    this.logger = new loggerTemp(port);
    this.leader = undefined;
    this.startTime = new Date();
    this.electionTimeout = null;
    this.heartbeatInterval = null;
    this.currentTerm = 0; // Initialize current term
    this.votedFor = null; // Initialize votedFor
    this.temp_DN;
    this.findDatanode(this.port, this.DNs);
    this.resetElectionTimeout();
  }

  findDatanode(port, DNs)
  {
    this.temp_DN = DNs.find(dn => dn.servers.some(server => server.port == port));
  }

  resetElectionTimeout() {
    if (this.electionTimeout) {
      clearTimeout(this.electionTimeout);
    }
    this.electionTimeout = setTimeout(() => this.startElection(), this.randomElectionTimeout());
  }

  randomElectionTimeout() {
    return Math.floor(Math.random() * (ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN + 1)) + ELECTION_TIMEOUT_MIN;
  }

  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  sendHeartbeat() {
    
    this.temp_DN.servers.forEach(server => {
      if (server.port != this.port) {
        axios.get(`http://${server.host}:${server.port}/heartbeat`)
          .then(response => {
            if (response.data.status === 'ok') {
              this.logger.info(`Heartbeat acknowledged by server on port ${server.port}`);
            }
          }).catch(error => {
            this.logger.error(`Heartbeat error to server on port ${server.port}: ${error.message || error}`);
          });
      }
    });
  }

  async startElection() {

    dn_Name = `dn0${Math.floor((this.port / 100) % 10) - 1}`;
    try {
      if (this.state === 'leader') {
        //this.notifyRP(dn_Name)
        return;
      }

      this.state = 'candidate';
      this.votesReceived = 1; // Start vote count with self-vote
      this.currentTerm++;
      this.votedFor = this.port; // Vote for self

      await Promise.all(this.temp_DN.servers.map(async (server) => {
        if (server.port != this.port) {
          try {
            const response = await axios.get(`http://${server.host}:${server.port}/election`, {
              params: { term: this.currentTerm, candidateId: this.port }
            });
            if (response.data.voteGranted) {
              this.logger.info(`Server on ${this.port} has received a vote from ${server.port}`);
              this.votesReceived++;
            } else if (response.data.term > this.currentTerm) {
              this.currentTerm = response.data.term;
              this.state = 'follower';
              this.votedFor = null;
              this.resetElectionTimeout();
              return;
            }
          } catch (error) {
            this.logger.error(`Server on port ${server.port} election error: ${error.message || error}`);
          }
        }
      }));

      if (this.votesReceived > this.temp_DN.servers.length / 2) {
        this.leader = `http://localhost:${this.port}`;
        this.logger.info(`Server on port ${this.port} elected as leader`);
        this.stopHeartbeat();
        this.startHeartbeat();
        try
        {
          await this.notifyRP(dn_Name);
          this.state = 'leader';

        }catch(error)
        {
          this.logger.error(`Error into notifyRP function and leader setting: ${error.message || error}`);
        }        
       
      } else {
        this.logger.info(`Server on port ${this.port} did not receive enough votes`);
        this.state = 'follower';
        this.resetElectionTimeout();
      }
    } catch (error) {
      this.logger.error(`Server on port ${this.port} could not be elected as leader due to ${error.message || error}`);
      this.state = 'follower';
      this.resetElectionTimeout();
    }
  }

  async notifyRP(dn_Name) {
    try {
      const rpConfig = config.RP;
      await axios.get(`http://${rpConfig.host}:${rpConfig.port}/set_master`, {
        params: { leader: this.port, dn_Name }
      });
      this.logger.info(`RP notified of new leader on port ${this.port} for ${dn_Name}`);
    } catch (error) {
      this.logger.error(`Error notifying RP: ${error.message || error}`);
    }
  }
}

module.exports = Raft;

