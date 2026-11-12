import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {state} from '@/lib/bank';
export const dynamic='force-dynamic';
export async function GET(){const u=currentUser();return u?NextResponse.json(state(u)):NextResponse.json({error:'Not signed in'},{status:401})}
