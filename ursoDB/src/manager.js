"use strict";

const { exec } = require('child_process');
const config = require('./../etc/configure.json');

const servers = config.DNs.flatMap(dn => dn.servers.map(server => `http://${server.host}:${server.port}`));

function startServers() {
  servers.forEach(server => {
    exec(`forever start src/DNs/server.js ${server}`, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error starting server ${server}: ${stderr}`);
      } else {
        console.log(`Server ${server} started: ${stdout}`);
      }
    });
  });
}

function stopServers() {
  servers.forEach(server => {
    exec(`forever stop src/DNs/server.js ${server}`, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error stopping server ${server}: ${stderr}`);
      } else {
        console.log(`Server ${server} stopped: ${stdout}`);
      }
    });
  });
}

function restartServers() {
  stopServers();
  startServers();
}

const action = process.argv[2];

if (action === 'start') {
  startServers();
} else if (action === 'stop') {
  stopServers();
} else if (action === 'restart') {
  restartServers();
} else {
  console.log('Usage: ursoDB <start|stop|restart>');
}
