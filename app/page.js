'use client';
import {useState,useEffect} from 'react';
const FX={USD:1,EUR:1.08,GBP:1.27};
const fmt=(n,c='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency:c}).format(n);
const D=s=>s?new Date(String(s).replace(' ','T')+(String(s).includes('Z')?'':'Z')).toLocaleDateString('en-US',{
    month:'short',
    day:'numeric',
    year:'numeric'}):'-';
const pmt=l=>{const r=l.annual_interest_rate/1200;return l.principal_amount*r/(1-(1+r)**-l.term_months)};
async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body&&JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed');return j}

const Money=({v,c='USD'})=>{const[x,setX]=useState(0);useEffect(()=>{let f,t0=performance.now();const s=t=>{const k=Math.min(1,(t-t0)/1000);setX(v*(1-(1-k)**4));if(k<1)f=requestAnimationFrame(s)};f=requestAnimationFrame(s);return()=>cancelAnimationFrame(f)},[v]);return <>{fmt(x,c)}</>};
const Bar=({p})=>{const[w,setW]=useState(0);useEffect(()=>{const t=setTimeout(()=>setW(p),80);return()=>clearTimeout(t)},[p]);return <div className="bar"><i style={{width:w+'%'}}/></div>};
const Tag=({s})=><span className={'tag '+(/active|approved|completed|paid/.test(s)?'ok':/reject|blocked|closed/.test(s)?'no':'wa')}>{s}</span>;
const Tbl=({h,rows})=>rows.length?<div className="tw"><table><thead><tr>{h.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="rise" style={{'--i':Math.min(i,10)}}>{r.map((x,j)=><td key={j}>{x}</td>)}</tr>)}</tbody></table></div>:<p className="mu">Nothing here yet.</p>;
const TxTable=({ts,accs})=><Tbl h={['Date','Description','Type','Amount','Balance']} rows={ts.map(t=>{const c=accs.find(a=>a.account_id==t.account_id)?.currency_code;return[D(t.transaction_date),t.description,t.type_name,<span className={t.direction=='credit'?'cr':'db'}>{t.direction=='credit'?'+':'-'}{fmt(t.amount,c)}</span>,fmt(t.balance_after,c)]})}/>;

function Modal({m,close}){const[busy,setBusy]=useState(false);if(!m)return null;
return <div className="mo" onClick={e=>e.target===e.currentTarget&&close()}><form className="md" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await m.ok(Object.fromEntries(new FormData(e.target)));close()}catch{setBusy(false)}}}>
<h3>{m.title}</h3>{m.fields.map(f=><label key={f.n}>{f.l}{f.o?<select name={f.n} defaultValue={f.v}>{f.o.map(o=>{const[v,t]=Array.isArray(o)?o:[o,o];return <option key={v} value={v}>{t}</option>})}</select>:<input name={f.n} type={f.t||'text'} step="any" defaultValue={f.v} required/>}</label>)}
<div className="row end"><button type="button" className="b s" onClick={close}>Cancel</button><button className="b" disabled={busy}>{m.btn||'Confirm'}</button></div></form></div>}

function Auth({onDone,say}){const[mode,setMode]=useState('login');
const submit=async e=>{e.preventDefault();try{onDone(await api('/api/auth',{mode,...Object.fromEntries(new FormData(e.target))}))}catch(x){say(x.message,1)}};
return <div className="lg"><div className="lb"><div className="logo" style={{padding:0}}><i/>Meridian</div><div className="mu">Banking that keeps its books straight.</div>
<div className="tabs">{[['login','Sign in'],['register','Register']].map(([k,t])=><button key={k} className={mode==k?'on':''} onClick={()=>setMode(k)}>{t}</button>)}</div>
<form onSubmit={submit} key={mode}>{mode=='register'&&<div className="row"><label style={{flex:1}}>First name<input name="first" required/></label><label style={{flex:1}}>Last name<input name="last" required/></label></div>}
<label>Username<input name="username" required/></label><label>Password<input name="password" type="password" required/></label><button className="b" style={{width:'100%'}}>{mode=='login'?'Sign in':'Create account'}</button></form>
<p className="mu" style={{marginBottom:0}}>Demo: jane / jane123 · omar / omar123 · admin / admin123</p></div></div>}

const NAV={customer:[['dash','◈','Overview'],['accounts','▣','Accounts'],['transfer','⇄','Transfers'],['tx','≡','Transactions'],['cards','▭','Cards'],['loans','◔','Loans'],['notif','●','Notifications']],admin:[['review','◔','Loan review'],['audit','≡','Audit log'],['notif','●','Notifications']]};

export default function Page(){
const[S,setS]=useState(null),[ready,setReady]=useState(false),[view,setView]=useState('dash'),[modal,setModal]=useState(null),[toast,setToast]=useState(null),[flip,setFlip]=useState({}),[F,setF]=useState({});
const say=(m,e)=>{setToast({m,e,k:Date.now()});setTimeout(()=>setToast(null),3000)};
const enter=s=>{setS(s);setView(s.me.role=='admin'?'review':'dash')};
useEffect(()=>{api('/api/state').then(enter).catch(()=>{}).finally(()=>setReady(true))},[]);
const act=async(action,args,msg)=>{try{setS(await api('/api/act',{action,args}));msg&&say(msg)}catch(e){say(e.message,1);throw e}};
const ask=(title,fields,ok,btn)=>setModal({title,fields,ok,btn});
const out=async()=>{await api('/api/auth',{mode:'logout'});setS(null)};
const toastEl=toast&&<div key={toast.k} className={'toast'+(toast.e?' e':'')}>{toast.m}</div>;
if(!ready)return null;
if(!S)return <><Auth onDone={enter} say={say}/>{toastEl}</>;

const adm=S.me.role=='admin',nav=NAV[S.me.role],cur=nav.find(n=>n[0]==view)||nav[0],unread=S.notes.filter(n=>!n.is_read).length;
const accs=S.accounts||[],opts=accs.filter(a=>a.status=='active').map(a=>[a.account_id,`${a.type_name} ${a.account_number.slice(-4)} (${fmt(a.balance,a.currency_code)})`]);
const amt=(title,action,btn)=>id=>ask(title,[{n:'amount',l:'Amount',t:'number'}],d=>act(action,{id,amount:d.amount},title+' complete'),btn);

const Dash=()=>{const total=accs.reduce((s,a)=>s+a.balance*FX[a.currency_code],0);let run=0;const all=[...S.tx].reverse().map(t=>run+=(t.direction=='credit'?1:-1)*t.amount*FX[accs.find(a=>a.account_id==t.account_id)?.currency_code||'USD']);let p=all.slice(-30);if(p.length<2)p=[0,0];
const mn=Math.min(...p),mx=Math.max(...p),d=p.map((v,i)=>`${i?'L':'M'}${(i*600/(p.length-1)).toFixed(1)} ${(110-(v-mn)/(mx-mn||1)*100).toFixed(1)}`).join(' ');
const owed=S.loans.filter(l=>l.status=='active').reduce((s,l)=>s+l.outstanding_balance,0);
return <><div className="g"><div className="c rise" style={{gridColumn:'span 2'}}><div className="mu">Total balance (USD equivalent)</div><div className="big"><Money v={total}/></div><svg className="spark" viewBox="0 0 600 120" preserveAspectRatio="none" style={{width:'100%',height:110}}><path pathLength="1" d={d}/></svg></div>
<div className="c rise" style={{'--i':1}}><div className="mu">Loans outstanding</div><div className="big"><Money v={owed}/></div><div className="mu">{S.cards.length} cards on your accounts</div></div></div>
<h3 className="mt">Your accounts</h3><div className="g">{accs.map((a,i)=><AccCard key={a.account_id} a={a} i={i}/>)}</div>
<h3 className="mt">Recent activity</h3><div className="c"><TxTable ts={S.tx.slice(0,6)} accs={accs}/></div></>};
const AccCard=({a,i,full})=><div className="c rise" style={{'--i':i}}><div className="row sp"><b>{a.type_name}</b><Tag s={a.status}/></div><div className="mu">{a.account_number}</div><div className="big"><Money v={a.balance} c={a.currency_code}/></div>
{full&&a.status=='active'&&<div className="row" style={{marginTop:10}}><button className="b sm" onClick={()=>amt('Deposit','deposit','Deposit')(a.account_id)}>Deposit</button><button className="b sm s" onClick={()=>amt('Withdraw','withdraw','Withdraw')(a.account_id)}>Withdraw</button><button className="b sm s" onClick={()=>act('close',{id:a.account_id},'Account closed').catch(()=>{})}>Close</button></div>}</div>;
const Accounts=()=><><div className="row sp" style={{marginBottom:16}}><span className="mu">Open as many accounts as you need.</span><button className="b" onClick={()=>ask('Open account',[{n:'type',l:'Account type',o:S.types.map(t=>[t.account_type_id,t.type_name])},{n:'cur',l:'Currency',o:S.cur.map(c=>c.currency_code)}],d=>act('open',d,'Account opened'),'Open account')}>Open account</button></div><div className="g">{accs.map((a,i)=><AccCard key={a.account_id} a={a} i={i} full/>)}</div></>;
const Transfer=()=><div className="g2"><form className="c rise" onSubmit={async e=>{e.preventDefault();const f=e.target,d=Object.fromEntries(new FormData(f));try{await act('transfer',d,'Transfer sent');f.reset()}catch{}}}><h3>Send money</h3>
<label>From<select name="from">{opts.map(o=><option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></label><label>To account number<input name="to" list="dl" required placeholder="MB…"/></label><datalist id="dl">{S.others.map(o=><option key={o.account_number} value={o.account_number}>{o.first_name} ({o.currency_code})</option>)}</datalist>
<label>Amount<input name="amount" type="number" step="any" required/></label><label>Note<input name="desc" placeholder="Rent, dinner…"/></label><button className="b">Send</button></form>
<div className="c rise" style={{'--i':1}}><h3>Recent transfers</h3><TxTable ts={S.tx.filter(t=>t.type_name=='Transfer').slice(0,10)} accs={accs}/></div></div>;
const Tx=()=>{const ts=S.tx.filter(t=>(!F.a||t.account_id==F.a)&&(!F.t||t.type_name==F.t));
return <><div className="row" style={{marginBottom:14}}><select style={{width:'auto'}} value={F.a||''} onChange={e=>setF({...F,a:e.target.value})}><option value="">All accounts</option>{accs.map(a=><option key={a.account_id} value={a.account_id}>{a.account_number}</option>)}</select><select style={{width:'auto'}} value={F.t||''} onChange={e=>setF({...F,t:e.target.value})}><option value="">All types</option>{['Deposit','Withdrawal','Transfer','Card Payment','Loan Payment','Loan Disbursement'].map(t=><option key={t}>{t}</option>)}</select></div><div className="c"><TxTable ts={ts} accs={accs}/></div></>};
const Cards=()=><><div className="row sp" style={{marginBottom:16}}><span className="mu">Tap a card to flip it.</span><button className="b" onClick={()=>ask('Issue card',[{n:'account',l:'Linked account',o:opts},{n:'type',l:'Card type',o:['Debit','Credit','Virtual']}],d=>act('issueCard',d,'Card issued'),'Issue card')}>Issue card</button></div>
<div className="g">{S.cards.map((c,i)=><div key={c.card_id} className="rise" style={{'--i':i}}><div className={'cd '+(flip[c.card_id]?'f ':'')+(c.status=='blocked'?'fz':'')} onClick={()=>setFlip({...flip,[c.card_id]:!flip[c.card_id]})}><div className="ci">
<div className="fr"><div className="row sp"><b>Meridian {c.card_type}</b><span className="chip"/></div><div style={{fontSize:20,letterSpacing:3}}>•••• •••• •••• {c.card_last_four}</div><div className="row sp"><span>{S.me.name.toUpperCase()}</span><span>{String(c.expiry_month).padStart(2,'0')}/{String(c.expiry_year).slice(-2)}</span></div></div>
<div className="bk"><div>Token<br/><b>{c.card_token}</b></div><div>Daily limit <b>{fmt(c.daily_limit)}</b><br/>Status <b>{c.status}</b></div><div style={{opacity:.6}}>Issued {D(c.issued_at)}</div></div></div></div>
<div className="row" style={{marginTop:10}}><button className="b sm s" onClick={()=>act('freeze',{id:c.card_id},c.status=='active'?'Card frozen':'Card unfrozen').catch(()=>{})}>{c.status=='active'?'Freeze':'Unfreeze'}</button>
<button className="b sm" onClick={()=>ask('Test purchase',[{n:'merchant',l:'Merchant',v:'Coffee Lab'},{n:'category',l:'Category',o:['Food','Travel','Shopping','Bills']},{n:'amount',l:'Amount',t:'number'}],d=>act('buy',{id:c.card_id,...d},'Payment approved'),'Pay')}>Test purchase</button>
<button className="b sm s" onClick={()=>ask('Daily limit',[{n:'limit',l:'New daily limit',t:'number',v:c.daily_limit}],d=>act('limit',{id:c.card_id,limit:d.limit},'Limit updated'),'Save limit')}>Limit</button></div></div>)}{!S.cards.length&&<p className="mu">No cards yet. Issue your first one.</p>}</div>
<h3 className="mt">Card payments</h3><div className="c"><Tbl h={['Date','Merchant','Category','Amount']} rows={S.cardTx.map(x=>[D(x.created_at),x.merchant_name,x.merchant_category,fmt(x.amount)])}/></div></>;
const Loans=()=><><div className="g">{S.loanTypes.map((t,i)=><div key={t.loan_type_id} className="c rise" style={{'--i':i}}><h3>{t.type_name} loan</h3><div className="big">{t.interest_rate}%</div><div className="mu">{fmt(t.min_amount)} to {fmt(t.max_amount)} · {t.min_term_months}-{t.max_term_months} months</div>
<button className="b sm" style={{marginTop:12}} onClick={()=>ask(t.type_name+' loan',[{n:'amount',l:`Amount (${fmt(t.min_amount)}-${fmt(t.max_amount)})`,t:'number'},{n:'term',l:`Term in months (${t.min_term_months}-${t.max_term_months})`,t:'number'},{n:'purpose',l:'Purpose'},{n:'income',l:'Annual income',t:'number',v:48000},{n:'debt',l:'Existing monthly debt',t:'number',v:0},{n:'score',l:'Credit score (300-850)',t:'number',v:700}],async d=>{await act('apply',{type:t.loan_type_id,...d});say('Application received - see status below')},'Submit application')}>Apply</button></div>)}</div>
<h3 className="mt">Your loans</h3><div className="g">{S.loans.map((l,i)=><div key={l.loan_id} className="c rise" style={{'--i':i}}><div className="row sp"><b>Loan #{l.loan_id}</b><Tag s={l.status}/></div><div className="big"><Money v={l.outstanding_balance}/></div><Bar p={100*(1-l.outstanding_balance/l.principal_amount)}/><div className="mu">Monthly {fmt(pmt(l))} · ends {D(l.end_date)} · {l.paid} payments made</div>
{l.status=='active'&&<button className="b sm k" style={{marginTop:10}} onClick={()=>ask('Pay installment',[{n:'account',l:'Pay from',o:opts}],d=>act('payLoan',{id:l.loan_id,...d},'Installment paid'),'Pay '+fmt(pmt(l)))}>Pay installment</button>}</div>)}{!S.loans.length&&<p className="mu">No loans yet.</p>}</div>
<h3 className="mt">Applications</h3><div className="c"><Tbl h={['Applied','Requested','Term','Status','Note']} rows={S.apps.map(a=>[D(a.applied_at),fmt(a.requested_amount),a.term_months+' mo',<Tag s={a.status}/>,a.rejection_reason||''])}/></div></>;
const Notif=()=><><div className="row sp" style={{marginBottom:16}}><span className="mu">{unread} unread</span><button className="b s" onClick={()=>act('readAll').catch(()=>{})}>Mark all read</button></div><div className="g" style={{gridTemplateColumns:'1fr'}}>{S.notes.map((n,i)=><div key={n.notification_id} className="c row sp rise" style={{'--i':Math.min(i,10),opacity:n.is_read?.6:1}}><div><b>{n.title}</b><div className="mu">{n.message}</div></div><span className="mu">{D(n.created_at)}</span></div>)}{!S.notes.length&&<p className="mu">You are all caught up.</p>}</div></>;
const Review=()=><div className="c"><Tbl h={['#','Customer','Type','Amount','Term','Credit','Status','']} rows={S.review.map(a=>[a.application_id,a.customer,a.type_name,fmt(a.requested_amount),a.term_months+' mo',a.credit_score+' · max '+fmt(a.max_loan_amount),<Tag s={a.status}/>,a.status=='pending'?<span className="row"><button className="b sm k" onClick={()=>act('approve',{id:a.application_id},'Loan approved and disbursed').catch(()=>{})}>Approve</button><button className="b sm d" onClick={()=>ask('Reject application',[{n:'reason',l:'Reason'}],d=>act('reject',{id:a.application_id,reason:d.reason},'Application rejected'),'Reject')}>Reject</button></span>:''])}/></div>;
const Audit=()=><div className="c"><Tbl h={['When','User','Action','Entity']} rows={S.audit.map(a=>[new Date(a.created_at.replace(' ','T')+'Z').toLocaleString(),a.username||'system',a.action,a.entity_name+' #'+a.entity_id])}/></div>;
const V={dash:Dash,accounts:Accounts,transfer:Transfer,tx:Tx,cards:Cards,loans:Loans,notif:Notif,review:Review,audit:Audit}[cur[0]];

return <><div className="app"><aside><div className="logo"><i/>Meridian</div>{nav.map(n=><button key={n[0]} className={'nv'+(n[0]==cur[0]?' on':'')} onClick={()=>setView(n[0])}><span>{n[1]}</span>{n[2]}</button>)}<div style={{flex:1}}/><button className="nv" onClick={out}>⎋ Sign out ({S.me.username})</button></aside>
<main><div className="top"><h1>{cur[2]}</h1><button className="bell" aria-label="Notifications" onClick={()=>setView('notif')}>🔔{unread>0&&<b>{unread}</b>}</button></div><div key={cur[0]}><V/></div></main></div>
<Modal m={modal} close={()=>setModal(null)}/>{toastEl}</>}
