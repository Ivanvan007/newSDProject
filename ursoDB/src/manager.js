"use strict";

const { exec } = require('child_process');
const path = require('path');
const config = require('./../etc/configure.json');

const foreverPath = path.resolve(__dirname, './node_modules/utils/node_modules/.bin/forever');
const rpScriptPath = path.resolve(__dirname, './RP/RP.js');
const rpScriptPathNoContext = path.join("","/RP/RP.js")
const serverScriptPath = path.resolve(__dirname, './DNs/server.js');
const serverScriptPathNoContext = path.join("","/DNs/server.js")

const servers = config.DNs.flatMap(dn => dn.servers.map(server => `http://${server.host}:${server.port}`));

async function startRP() {
  const command = `${foreverPath} start --minUptime 1000 --spinSleepTime 1000 ${rpScriptPathNoContext}`;
  console.log(`Executing: ${command}`);
  exec(command, { env: { PATH: `${process.env.PATH};${path.join(__dirname, '../node_modules/utils/node_modules/.bin')}` } }, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error starting reverse proxy: ${stderr}`);
    } else {
      console.log(`Reverse proxy started: ${stdout}`);
      startServers();  // Start data node servers after reverse proxy
    }
  });
}

async function startServers() {
  servers.forEach(server => {
    const command = `${foreverPath} start --minUptime 1000 --spinSleepTime 1000 ${serverScriptPathNoContext} ${server}`;
    console.log(`Executing: ${command}`);
    exec(command, { env: { PATH: `${process.env.PATH};${path.join(__dirname, '../node_modules/utils/node_modules/.bin')}` } }, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error starting server ${server}: ${stderr}`);
      } else {
        console.log(`Server ${server} started: ${stdout}`);
      }
    });
  });
}

async function stopRP() {
  const command = `${foreverPath} stop ${rpScriptPathNoContext}`;
  console.log(`Executing: ${command}`);
  exec(command, { env: { PATH: `${process.env.PATH};${path.join(__dirname, '../node_modules/utils/node_modules/.bin')}` } }, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error stopping reverse proxy: ${stderr}`);
    } else {
      console.log(`Reverse proxy stopped: ${stdout}`);
      stopServers();  // Stop data node servers after reverse proxy
    }
  });
}

async function stopServers() {
  servers.forEach(server => {
    const command = `${foreverPath} stop ${serverScriptPathNoContext} ${server}`;
    console.log(`Executing: ${command}`);
    exec(command, { env: { PATH: `${process.env.PATH};${path.join(__dirname, '../node_modules/utils/node_modules/.bin')}` } }, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error stopping server ${server}: ${stderr}`);
      } else {
        console.log(`Server ${server} stopped: ${stdout}`);
      }
    });
  });
}

async function restartServers() {
  await stopRP();
  startRP();
}

const action = process.argv[2];

if (action === 'start') {
  startRP();
} else if (action === 'stop') {
  stopRP();
} else if (action === 'restart') {
  restartServers();
} else {
  console.log('Usage: manager.js <start|stop|restart>');
}
