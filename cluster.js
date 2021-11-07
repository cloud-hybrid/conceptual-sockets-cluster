const cluster = require("cluster");
const http = require("http");
const express = require('express');
const redis = require('redis');
const { Server } = require("socket.io");
const numCPUs = require("os").cpus().length;
const { setupMaster, setupWorker } = require("@socket.io/sticky");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");

const app = express();

app.get("/login", async (req, res) => {
  res.status(200);
  res.send({Message: "Must Post to Sign-In"});
});

app.post('/login', async (req, res) => {
  try {
   // ...
    res.status(200);
  } catch (err) {
    res.status(500).end();
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const redisClient = redis.createClient({
  enable_offline_queue: false,
});

const maxWrongAttemptsByIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 10;

const { RateLimiterMemory } = require('rate-limiter-flexible');
const { RateLimiterRedis } = require('rate-limiter-flexible');

const limiterSlowBruteByIP = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_ip_per_day',
  points: maxWrongAttemptsByIPperDay,
  duration: 60 * 60 * 24,
  blockDuration: 60 * 60 * 24, // Block for 1 day, if 100 wrong attempts per day
});

const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  points: maxConsecutiveFailsByUsernameAndIP,
  duration: 60 * 60 * 24 * 90, // Store number for 90 days since first fail
  blockDuration: 60 * 60, // Block for 1 hour
});

const rateLimiter = new RateLimiterMemory(
  {  // 60 Points / Minute
    points: 5,
    duration: 1,
  });


const getUsernameIPkey = (username, ip) => `${username}_${ip}`;

async function loginRoute(req, res) {
  const ipAddr = req.ip;
  const usernameIPkey = getUsernameIPkey(req.body.email, ipAddr);

  const [resUsernameAndIP, resSlowByIP] = await Promise.all([
    limiterConsecutiveFailsByUsernameAndIP.get(usernameIPkey),
    limiterSlowBruteByIP.get(ipAddr),
  ]);

  let retrySecs = 0;

  // Check if IP or Username + IP is already blocked
  if (resSlowByIP !== null && resSlowByIP.consumedPoints > maxWrongAttemptsByIPperDay) {
    retrySecs = Math.round(resSlowByIP.msBeforeNext / 1000) || 1;
  } else if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > maxConsecutiveFailsByUsernameAndIP) {
    retrySecs = Math.round(resUsernameAndIP.msBeforeNext / 1000) || 1;
  }

  if (retrySecs > 0) {
    res.set('Retry-After', String(retrySecs));
    res.status(429).send('Too Many Requests');
  } else {
    const user = authorise(req.body.email, req.body.password); // should be implemented in your project
    if (!user.isLoggedIn) {
      // Consume 1 point from limiters on wrong attempt and block if limits reached
      try {
        const promises = [limiterSlowBruteByIP.consume(ipAddr)];
        if (user.exists) {
          // Count failed attempts by Username + IP only for registered users
          promises.push(limiterConsecutiveFailsByUsernameAndIP.consume(usernameIPkey));
        }

        await Promise.all(promises);

        res.status(400).end('email or password is wrong');
      } catch (rlRejected) {
        if (rlRejected instanceof Error) {
          throw rlRejected;
        } else {
          res.set('Retry-After', String(Math.round(rlRejected.msBeforeNext / 1000)) || 1);
          res.status(429).send('Too Many Requests');
        }
      }
    }

    if (user.isLoggedIn) {
      if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > 0) {
        // Reset on successful authorisation
        await limiterConsecutiveFailsByUsernameAndIP.delete(usernameIPkey);
      }

      res.end('authorized');
    }
  }
}


if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  const httpServer = http.createServer();

  // setup sticky sessions
  setupMaster(httpServer, {
    loadBalancingMethod: "least-connection",
  });

  // setup connections between the workers
  setupPrimary();

  // Node.js > 16.0.0
  cluster.setupPrimary({
    serialization: "advanced",
  });

  httpServer.listen(3000);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("start", (event) => {
    console.log(event);
  });

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  console.log(`Worker ${process.pid} started`);

//  const httpServer = http.createServer({}, (request, response) => {
//       console.debug("[Debug] Request Header(s)", JSON.stringify(request.headers, null, 4), "\n");
//       console.debug("[Debug] Request Cookie", request.headers?.cookie, "\n");
//       console.debug("[Debug] Request Path", request?.url, "\n");
//       console.debug("[Debug] Request Method", request?.method, "\n");
//       response.statusMessage = "Successful";
//        response.setHeader("Server", "@Nexus");
//        response.setHeader("Content-Type", "Application/JSON");
//        response.writeHead(200);
//        response.end(JSON.stringify({
//            Status: 200,
//            Message: "Successful",
//            Uptime: process.uptime(),
//            Method: request.method,
//            Server: response.socket.address(),
//            Endpoint: request.url
//        }, null, 4));
//  });
  const httpServer = http.createServer(app);

  const io = new Server(httpServer);

  // use the cluster adapter
  io.adapter(createAdapter());

  // setup connection with the primary process
  setupWorker(io);

  io.on('connection', (socket) => {
    console.debug("[Debug] Connection Event ...");
    console.debug("[Debug] Namespace" + ":", "\"" + socket?.nsp.name + "\"");

    let counter = 0;
    socket?.nsp.sockets.forEach((socket, index) => {
      const $ = {
        ID: socket.id,
        Connection: socket.connected,
        Handshake: socket.handshake
      }

      counter += 1;
      console.debug("[Debug] Socket (" + counter + ")" + ":", JSON.stringify($, null, 4));
    });

    console.debug("[Debug] Total Socket(s)" + ":", counter);

    const TTY = {rows: null, columns: null};
    if (process.stdout.isTTY) {
      TTY.rows = process.stdout.rows;
      TTY.columns = process.stdout.columns;

      process.stdout.on("resize", () => {
        TTY.rows = process.stdout.rows;
        TTY.columns = process.stdout.columns;
      })
    }

    console.debug("\n" + (TTY?.columns) ? "-".repeat(TTY.columns) : "");

    socket.on("Message", ($) => {
      console.debug("[Debug] Message Event ...", JSON.stringify($, null, 4));
    const TTY = {rows: null, columns: null};
    if (process.stdout.isTTY) {
      TTY.rows = process.stdout.rows;
      TTY.columns = process.stdout.columns;

      process.stdout.on("resize", () => {
        TTY.rows = process.stdout.rows;
        TTY.columns = process.stdout.columns;
      });
    }

    console.debug("\n" + (TTY?.columns) ? "-".repeat(TTY.columns) : "");
      io.emit("Broadcast", JSON.stringify($, null, 4));
    });

    socket.on("Broadcast", async (data) => {
      console.debug("[Debug] Broadcast Event ...");

      console.debug("[Debug] Data" + ":", JSON.stringify(data, null, 4));

      try {
        await rateLimiter.consume(socket.handshake.address); // consume 1 point per event from IP

        socket.emit("Accepted", true);
        socket.broadcast.emit('Accepted', true);

      } catch(e) {
        // no available points to consume
        // emit error or warning message
        console.warn(e);

        socket.emit('blocked', { 'retry-ms': e?.msBeforeNext });

        console.warn("[Warning] Connection Rejected ...", JSON.stringify(data, null, 4));
      } finally {
        const TTY = {rows: null, columns: null};
        if (process.stdout.isTTY) {
          TTY.rows = process.stdout.rows;
          TTY.columns = process.stdout.columns;

          process.stdout.on("resize", () => {
            TTY.rows = process.stdout.rows;
            TTY.columns = process.stdout.columns;
          });

        }

        console.debug("\n" + (TTY?.columns) ? "-".repeat(TTY.columns) : "");

      }
    });

    socket.on('disconnect', () => {
      console.log("[Debug] Disconnect Event ...");
        const TTY = {rows: null, columns: null};
        if (process.stdout.isTTY) {
          TTY.rows = process.stdout.rows;
          TTY.columns = process.stdout.columns;

          process.stdout.on("resize", () => {
            TTY.rows = process.stdout.rows;
            TTY.columns = process.stdout.columns;
          });

        }

        console.debug("\n" + (TTY?.columns) ? "-".repeat(TTY.columns) : "");
    });
  });
}
