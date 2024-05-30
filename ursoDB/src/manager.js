"use strict";

const { exec } = require('child_process');
const path = require('path');
const config = require('./../etc/configure.json');
const foreverPath = path.join(__dirname, './node_modules/utils/node_modules/.bin/forever');

const servers = config.DNs.flatMap(dn => dn.servers.map(server => `http://${server.host}:${server.port}`));

function startServers() {
  servers.forEach(server => {
    exec(`${foreverPath} start ./DNs/server.js ${server}`,
    { env: { PATH: `${process.env.PATH}:${path.join(__dirname, './node_modules/utils/node_modules/.bin')}` } },
    (err, stdout, stderr) => {
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
    exec(`${foreverPath} stop ./DNs/server.js ${server}`,
    { env: { PATH: `${process.env.PATH}:${path.join(__dirname, './node_modules/utils/node_modules/.bin')}` } },
    (err, stdout, stderr) => {
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
  console.log('Usage: manager.js <start|stop|restart>');
}
