import { Commands, Resolve } from "./../command.js";

const Inputs = [
    "git diff --exit-code || git add --all",
    "git diff --exit-code || git commit --message \"Pre-Unit-Testing\"",
    "git diff --exit-code || git push",
    "git submodule init",
    "git config --file \".gitconfig\" pull.rebase false",
    "git submodule update --recursive",
    "git submodule foreach git checkout",
    "git submodule foreach git pull origin",
    "git checkout --force",
    "cd \"$(git rev-parse --show-toplevel)\"/.ci/archive",
    "npm install . && npm run test && echo $?"
];

Resolve(Commands(Inputs));