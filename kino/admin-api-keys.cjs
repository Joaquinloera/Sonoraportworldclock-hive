'use strict';
const crypto=require('node:crypto');
const SCOPES=Object.freeze(['research:read','research:write','assets:read','assets:propose','audit:read','agents:dispatch']);
function issueKey({owner,scopes,expiresAt,now=Date.now()}){
 if(typeof owner!=='string'||!owner.trim())throw Error('Owner required');
 if(!Array.isArray(scopes)||!scopes.length||scopes.some(s=>!SCOPES.includes(s)))throw Error('Invalid scopes');
 const expiry=Date.parse(expiresAt);if(!Number.isFinite(expiry)||expiry<=now||expiry>now+90*86400000)throw Error('Expiry must be within 90 days');
 const secret='kino_'+crypto.randomBytes(32).toString('base64url');
 const salt=crypto.randomBytes(16).toString('hex');
 const hash=crypto.scryptSync(secret,salt,32).toString('hex');
 return {secret,record:{id:crypto.randomUUID(),owner,scopes:[...new Set(scopes)],expiresAt:new Date(expiry).toISOString(),salt,hash,revokedAt:null,createdAt:new Date(now).toISOString()}};
}
function authorize({secret,record,scope,now=Date.now()}){
 if(typeof secret!=='string'||!record||!SCOPES.includes(scope)||record.revokedAt||Date.parse(record.expiresAt)<=now||!record.scopes?.includes(scope))return false;
 const calculated=crypto.scryptSync(secret,record.salt,32);
 const expected=Buffer.from(record.hash,'hex');
 return calculated.length===expected.length&&crypto.timingSafeEqual(calculated,expected);
}
function publicRecord(record){const {salt,hash,...safe}=record;return safe}
module.exports={SCOPES,issueKey,authorize,publicRecord};
