const serverTemplate = require('../controllers/serverTemplate');
const loggerTemp = require('../node_modules/logger/logger');
const Raft = require('./raft');

const express = require('express');
const proxy = require('express-http-proxy');

const path = require('path');

const crypto = require('crypto');
const fs = require('fs');
const config = require('../../etc/configure.json');

let port = parseInt(process.argv[2].split(':')[2], 10);

let raft = new Raft(port, config.DNs);
let dnName = `dn${Math.floor(port / 1000) - 3}`;
let dataDir = path.join(__dirname, '../../DB-data/', dnName, `/s${port % 100}`);

let app = express();
let logger;

function setUpServer(port)
{
  logger = loggerTemp;
  logger.createLogger(port);  
  app.use(express.json());

  //STATUS /status    get        pub  to return the system status(connect to each one of the DN masters
                      //and ask for the DN Status and then
                      //presents all the sentities status: the start time and the living time)
  app.get('/status',(req, res)=> {
    res.send({
      status: 'ok',
      master: raft.getLeader(),
      start_time: raft.startTime.toISOString(),
      living_time: `${Math.round((Date.now() - raft.startTime.getTime()) / 1000)}s`
    });
  });

  //STAT /stats       get         pub  return the stats associated to the service:
                                  //no each one of the CRUD operations from the current start of the DB service.
  app.get('/stats',(req, res)=> {
    const stat = servers.map(server => ({
      id: server.id,
      host: server.host,
      usage: server.usage
    }));

    resp.status(200).send({
      success: true,
      start_at: start_at.toISOString(),
      now: new Date().toISOString(),
      living_time_in_secs: Math.round((Date.now() - start_at.getTime()) / 1000),
      stat
    });
  });

  //GETS
    // |  /db/r         get     pub  to Read and return DB value associated to a key
  app.get('/db/r',(req, res)=> {
    const key = req.query.key;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const filePath = path.join(dataDir, hash);
    if (fs.existsSync(filePath))
    {
      const data = JSON.parse(fs.readFileSync(filePath));
      res.send({ success: true, data });
    } else 
    {
      res.status(404).send({ error: 'Key not found' });
    }
  });
    // | /db/d          get     pub  to Delete  a DB pair key:value identified by the key
  app.get('/db/d',(req, res)=> {
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
  });

  //ELECTION
    // | /election      get     DNp  to exchange needed information to establish the master of the DN
  app.get('/election',(req, res)=> {
    raft.startElection();
    res.send({ status: 'Election started' });
  });

  //POSTS
    // | /db/c          post    pub  to Create a DB pair key:value
  app.post('/db/c', (req, res) => {
    if (!raft.isLeader()) {
      return res.status(403).send({ error: 'Not the leader' });
    }
    const key = req.body.key;
    const value = req.body.value;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    fs.writeFileSync(path.join(dataDir, hash), JSON.stringify({ key, value }));
    res.send({ success: true });
  });

    // | /db/u          post    pub  to Update a DB pair key:value; just send
                        //members of the object to be updated; new members can be added,
                        // as members can be deleted ( "member_name": "--delete--" or "member_name": "\-\-delete\-\-"
                        // if need to update or create to the value "--delete--" )
  app.post('/db/u', (req, res) => {
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
  });
  


  //SERVER START
  app.listen(port, () => {
      logger.info(`Server started on port ${port}`);
  });
}

//CALLING SERVER TO START
setUpServer(port);
//serverTemplate.createServer(port, routes);
