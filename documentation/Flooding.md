## Flood Prevention (DDOS) ##

- https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#websocket-single-connection-prevent-flooding

### Rate Limiting ###

```javascript
const express = require('express');
const Redis = require('ioredis');
const redisClient = new Redis({ enableOfflineQueue: false });

const app = express();

const rateLimiterRedis = new RateLimiterRedis({
  storeClient: redisClient,
  points: 10, // Number of points
  duration: 1, // Per second
});

const rateLimiterMiddleware = (req, res, next) => {
   rateLimiterRedis.consume(req.ip)
      .then(() => {
          next();
      })
      .catch(_ => {
          res.status(429).send('Too Many Requests');
      });
   };

app.use(rateLimiterMiddleware);
```

### Password Brute Forcing ###

```javascript
const http = require('http');
const express = require('express');
const redis = require('redis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
// You may also use Mongo, Memory or any other limiter type

const redisClient = redis.createClient({
  enable_offline_queue: false,
});

const maxConsecutiveFailsByUsername = 5;

const limiterConsecutiveFailsByUsername = new RateLimiterRedis({
  redis: redisClient,
  keyPrefix: 'login_fail_consecutive_username',
  points: maxConsecutiveFailsByUsername,
  duration: 60 * 60 * 3, // Store number for three hours since first fail
  blockDuration: 60 * 15, // Block for 15 minutes
});

async function loginRoute(req, res) {
  const username = req.body.email;
  const rlResUsername = await limiterConsecutiveFailsByUsername.get(username);

  if (rlResUsername !== null && rlResUsername.consumedPoints > maxConsecutiveFailsByUsername) {
    const retrySecs = Math.round(rlResUsername.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(retrySecs));
    res.status(429).send('Too Many Requests');
  } else {
    const user = authorise(username, req.body.password); // should be implemented in your project

    if (!user.isLoggedIn) {
      try {
        await limiterConsecutiveFailsByUsername.consume(username);

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
      if (rlResUsername !== null && rlResUsername.consumedPoints > 0) {
        // Reset on successful authorisation
        await limiterConsecutiveFailsByUsername.delete(username);
      }

      res.end('authorised');
    }
  }
}

const app = express();

app.post('/login', async (req, res) => {
  try {
    await loginRoute(req, res);
  } catch (err) {
    res.status(500).end();
  }
});
```

### Login Endpoint ###

```javascript
const http = require('http');
const express = require('express');
const redis = require('redis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const redisClient = redis.createClient({
  enable_offline_queue: false,
});

const maxWrongAttemptsByIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 10;

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

const app = express();

app.post('/login', async (req, res) => {
  try {
    await loginRoute(req, res);
  } catch (err) {
    res.status(500).end();
  }
});
```

### Single Endpoint Flooding ###


```javascript
const app = require('http').createServer();
const io = require('socket.io')(app);
const { RateLimiterMemory } = require('rate-limiter-flexible');

app.listen(3000);

const rateLimiter = new RateLimiterMemory(
  {
    points: 5, // 5 points
    duration: 1, // per second
  });

io.on('connection', (socket) => {
  socket.on('bcast', async (data) => {
    try {
      await rateLimiter.consume(socket.handshake.address); // consume 1 point per event from IP
      socket.emit('news', { 'data': data });
      socket.broadcast.emit('news', { 'data': data });
    } catch(rejRes) {
      // no available points to consume
      // emit error or warning message
      socket.emit('blocked', { 'retry-ms': rejRes.msBeforeNext });
    }
  });
});
```


