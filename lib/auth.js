import crypto from 'crypto';
import {cookies} from 'next/headers';
import {db} from './db';
const mac=v=>crypto.createHmac('sha256',process.env.SESSION_SECRET||'dev-secret-change-me').update(String(v)).digest('hex');
export const setSession=id=>cookies().set('sid',id+'.'+mac(id),{httpOnly:true,sameSite:'lax',path:'/',maxAge:604800});
export const clearSession=()=>cookies().delete('sid');
export function currentUser(){
    const v=cookies().get('sid')?.value;
    if(!v)return null;
    const[id,sig]=v.split('.');
    if(!sig||sig!==mac(id))return null;
return db.prepare('SELECT * FROM users WHERE user_id=? AND is_active=1').get(id)||null}