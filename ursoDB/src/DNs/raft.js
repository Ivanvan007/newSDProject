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
    this.log = [];  // Initialize the log
    this.nextIndex = 1; // Next log index to send
    this.matchIndex = 0; // Highest log entry known to be replicated on server
    this.commitIndex = 0; // Highest log entry known to be committed
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

  heartbeatHandler(data) {
    this.currentTerm = data.term; // Update term from leader's heartbeat
    this.leader = data.leaderId; // Update leader information
    this.resetElectionTimeout();
  }

  appendEntries(req, res) {
    const { term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommit } = req.body;

    if (term < this.currentTerm) {
      return res.status(200).json({ term: this.currentTerm, success: false });
    }

    this.currentTerm = term;
    this.leader = leaderId;
    this.resetElectionTimeout();

    // ... (Log consistency check, append new entries, etc.)
    this.log.push(...entries);
    
    if (leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(leaderCommit, this.log.length - 1);
    }

    res.status(200).json({ term: this.currentTerm, success: true, matchIndex: this.log.length - 1 });
  }

  sendHeartbeat() {
    const entriesToSend = this.log.slice(this.nextIndex);
    this.temp_DN.servers.forEach(server => {
      if (server.port !== this.port) {
        axios.post(`http://${server.host}:${server.port}/appendEntries`, {
          term: this.currentTerm,
          leaderId: this.port,
          prevLogIndex: this.nextIndex - 1,
          prevLogTerm: this.log[this.nextIndex - 2]?.term,
          entries: entriesToSend,
          leaderCommit: this.commitIndex,
        }).then(response => {
          if (response.status === 200 && response.data.success) {
            this.nextIndex = response.data.matchIndex + 1;
            this.matchIndex = response.data.matchIndex;
            this.updateCommitIndex();
          } else {
            this.nextIndex--;
          }
        }).catch(error => {
          // Handle errors (e.g., network issues)
          this.logger.error(`Error sending heartbeat to ${server.port}: ${error.message}`);
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

      await Promise.allSettled(this.temp_DN.servers.map(async (server) => {
        if (server.port !== this.port) {
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
            // Log individual errors for better debugging
            this.logger.error(`Error communicating with server ${server.port} during election: ${error.message || error}`);
            // Check for specific error types
            if (error.response) 
            {
              this.logger.error(`Server ${server.port} responded with status ${error.response.status}: ${error.response.data}`);
            } 
            else if (error.request)
            {
              this.logger.error(`No response received from server ${server.port}`);
            } else
            {
              this.logger.error(`Other error with server ${server.port}: ${error}`);
            }
          }
        }
      })).then(results => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            this.logger.error(`Error communicating with server ${this.temp_DN.servers[index].port} during election: ${result.reason.message || result.reason}`);
          }
        })});

      if (this.votesReceived > this.temp_DN.servers.length / 2) {
        this.stopHeartbeat();  // Force stop heartbeat first!!! 
        this.state = 'leader'; // Then transition to leader
        this.leader = `http://localhost:${this.port}`;
        this.logger.info(`Server on port ${this.port} elected as leader`);
        this.startHeartbeat();
        
        try {
          await this.notifyRP(dn_Name); 
        } catch (error) {
          this.logger.error(`Error notifying RP: ${error.message || error}`);
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
    const rpConfig = config.RP;
    const test = 69;
    const MAX_RETRIES = 5; 
    let retries = 0;
    let retryDelay = 50;
    const MAX_DELAY = 500; 

    async function notifyRPWithRetry() {
      try {
        const timeout = setTimeout(() => {
          throw new Error('RP notification timed out'); 
        }, 5000);

        // Send data in the 'data' property
        await axios.post(`http://${rpConfig.host}:${rpConfig.port}/set_master`, {
          data: { leader:""+this.port , dnName: ""+dn_Name }, //this.port , dn_Name
        });

        clearTimeout(timeout);
        this.logger.info(`RP notified of new leader on port ${this.port} for ${dn_Name}`);
      } catch (error) {
        if (error.message === 'RP notification timed out' || (error.response
         && error.response.status === 503 && retries < MAX_RETRIES)) 
         {
          retries++;
          const backoffFactor = Math.pow(2, retries);
          const jitter = Math.random() * 100; // Add some randomness
          retryDelay = Math.min(retryDelay * backoffFactor + jitter, MAX_DELAY);
          this.logger.warn(`RP busy or timed out, retrying notification in ${retryDelay}ms (attempt ${retries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          await notifyRPWithRetry.call(this); 
        } else {
          this.logger.error(`Error notifying RP: ${error.message || error}`);
        }
      }
    }
  
    await notifyRPWithRetry.call(this); 
}
  updateCommitIndex() {
    // ... (Raft's commit index update logic)
    let N = this.commitIndex + 1;
    while (N <= this.log.length - 1) {
      if (this.log[N].term === this.currentTerm && 
          this.temp_DN.servers.filter(server => this.matchIndex[server.port] >= N).length > this.temp_DN.servers.length / 2) {
        this.commitIndex = N;
      }
      N++;
    }
  }

}

module.exports = Raft;

