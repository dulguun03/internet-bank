import {NextResponse} from 'next/server';
import {db,checkPw} from '@/lib/db';
import {setSession,clearSession} from '@/lib/auth';
import {register,state} from '@/lib/bank';
export const dynamic='force-dynamic';
export async function POST(req){try{const b=await req.json();
if(b.mode=='logout'){clearSession();return NextResponse.json({ok:true})}
let id;if(b.mode=='register')id=register(b);else{const u=db.prepare('SELECT * FROM users WHERE username=?').get(b.username||'');
if(!u||!checkPw(b.password||'',u.password_hash))throw new Error('Wrong username or password');if(!u.is_active)throw new Error('This account is deactivated');id=u.user_id}
setSession(id);return NextResponse.json(state(db.prepare('SELECT * FROM users WHERE user_id=?').get(id)))}
catch(e){return NextResponse.json({error:e.message},{status:400})}}
