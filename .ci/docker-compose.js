import { exec } from "child_process";

const Command = async (input) => {
    return new Promise((resolve, reject) => {
        exec(input, { maxBuffer: 1024 * 500 }, (error, stdout, stderr) => {
            if ( error ) {} else if ( stdout ) {
                console.log(stdout);
            } else {
                console.log(stderr);
            }
            resolve(stdout ? true : false);
        });
    });
};

const Promises = [
    async () => await Command("python3 -m venv .venv"),
    async () => await Command([
            process.env["PWD"],
            ".venv/bin/python3"
        ].join("/") + " "
        + "-m pip install docker-compose")
];

Promises.forEach(async ($, index) => await $());

process.exit(0);
