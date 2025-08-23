


must run from:
cd ~/prod/bourne

while true; do   node ./agent/buildProd/index.js --configFile=config-prod.yaml;   sleep 1; done

while true; do pnpm serve; sleep 1; done;

while true; do pnpm start; sleep 1; done;

while true; do   node ./agent/buildDev/index.js --configFile=config-dev.yaml;   sleep 1; done