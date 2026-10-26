import {parseAlert, recordAlert} from './alerts.mjs';

export async function scanMailbox(client, state, config, persist, backfillDays = 7) {
  const lock = await client.getMailboxLock(config.mailbox || 'INBOX', {readOnly:true});
  try {
    const validity = String(client.mailbox.uidValidity);
    const mailboxKey = JSON.stringify([config.host, config.user, config.mailbox || 'INBOX']);
    const upper = client.mailbox.uidNext - 1;
    const fresh = !state.cursor || state.cursor.validity !== validity || state.cursor.mailboxKey !== mailboxKey;
    let uids = [];
    if (fresh) {
      if (backfillDays > 0 && upper > 0) uids = await client.search({since:new Date(Date.now()-backfillDays*86400_000), from:config.sender}, {uid:true}) || [];
      state.cursor = {validity, mailboxKey, uid:0};
    } else if (upper > state.cursor.uid) {
      uids = await client.search({from:config.sender, uid:`${state.cursor.uid + 1}:${upper}`}, {uid:true}) || [];
    }
    for (const uid of uids.filter(uid=>uid>state.cursor.uid && uid<=upper).sort((a,b)=>a-b)) {
      const meta = await client.fetchOne(String(uid), {size:true}, {uid:true});
      if (meta && meta.size <= 2_000_000) {
        const message = await client.fetchOne(String(uid), {source:true, internalDate:true}, {uid:true});
        if (message?.source) recordAlert(state, await parseAlert(message.source, config, message.internalDate ? new Date(message.internalDate) : new Date()), config.cooldownSeconds);
      }
      state.cursor.uid = uid;
      await persist();
    }
    state.cursor.uid = upper;
    await persist();
  } finally { lock.release(); }
}
export async function mailboxAuth(env) {
  if (env.GOOGLE_REFRESH_TOKEN) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Set Google OAuth client credentials');
    const response = await fetch('https://oauth2.googleapis.com/token', {method:'POST', signal:AbortSignal.timeout(20_000), body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID, client_secret:env.GOOGLE_CLIENT_SECRET, refresh_token:env.GOOGLE_REFRESH_TOKEN, grant_type:'refresh_token'})});
    if (!response.ok) throw new Error('Google OAuth refresh failed');
    const data = await response.json();
    if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Google OAuth response missing access token');
    return {user:env.IMAP_USER, accessToken:data.access_token};
  }
  return {user:env.IMAP_USER, ...(env.IMAP_ACCESS_TOKEN ? {accessToken:env.IMAP_ACCESS_TOKEN} : {pass:env.IMAP_PASSWORD})};
}
