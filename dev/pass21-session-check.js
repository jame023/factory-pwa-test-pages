import {loadSession,saveSession,withSessionLock} from '../js/session-vault.js?v=1.3.191';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../js/config.js?v=1.3.186';
const output=document.getElementById('result');
let captured;
document.getElementById('capture').onclick=async()=>{
  captured=await withSessionLock(loadSession);
  output.textContent=JSON.stringify({captured:!!captured?.accessToken,tokenDisplayed:false});
};
document.getElementById('check').onclick=async()=>{
  if(!captured?.accessToken){output.textContent='ยังไม่มี Session ในหน่วยความจำ';return;}
  const results=[];
  for(const [name,path,method] of [['status','/rest/v1/rpc/factory_session_status','POST'],['employees','/rest/v1/employees?select=id','GET'],['records','/rest/v1/factory_records?select=id','GET']]){
    const response=await fetch(SUPABASE_URL+path,{method,cache:'no-store',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${captured.accessToken}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});
    const data=await response.json();
    results.push({name,httpStatus:response.status,...(Array.isArray(data)?{rows:data.length}:{authorized:data.authorized,reason:data.reason,role:data.role,errorCode:data.code})});
  }
  output.textContent=JSON.stringify(results,null,2);
};
document.getElementById('expire').onclick=async()=>{
  await withSessionLock(async()=>{const saved=await loadSession();if(!saved)throw new Error('ไม่มี Session');saved.expiresAt=Date.now()-1000;await saveSession(saved);});
  // Re-enter the actual app so restoreSession executes its expiry branch.
  location.assign('../#/home');
};
