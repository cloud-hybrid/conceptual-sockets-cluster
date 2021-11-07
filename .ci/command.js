import { exec } from "child_process";

/***
 *
 * @param input {String}
 *
 * @returns {Promise<{string}>}
 *
 * @constructor
 *
 */

export const Command = async (input) => {
    return new Promise((resolve, reject) => {
        exec(input, { maxBuffer: 1024 * 500 }, (error, stdout, stderr) => {
            if ( error ) {
                console.warn("[Error]", error);

                reject(error);
            } else if ( stdout ) {
                console.log(stdout);
            } else {
                console.log(stderr);
            }
            resolve(stdout.trim());
        });
    });
};

/***
 *
 * @param inputs {Array<String>}
 *
 * @returns {*[]}
 *
 * @constructor
 *
 */

export const Commands = (inputs) => {
    const Promises = [];

    inputs.forEach((input, _) => Promises.push(async () => await Command(input)));

    return Promises;
};

/***
 *
 * @param promises {Array<Promise<String>>}
 *
 * @returns {Promise<void>}
 *
 * @constructor
 *
 */

export const Resolve = (promises) => {
    promises.forEach(async ($) => await $());
};
