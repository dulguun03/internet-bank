import crypto from 'crypto';
import {db,rnd,hashPw} from './db';
const r2=x=>Math.round(x*100)/100,fail=m=>{throw new Error(m)};
const one=(s,...p)=>db.prepare(s).get(...p),all=(s,...p)=>db.prepare(s).all(...p),run=(s,...p)=>db.prepare(s).run(...p);
const money=x=>{x=+x;if(!(x>0))fail('Enter an amount greater than zero');return r2(x)};
const admin=u=>u.role_id==1||fail('Admins only');
const cust=u=>one('SELECT * FROM customers WHERE user_id=?',u.user_id)||fail('Customer profile required');
const own=(u,id)=>one('SELECT a.* FROM accounts a JOIN customers c ON c.customer_id=a.customer_id WHERE a.account_id=? AND c.user_id=?',id,u.user_id)||fail('Account not found');
const live=a=>a.status=='active'?a:fail('Account is not active');
const ownCard=(u,id)=>one('SELECT c.* FROM cards c JOIN accounts a ON a.account_id=c.account_id JOIN customers cu ON cu.customer_id=a.customer_id WHERE c.card_id=? AND cu.user_id=?',id,u.user_id)||fail('Card not found');
const audit=(u,a,e,i)=>run('INSERT INTO audit_logs(user_id,action,entity_name,entity_id,ip_address) VALUES(?,?,?,?,?)',u?.user_id??null,a,e,String(i),'server');
const notify=(uid,t,m,ty)=>run('INSERT INTO notifications(user_id,title,message,notification_type) VALUES(?,?,?,?)',uid,t,m,ty);
const usd=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2});
const uidOf=cid=>one('SELECT user_id FROM customers WHERE customer_id=?',cid).user_id;
function tx(a,type,amt,dir,desc,tid=null){const bal=r2(a.balance+(dir=='credit'?amt:-amt));run('UPDATE accounts SET balance=? WHERE account_id=?',bal,a.account_id);a.balance=bal;
return run('INSERT INTO transactions(account_id,transaction_type_id,transfer_id,amount,direction,balance_after,description,reference_number) VALUES(?,(SELECT transaction_type_id FROM transaction_types WHERE type_name=?),?,?,?,?,?,?)',a.account_id,type,tid,amt,dir,bal,desc,'REF'+crypto.randomUUID().slice(0,10).toUpperCase()).lastInsertRowid}
const pmt=l=>{const r=l.annual_interest_rate/1200;return l.principal_amount*r/(1-(1+r)**-l.term_months)};

export function register({username,password,first,last}){
if(!username||!password||!first||!last||password.length<6)fail('Fill every field (password 6+ characters)');
if(one('SELECT 1 FROM users WHERE username=?',username))fail('Username already taken');
return db.transaction(()=>{const id=run('INSERT INTO users(role_id,username,password_hash,email,phone_number) VALUES(2,?,?,?,?)',username,hashPw(password),username+'@meridian.bank','+976'+rnd(8)).lastInsertRowid;
const cid=run('INSERT INTO customers(user_id,first_name,last_name,register_number,annual_income,employment_status) VALUES(?,?,?,?,?,?)',id,first,last,'RG'+rnd(8),0,'Unknown').lastInsertRowid;
run("INSERT INTO accounts(account_number,customer_id,account_type_id,currency_code) VALUES(?,?,1,'USD')",'MB'+rnd(12),cid);
notify(id,'Welcome to Meridian','Your checking account is ready.','info');return id})()}

const ACT={
open:(u,{type,cur})=>{const id=run('INSERT INTO accounts(account_number,customer_id,account_type_id,currency_code) VALUES(?,?,?,?)','MB'+rnd(12),cust(u).customer_id,+type,cur).lastInsertRowid;audit(u,'OPEN_ACCOUNT','accounts',id)},
deposit:(u,{id,amount})=>{const a=live(own(u,id)),x=money(amount);tx(a,'Deposit',x,'credit','Cash deposit');notify(u.user_id,'Deposit received',usd(x)+' added','deposit');audit(u,'DEPOSIT','accounts',id)},
withdraw:(u,{id,amount})=>{const a=live(own(u,id)),x=money(amount);if(a.balance<x)fail('Insufficient funds');tx(a,'Withdrawal',x,'debit','Cash withdrawal');audit(u,'WITHDRAW','accounts',id)},
close:(u,{id})=>{const a=own(u,id);if(a.balance!=0)fail('Move the balance out before closing');run("UPDATE accounts SET status='closed',closed_at=CURRENT_TIMESTAMP WHERE account_id=?",id);audit(u,'CLOSE_ACCOUNT','accounts',id)},
transfer:(u,{from,to,amount,desc})=>{const a=live(own(u,from)),x=money(amount),b=one('SELECT * FROM accounts WHERE account_number=?',String(to).trim());
if(!b)fail('Receiver account not found');if(b.account_id==a.account_id)fail('Choose a different receiver');live(b);if(a.currency_code!=b.currency_code)fail('Transfers need matching currencies');if(a.balance<x)fail('Insufficient funds');
const t=run("INSERT INTO transfers(sender_account_id,receiver_account_id,amount,description,status,transfer_reference) VALUES(?,?,?,?,'completed',?)",a.account_id,b.account_id,x,desc||'Transfer','TRF'+rnd(10)).lastInsertRowid;
tx(a,'Transfer',x,'debit','To '+b.account_number,t);tx(b,'Transfer',x,'credit','From '+a.account_number,t);
notify(uidOf(b.customer_id),'Money received',usd(x)+' from '+a.account_number,'transfer');notify(u.user_id,'Transfer sent',usd(x)+' to '+b.account_number,'transfer');audit(u,'TRANSFER','transfers',t)},
issueCard:(u,{account,type})=>{const a=live(own(u,account));const id=run('INSERT INTO cards(account_id,card_token,card_last_four,card_type,expiry_month,expiry_year) VALUES(?,?,?,?,?,?)',a.account_id,'tok_'+crypto.randomUUID().replace(/-/g,'').slice(0,12),rnd(4),type,1+Math.floor(Math.random()*12),new Date().getFullYear()+4).lastInsertRowid;audit(u,'ISSUE_CARD','cards',id)},
freeze:(u,{id})=>{const c=ownCard(u,id),s=c.status=='active'?'blocked':'active';run('UPDATE cards SET status=? WHERE card_id=?',s,id);audit(u,'CARD_'+s.toUpperCase(),'cards',id)},
limit:(u,{id,limit})=>{ownCard(u,id);run('UPDATE cards SET daily_limit=? WHERE card_id=?',money(limit),id)},
buy:(u,{id,merchant,category,amount})=>{const c=ownCard(u,id),a=live(one('SELECT * FROM accounts WHERE account_id=?',c.account_id)),x=money(amount);
if(c.status!='active')fail('This card is frozen');
const spent=one("SELECT COALESCE(SUM(x.amount),0) s FROM card_transactions ct JOIN transactions x ON x.transaction_id=ct.transaction_id WHERE ct.card_id=? AND date(ct.created_at)=date('now')",id).s;
if(spent+x>c.daily_limit)fail('Daily limit exceeded');if(a.balance<x)fail('Insufficient funds');
const t=tx(a,'Card Payment',x,'debit',merchant);run('INSERT INTO card_transactions(card_id,transaction_id,merchant_name,merchant_category) VALUES(?,?,?,?)',id,t,merchant,category);audit(u,'CARD_PAYMENT','card_transactions',t)},
apply:(u,{type,amount,term,purpose,income,debt,score})=>{const c=cust(u),lt=one('SELECT * FROM loan_types WHERE loan_type_id=?',type)||fail('Unknown loan type');
const P=money(amount),n=+term,inc=+income,dbt=+debt,cs=+score,r=lt.interest_rate/1200,max=Math.round(Math.max(0,inc/12*.4-dbt)*(1-(1+r)**-n)/r);
const e=run('INSERT INTO loan_eligibility(customer_id,annual_income,existing_monthly_debt,credit_score,max_loan_amount) VALUES(?,?,?,?,?)',c.customer_id,inc,dbt,cs,max).lastInsertRowid;
let why=null;if(P<lt.min_amount||P>lt.max_amount)why='Amount outside loan type limits';else if(!(n>=lt.min_term_months&&n<=lt.max_term_months))why='Term outside allowed range';else if(cs<600)why='Credit score below 600';else if(P>max)why='Requested amount exceeds your eligible maximum of '+usd(max);
const id=run('INSERT INTO loan_applications(customer_id,loan_type_id,eligibility_id,requested_amount,term_months,purpose,status,reviewed_at,rejection_reason) VALUES(?,?,?,?,?,?,?,?,?)',c.customer_id,lt.loan_type_id,e,P,n,purpose,why?'rejected':'pending',why?new Date().toISOString():null,why).lastInsertRowid;
audit(u,'LOAN_APPLY','loan_applications',id)},
approve:(u,{id})=>{admin(u);const ap=one("SELECT * FROM loan_applications WHERE application_id=? AND status='pending'",id)||fail('Application is not pending'),lt=one('SELECT * FROM loan_types WHERE loan_type_id=?',ap.loan_type_id);
const a=one("SELECT * FROM accounts WHERE customer_id=? AND status='active' AND currency_code='USD' ORDER BY account_id",ap.customer_id)||fail('Customer has no active USD account');
const lid=run("INSERT INTO loans(application_id,customer_id,disbursement_account_id,principal_amount,annual_interest_rate,term_months,start_date,end_date,outstanding_balance,status) VALUES(?,?,?,?,?,?,date('now'),date('now','+'||?||' months'),?,'active')",id,ap.customer_id,a.account_id,ap.requested_amount,lt.interest_rate,ap.term_months,ap.term_months,ap.requested_amount).lastInsertRowid;
tx(a,'Loan Disbursement',ap.requested_amount,'credit','Loan #'+lid+' disbursed');run("UPDATE loan_applications SET status='approved',approved_amount=?,reviewed_at=CURRENT_TIMESTAMP WHERE application_id=?",ap.requested_amount,id);
notify(uidOf(ap.customer_id),'Loan approved',usd(ap.requested_amount)+' deposited to '+a.account_number,'loan');audit(u,'LOAN_APPROVE','loans',lid)},
reject:(u,{id,reason})=>{admin(u);const ap=one("SELECT * FROM loan_applications WHERE application_id=? AND status='pending'",id)||fail('Application is not pending');
run("UPDATE loan_applications SET status='rejected',rejection_reason=?,reviewed_at=CURRENT_TIMESTAMP WHERE application_id=?",reason,id);notify(uidOf(ap.customer_id),'Loan rejected',reason,'loan');audit(u,'LOAN_REJECT','loan_applications',id)},
payLoan:(u,{id,account})=>{const l=one("SELECT * FROM loans WHERE loan_id=? AND customer_id=? AND status='active'",id,cust(u).customer_id)||fail('Loan not found'),a=live(own(u,account));
const int=r2(l.outstanding_balance*l.annual_interest_rate/1200),pr=r2(Math.min(pmt(l)-int,l.outstanding_balance)),tot=r2(pr+int);if(a.balance<tot)fail('Insufficient funds for '+usd(tot));
const t=tx(a,'Loan Payment',tot,'debit','Loan #'+id+' installment'),left=r2(l.outstanding_balance-pr);
run("INSERT INTO loan_payments(loan_id,transaction_id,due_date,payment_date,principal_paid,interest_paid,status) VALUES(?,?,date('now'),date('now'),?,?,'paid')",id,t,pr,int);
run('UPDATE loans SET outstanding_balance=?,status=? WHERE loan_id=?',left<.01?0:left,left<.01?'closed':'active',id);audit(u,'LOAN_PAYMENT','loan_payments',t)},
readAll:u=>{run('UPDATE notifications SET is_read=1 WHERE user_id=?',u.user_id)}};
export function act(u,name,args){const f=ACT[name];if(!f)fail('Unknown action');return db.transaction(()=>f(u,args||{}))()}

export function state(u){const c=one('SELECT * FROM customers WHERE user_id=?',u.user_id);
const S={me:{username:u.username,role:u.role_id==1?'admin':'customer',name:c?c.first_name:'Admin'},types:all('SELECT * FROM account_types'),cur:all('SELECT * FROM currencies'),loanTypes:all('SELECT * FROM loan_types'),notes:all('SELECT * FROM notifications WHERE user_id=? ORDER BY notification_id DESC LIMIT 50',u.user_id)};
if(c){const ids='(SELECT account_id FROM accounts WHERE customer_id=?)',k=c.customer_id;
S.accounts=all('SELECT a.*,t.type_name FROM accounts a JOIN account_types t ON t.account_type_id=a.account_type_id WHERE a.customer_id=?',k);
S.tx=all(`SELECT x.*,t.type_name FROM transactions x JOIN transaction_types t ON t.transaction_type_id=x.transaction_type_id WHERE x.account_id IN ${ids} ORDER BY x.transaction_id DESC LIMIT 200`,k);
S.cards=all(`SELECT * FROM cards WHERE account_id IN ${ids}`,k);
S.cardTx=all(`SELECT ct.*,x.amount FROM card_transactions ct JOIN transactions x ON x.transaction_id=ct.transaction_id WHERE ct.card_id IN (SELECT card_id FROM cards WHERE account_id IN ${ids}) ORDER BY ct.card_transaction_id DESC LIMIT 30`,k);
S.loans=all('SELECT l.*,(SELECT COUNT(*) FROM loan_payments p WHERE p.loan_id=l.loan_id) paid FROM loans l WHERE l.customer_id=?',k);
S.apps=all('SELECT * FROM loan_applications WHERE customer_id=? ORDER BY application_id DESC',k);
S.others=all("SELECT a.account_number,a.currency_code,c.first_name FROM accounts a JOIN customers c ON c.customer_id=a.customer_id WHERE c.user_id!=? AND a.status='active'",u.user_id)} // demo convenience: remove for production
if(u.role_id==1){S.review=all("SELECT a.*,c.first_name||' '||c.last_name AS customer,t.type_name,e.credit_score,e.max_loan_amount FROM loan_applications a JOIN customers c ON c.customer_id=a.customer_id JOIN loan_types t ON t.loan_type_id=a.loan_type_id JOIN loan_eligibility e ON e.eligibility_id=a.eligibility_id ORDER BY a.application_id DESC");
S.audit=all('SELECT a.*,u.username FROM audit_logs a LEFT JOIN users u ON u.user_id=a.user_id ORDER BY a.audit_id DESC LIMIT 60')}
return S}