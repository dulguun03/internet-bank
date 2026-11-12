import Database from 'better-sqlite3';
import crypto from 'crypto';
export const rnd=n=>String(Math.floor(Math.random()*10**n)).padStart(n,'0');
export const hashPw=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
export const checkPw=(p,h)=>hashPw(p,h.split(':')[0])===h;
const TS='TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP';
// The 20 tables from the ERD
const SCHEMA=`
CREATE TABLE IF NOT EXISTS roles(role_id INTEGER PRIMARY KEY,role_name TEXT UNIQUE NOT NULL,description TEXT);
CREATE TABLE IF NOT EXISTS users(user_id INTEGER PRIMARY KEY,role_id INT NOT NULL REFERENCES roles,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone_number TEXT UNIQUE,is_active INT NOT NULL DEFAULT 1,created_at ${TS});
CREATE TABLE IF NOT EXISTS customers(customer_id INTEGER PRIMARY KEY,user_id INT UNIQUE NOT NULL REFERENCES users,first_name TEXT NOT NULL,last_name TEXT NOT NULL,register_number TEXT UNIQUE,date_of_birth TEXT,address TEXT,annual_income REAL,employment_status TEXT,created_at ${TS});
CREATE TABLE IF NOT EXISTS notifications(notification_id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users,title TEXT,message TEXT,notification_type TEXT,is_read INT NOT NULL DEFAULT 0,created_at ${TS});
CREATE TABLE IF NOT EXISTS audit_logs(audit_id INTEGER PRIMARY KEY,user_id INT REFERENCES users,action TEXT,entity_name TEXT,entity_id TEXT,ip_address TEXT,created_at ${TS});
CREATE TABLE IF NOT EXISTS account_types(account_type_id INTEGER PRIMARY KEY,type_name TEXT UNIQUE NOT NULL,description TEXT);
CREATE TABLE IF NOT EXISTS currencies(currency_code TEXT PRIMARY KEY,currency_name TEXT,symbol TEXT);
CREATE TABLE IF NOT EXISTS accounts(account_id INTEGER PRIMARY KEY,account_number TEXT UNIQUE NOT NULL,customer_id INT NOT NULL REFERENCES customers,account_type_id INT NOT NULL REFERENCES account_types,currency_code TEXT NOT NULL REFERENCES currencies,balance REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',opened_at ${TS},closed_at TEXT);
CREATE TABLE IF NOT EXISTS transaction_types(transaction_type_id INTEGER PRIMARY KEY,type_name TEXT UNIQUE NOT NULL,description TEXT);
CREATE TABLE IF NOT EXISTS transfers(transfer_id INTEGER PRIMARY KEY,sender_account_id INT NOT NULL REFERENCES accounts,receiver_account_id INT NOT NULL REFERENCES accounts,amount REAL NOT NULL,description TEXT,transfer_date ${TS},status TEXT NOT NULL,transfer_reference TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS transactions(transaction_id INTEGER PRIMARY KEY,account_id INT NOT NULL REFERENCES accounts,transaction_type_id INT NOT NULL REFERENCES transaction_types,transfer_id INT REFERENCES transfers,amount REAL NOT NULL,direction TEXT NOT NULL,balance_after REAL NOT NULL,description TEXT,transaction_date ${TS},status TEXT NOT NULL DEFAULT 'completed',reference_number TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS cards(card_id INTEGER PRIMARY KEY,account_id INT NOT NULL REFERENCES accounts,card_token TEXT UNIQUE,card_last_four TEXT,card_type TEXT,expiry_month INT,expiry_year INT,status TEXT NOT NULL DEFAULT 'active',daily_limit REAL NOT NULL DEFAULT 2000,issued_at ${TS});
CREATE TABLE IF NOT EXISTS card_transactions(card_transaction_id INTEGER PRIMARY KEY,card_id INT NOT NULL REFERENCES cards,transaction_id INT UNIQUE NOT NULL REFERENCES transactions,merchant_name TEXT,merchant_category TEXT,created_at ${TS});
CREATE TABLE IF NOT EXISTS statements(statement_id INTEGER PRIMARY KEY,account_id INT NOT NULL REFERENCES accounts,start_date TEXT,end_date TEXT,opening_balance REAL,closing_balance REAL,generated_at ${TS},file_path TEXT);
CREATE TABLE IF NOT EXISTS loan_types(loan_type_id INTEGER PRIMARY KEY,type_name TEXT UNIQUE NOT NULL,description TEXT,interest_rate REAL,min_amount REAL,max_amount REAL,min_term_months INT,max_term_months INT);
CREATE TABLE IF NOT EXISTS loan_eligibility(eligibility_id INTEGER PRIMARY KEY,customer_id INT NOT NULL REFERENCES customers,annual_income REAL,existing_monthly_debt REAL,credit_score INT,max_loan_amount REAL,assessed_at ${TS});
CREATE TABLE IF NOT EXISTS loan_applications(application_id INTEGER PRIMARY KEY,customer_id INT NOT NULL REFERENCES customers,loan_type_id INT NOT NULL REFERENCES loan_types,eligibility_id INT REFERENCES loan_eligibility,requested_amount REAL,term_months INT,purpose TEXT,status TEXT NOT NULL,applied_at ${TS},reviewed_at TEXT,approved_amount REAL,rejection_reason TEXT);
CREATE TABLE IF NOT EXISTS loans(loan_id INTEGER PRIMARY KEY,application_id INT UNIQUE NOT NULL REFERENCES loan_applications,customer_id INT NOT NULL REFERENCES customers,disbursement_account_id INT NOT NULL REFERENCES accounts,principal_amount REAL,annual_interest_rate REAL,term_months INT,start_date TEXT,end_date TEXT,outstanding_balance REAL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS loan_payments(loan_payment_id INTEGER PRIMARY KEY,loan_id INT NOT NULL REFERENCES loans,transaction_id INT UNIQUE REFERENCES transactions,due_date TEXT,payment_date TEXT,principal_paid REAL,interest_paid REAL,status TEXT);
CREATE TABLE IF NOT EXISTS savings_goals(goal_id INTEGER PRIMARY KEY,customer_id INT NOT NULL REFERENCES customers,savings_account_id INT NOT NULL REFERENCES accounts,goal_name TEXT,target_amount REAL,target_date TEXT,status TEXT NOT NULL DEFAULT 'active',created_at ${TS});`;
function init(){const d=new Database(process.env.DB_FILE||'bank.db');d.pragma('journal_mode=WAL');d.pragma('foreign_keys=ON');d.exec(SCHEMA);seed(d);return d}
function seed(d){if(d.prepare('SELECT 1 FROM roles').get())return;
const I=(s,...p)=>d.prepare(s).run(...p);
['admin','customer'].forEach(r=>I('INSERT INTO roles(role_name,description) VALUES(?,?)',r,r+' role'));
[['USD','US Dollar','$'],['EUR','Euro','€'],['GBP','British Pound','£']].forEach(c=>I('INSERT INTO currencies VALUES(?,?,?)',...c));
['Checking','Savings','Business'].forEach(n=>I('INSERT INTO account_types(type_name,description) VALUES(?,?)',n,n+' account'));
['Deposit','Withdrawal','Transfer','Card Payment','Loan Payment','Loan Disbursement'].forEach(n=>I('INSERT INTO transaction_types(type_name,description) VALUES(?,?)',n,n));
[['Personal',9.5,1000,50000,6,60],['Auto',7.25,5000,80000,12,84],['Home',5.9,20000,500000,60,360]].forEach(([n,...r])=>I('INSERT INTO loan_types(type_name,description,interest_rate,min_amount,max_amount,min_term_months,max_term_months) VALUES(?,?,?,?,?,?,?)',n,n+' loan',...r));
const user=(u,p,role,f,l)=>{const id=I('INSERT INTO users(role_id,username,password_hash,email,phone_number) VALUES(?,?,?,?,?)',role,u,hashPw(p),u+'@meridian.bank','+976'+rnd(8)).lastInsertRowid;
if(role==2){const cid=I('INSERT INTO customers(user_id,first_name,last_name,register_number,date_of_birth,address,annual_income,employment_status) VALUES(?,?,?,?,?,?,?,?)',id,f,l,'RG'+rnd(8),'1995-01-01','Ulaanbaatar',48000,'Employed').lastInsertRowid;
[[1,5000],[2,2000]].forEach(([t,b])=>{const a=I('INSERT INTO accounts(account_number,customer_id,account_type_id,currency_code,balance) VALUES(?,?,?,?,?)','MB'+rnd(12),cid,t,'USD',b).lastInsertRowid;
I('INSERT INTO transactions(account_id,transaction_type_id,amount,direction,balance_after,description,reference_number) VALUES(?,1,?,?,?,?,?)',a,b,'credit',b,'Initial deposit','REF'+rnd(10))})}};
user('admin','admin123',1);user('jane','jane123',2,'Jane','Doe');user('omar','omar123',2,'Omar','Bat')}
export const db=globalThis.__bankdb??=init();
