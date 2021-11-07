(process.stdout.isTTY) && console.debug(process.env, "\n");

(process.stdout.isTTY) ? process.exit(0)
    : process.exit(-1);

