const serverTemplate = require('../controllers/serverTemplate');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Raft = require('./raft');
const config = require('../../etc/configure.json');

let port = parseInt(process.argv[2].split(':')[2], 10);

let raft = new Raft(port, config.DNs);
let dnName = `dn${Math.floor(port / 1000) - 3}`;
let dataDir = path.join(__dirname, '../../DB-data/', dnName, `/s${port % 100}`);

const routes = [
  {
    method: 'get',
    path: '/status',
    handler: (req, res) => {
      res.send({
        status: 'ok',
        master: raft.getLeader(),
        start_time: raft.startTime.toISOString(),
        living_time: `${Math.round((Date.now() - raft.startTime.getTime()) / 1000)}s`
      });
    }
  },
  {
    method: 'post',
    path: '/db/c',
    handler: (req, res) => {
      if (!raft.isLeader()) {
        return res.status(403).send({ error: 'Not the leader' });
      }
      const key = req.body.key;
      const value = req.body.value;
      const hash = crypto.createHash('md5').update(key).digest('hex');
      fs.writeFileSync(path.join(dataDir, hash), JSON.stringify({ key, value }));
      res.send({ success: true });
    }
  },
  {
    method: 'get',
    path: '/db/r',
    handler: (req, res) => {
      const key = req.query.key;
      const hash = crypto.createHash('md5').update(key).digest('hex');
      const filePath = path.join(dataDir, hash);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath));
        res.send({ success: true, data });
      } else {
        res.status(404).send({ error: 'Key not found' });
      }
    }
  },
  {
    method: 'post',
    path: '/db/u',
    handler: (req, res) => {
      if (!raft.isLeader()) {
        return res.status(403).send({ error: 'Not the leader' });
      }
      const key = req.body.key;
      const value = req.body.value;
      const hash = crypto.createHash('md5').update(key).digest('hex');
      const filePath = path.join(dataDir, hash);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath));
        Object.assign(data.value, value);
        fs.writeFileSync(filePath, JSON.stringify(data));
        res.send({ success: true });
      } else {
        res.status(404).send({ error: 'Key not found' });
      }
    }
  },
  {
    method: 'get',
    path: '/db/d',
    handler: (req, res) => {
      if (!raft.isLeader()) {
        return res.status(403).send({ error: 'Not the leader' });
      }
      const key = req.query.key;
      const hash = crypto.createHash('md5').update(key).digest('hex');
      const filePath = path.join(dataDir, hash);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.send({ success: true });
      } else {
        res.status(404).send({ error: 'Key not found' });
      }
    }
  },
  {
    method: 'get',
    path: '/election',
    handler: (req, res) => {
      raft.startElection();
      res.send({ status: 'Election started' });
    }
  }
];

console.log("Is this exec? ",serverTemplate.createServer(port, routes));
