import { Commands, Resolve } from "./../command.js";

const Inputs = [
    "git submodule init",
    "git submodule foreach git checkout --force",
    "git submodule foreach git pull origin",
    "cd \"$(git rev-parse --show-toplevel)\"/.ci/archive",
    "npm install . && npm run test && echo $?"
];

Resolve(Commands(Inputs));