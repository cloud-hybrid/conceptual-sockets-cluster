const cluster = require("cluster");
const http = require("http");
const express = require("express");
const redis = require("redis");
const { Server } = require("socket.io");
const numCPUs = require("os").cpus().length;
const { setupMaster, setupWorker } = require("@socket.io/sticky");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");

if ( process.env["PWD"] !== process.env.npm_config_local_prefix ) {
    console.error("[Error] Invalid Start Command");
    console.error("    >>> $ npm run start");

    process.exit(-1);
}

const app = express();

app.get("/login", async (req, res) => {
    res.status(200);
    res.send({ Message: "Must Post to Sign-In" });
});

app.post("/login", async (req, res) => {
    try {
        // ...
        res.status(200);
    } catch ( err ) {
        res.status(500).end();
    }
});

app.get("/", (req, res) => {
    res.sendFile([ process.env["PWD"], "public", "/index.html" ].join("/"));
});

const { RateLimiterMemory } = require("rate-limiter-flexible");

const rateLimiter = new RateLimiterMemory(
    {  // 60 Points / Minute
        points: 5,
        duration: 1
    });

if ( cluster.isMaster ) {
    console.debug("[Debug] Primary Node PID" + ":", "\t" + process.pid);
    console.debug("  --> http://localhost:3000", "\n");

    const httpServer = http.createServer();

    // setup sticky sessions
    setupMaster(httpServer, {
        loadBalancingMethod: "least-connection"
    });

    // setup connections between the workers
    setupPrimary();

    // Node.js > 16.0.0
    cluster.setupPrimary({
        serialization: "advanced"
    });

    httpServer.listen(3000);

    for ( let i = 0; i < numCPUs; i++ ) {
        cluster.fork();
    }

    cluster.on("start", (event) => console.log(JSON.stringify(event, null, 4) + "\n"));

    cluster.on("exit", (worker) => {
        console.warn("[Warning] Worker Node Failure", JSON.stringify(worker, null, 4));
        console.debug("[Debug] Forking Additional Node ...");

        cluster.fork();
    });
} else {
    console.debug("[Debug] Auxiliary Node PID" + ":", "\t" + process.pid, "\n");

    const httpServer = http.createServer(app);

    const io = new Server(httpServer);

    // use the cluster adapter
    io.adapter(createAdapter());

    // setup connection with the primary process
    setupWorker(io);

    io.on("connection", (socket) => {
        console.debug("[Debug] Connection Event ...");
        console.debug("[Debug] Namespace" + ":", "\"" + socket?.nsp.name + "\"");

        let counter = 0;
        socket?.nsp.sockets.forEach((socket, index) => {
            const $ = {
                ID: socket.id,
                Connection: socket.connected,
                Handshake: socket.handshake
            };

            counter += 1;
            console.debug("[Debug] Socket (" + counter + ")" + ":", JSON.stringify($, null, 4));
        });

        console.debug("[Debug] Total Socket(s)" + ":", counter);

        const TTY = { rows: null, columns: null };
        if ( process.stdout.isTTY ) {
            TTY.rows = process.stdout.rows;
            TTY.columns = process.stdout.columns;

            process.stdout.on("resize", () => {
                TTY.rows = process.stdout.rows;
                TTY.columns = process.stdout.columns;
            });
        }

        console.debug("\n" + (TTY?.columns) ? "-".repeat(TTY.columns) : "");

        socket.on("Message", ($) => {
            console.debug("[Debug] Message Event ...", JSON.stringify($, null, 4));
            const TTY = { rows: null, columns: null };
            if ( process.stdout.isTTY ) {
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
                socket.broadcast.emit("Accepted", true);

            } catch ( e ) {
                // no available points to consume
                // emit error or warning message
                console.warn(e);

                socket.emit("blocked", { "retry-ms": e?.msBeforeNext });

                console.warn("[Warning] Connection Rejected ...", JSON.stringify(data, null, 4));
            }
            finally {
                const TTY = { rows: null, columns: null };
                if ( process.stdout.isTTY ) {
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

        socket.on("disconnect", () => {
            console.log("[Debug] Disconnect Event ...");
            const TTY = { rows: null, columns: null };
            if ( process.stdout.isTTY ) {
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
