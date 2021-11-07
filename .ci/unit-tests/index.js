import { Commands, Resolve } from "./../command.js";

const Inputs = [
    git submodule foreach git pull && cd .ci/cluster-adapter && git pull --force && npm install . && npm run test
    "git submodule init",
    "git submodule foreach git pull",
    "cd \"$(git rev-parse --show-toplevel)\"/.ci/cluster-adapter",
    "npm install . && npm run test && echo $?"
];

Resolve(Commands(Inputs));