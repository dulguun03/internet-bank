import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {act,state} from '@/lib/bank';
export const dynamic='force-dynamic';
export async function POST(req){const u=currentUser();if(!u)return NextResponse.json({error:'Not signed in'},{status:401});
try{const{action,args}=await req.json();act(u,action,args);return NextResponse.json(state(u))}
catch(e){return NextResponse.json({error:e.message},{status:400})}}
