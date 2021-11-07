import { Commands, Resolve } from "./../command.js";

const Inputs = [
    "git submodule init",
    "git submodule foreach git pull",
    "cd \"$(git rev-parse --show-toplevel)\"/.ci/cluster-adapter",
    "npm install . && npm run test && echo $?"
];

Resolve(Commands(Inputs));