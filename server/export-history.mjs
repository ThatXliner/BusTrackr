import {loadState} from './alerts.mjs';
const state=await loadState(process.env.ALERT_STATE_FILE || '.data/alerts.json');
for(const event of state.events)process.stdout.write(JSON.stringify(event)+'\n');
