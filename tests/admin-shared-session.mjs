import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = await readFile(new URL('../js/machine-admin-auth.js', import.meta.url), 'utf8');
const authSource = await readFile(new URL('../js/auth.js', import.meta.url), 'utf8');
const pkceSource = await readFile(new URL('../js/pkce-oauth.js', import.meta.url), 'utf8');
const adminState = { authorized: true, employee_id: 'employee-1', role: 'admin', main_group: 'Admin', groups: ['Admin'] };
const employee = { id: 'employee-1', employee_name: 'Database test name', main_group: 'Admin', active: true };
async function adapter(options = {}) {
  const calls = { login: 0, logout: 0, status: 0, fetch: 0 };
  let token = options.token ?? 'primary-test-token';
  const setToken = next => { token = next; };
  const primary = {
    authProvider: { login: () => { calls.login++; }, logout: () => { calls.logout++; } },
    getSupabaseLineAccessToken: () => token,
    checkSupabaseSession: async () => { calls.status++; return options.status ? options.status(setToken) : adminState; },
  };
  const context = vm.createContext({
    URL, URLSearchParams,
    fetch: async (url, init) => {
      calls.fetch++;
      assert.equal(init.headers.Authorization, 'Bearer primary-test-token');
      assert.equal(init.cache, 'no-store');
      assert.equal(new URL(url).searchParams.get('id'), 'eq.employee-1');
      return options.fetch ? options.fetch(setToken) : { ok: true, json: async () => [employee] };
    },
  });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => {
    const values = specifier.includes('auth.js?') ? primary : { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-publishable' };
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [name,value] of Object.entries(values)) this.setExport(name,value); }, {context});
  });
  await module.evaluate();
  return { api: module.namespace, calls, getToken: () => token };
}

test('active Admin uses the existing primary token and current database identity without a login', async () => {
  const {api,calls} = await adapter();
  const result = await api.getMachineAdminSession();
  assert.equal(result.accessToken, 'primary-test-token');
  assert.equal(result.user.name, employee.employee_name);
  assert.equal(result.user.id, employee.id);
  assert.equal(calls.login, 0); assert.equal(calls.logout, 0);
  assert.equal(calls.status, 1); assert.equal(calls.fetch, 1);
});
test('missing primary session cannot use any legacy module session', async () => {
  const {api,calls} = await adapter({token:''});
  assert.equal(await api.getMachineAdminSession(), null);
  assert.equal(calls.status,0); assert.equal(calls.fetch,0); assert.equal(calls.login,0);
});
for(const role of ['employee','executive','applicant']) {
  test(role + ' cannot enter Admin via the session adapter', async () => {
    const {api,calls} = await adapter({status:async () => ({...adminState,role})});
    await assert.rejects(api.getMachineAdminSession(), error => error.code==='PERMISSION_DENIED' && error.status===403);
    assert.equal(calls.fetch,0);
  });
}
test('revoked or suspended session is rejected before reading an employee', async () => {
  const {api,calls} = await adapter({status:async () => { throw new Error('บัญชีถูกระงับการใช้งาน'); }});
  await assert.rejects(api.getMachineAdminSession(), /บัญชีถูกระงับ/);
  assert.equal(calls.fetch,0);
});
test('logout during status check discards the pending result', async () => {
  const {api,calls} = await adapter({status:async set => { set(''); return adminState; }});
  await assert.rejects(api.getMachineAdminSession(), error=>error.code==='SESSION_CHANGED');
  assert.equal(calls.fetch,0);
});
test('account change during employee request discards the pending result', async () => {
  const {api} = await adapter({fetch:async set => { set('different-test-token'); return {ok:true,json:async()=>[employee]}; }});
  await assert.rejects(api.getMachineAdminSession(), error=>error.code==='SESSION_CHANGED');
});
test('logout during response decoding discards the pending result', async () => {
  const {api} = await adapter({fetch:async set => ({ok:true,json:async()=>{set('');return [employee];}})});
  await assert.rejects(api.getMachineAdminSession(), error=>error.code==='SESSION_CHANGED');
});
test('status network error preserves the primary session', async () => {
  const {api,calls,getToken} = await adapter({status:async()=>{throw new TypeError('Network error');}});
  await assert.rejects(api.getMachineAdminSession(), /Network error/);
  assert.equal(getToken(),'primary-test-token'); assert.equal(calls.logout,0); assert.equal(calls.login,0);
});
test('employee network error preserves the primary session and remains retryable', async () => {
  const {api,calls,getToken} = await adapter({fetch:async()=>{throw new TypeError('Network error');}});
  await assert.rejects(api.getMachineAdminSession(), error=>error.code==='NETWORK_ERROR');
  assert.equal(getToken(),'primary-test-token'); assert.equal(calls.logout,0);
});
for(const [label,row] of [
  ['suspended account',{...employee,active:false}],
  ['wrong account',{...employee,id:'other-employee'}],
  ['changed main group',{...employee,main_group:'ผลิต'}],
]) {
  test(label + ' cannot produce an Admin repository session', async () => {
    const {api} = await adapter({fetch:async()=>({ok:true,json:async()=>[row]})});
    await assert.rejects(api.getMachineAdminSession(),error=>error.code==='PERMISSION_DENIED');
  });
}
test('legacy compatibility actions delegate to the one app provider', async () => {
  const {api,calls} = await adapter();
  await api.loginToMachineAdmin(); await api.logoutFromMachineAdmin();
  assert.equal(calls.login,1); assert.equal(calls.logout,1);
});

for(const route of ['groups','machines','item-names','employees']) {
  test('main auth consumes OAuth callback on direct Admin URL: ' + route, async () => {
    let completed=0;
    const storage = {removeItem(){},setItem(){},getItem(){return null;}};
    const context=vm.createContext({URL,URLSearchParams,Date,location:{search:'?code=test-code',hash:'#/admin/'+route},localStorage:storage,sessionStorage:storage});
    const modules={
      'session-vault.js':{saveSession:async()=>{},loadSession:async()=>null,deleteSession:async()=>{},withSessionLock:fn=>fn()},
      'config.js':{APP_MODE:'supabase-line',MOCK_USERS:[],ROLE_LABELS:{admin:'Admin'},MOCK_SESSION_ROLE:'employee',MOCK_SESSION_GROUP:'สกรีน',LINE_LIFF_ID:'',API_BASE_URL:'',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-publishable',SUPABASE_LINE_PROVIDER:'custom:test-line'},
      'pkce-oauth.js':{startPkceOAuth:async()=>{},completePkceOAuth:async()=>{completed++;return {error:'intentional-test-stop'};}},
      'read-only-api.js':{requestReadOnly:async()=>{}},
      'permissions.js':{normalizeRole:x=>x,normalizeGroup:x=>x},
      'directory-snapshot.js':{ACTIVE_DIRECTORY_NAMES:[],DIRECTORY_SNAPSHOT_DATE:''},
      'state.js':{getStore:()=>({})},
    };
    const module=new vm.SourceTextModule(authSource,{context});
    await module.link(specifier=>{
      const key=specifier.split('/').at(-1).split('?')[0],values=modules[key];
      if(!values)throw Error('Unexpected import '+key);
      return new vm.SyntheticModule(Object.keys(values),function(){for(const [name,value]of Object.entries(values))this.setExport(name,value);},{context});
    });
    await module.evaluate();
    await assert.rejects(module.namespace.authProvider.getSession());
    assert.equal(completed,1);
  });
}
test('Admin pages contain no separate login or logout controls', async () => {
  for(const page of ['machines','item-names','groups','employees']){
    const text=await readFile(new URL('../pages/admin/'+page+'.js',import.meta.url),'utf8');
    assert.doesNotMatch(text,/data-machine-login|data-login-item|data-machine-logout|data-item-logout|เข้าสู่ระบบ Admin จริง/);
    assert.doesNotMatch(text,/loginToMachineAdmin|logoutFromMachineAdmin/);
  }
});
test('cross-tab logout blocks an old tab token before the storage event completes', async () => {
  const context=vm.createContext({
    URL,URLSearchParams,Date,
    localStorage:{getItem:()=> '1'},
    sessionStorage:{getItem:()=>JSON.stringify({accessToken:'old-test-token',expiresAt:Date.now()+60000})},
  });
  const modules={
    'session-vault.js':{saveSession:async()=>{},loadSession:async()=>null,deleteSession:async()=>{},withSessionLock:fn=>fn()},
    'config.js':{APP_MODE:'supabase-line',MOCK_USERS:[],ROLE_LABELS:{},MOCK_SESSION_ROLE:'employee',MOCK_SESSION_GROUP:'สกรีน',LINE_LIFF_ID:'',API_BASE_URL:'',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-publishable',SUPABASE_LINE_PROVIDER:'custom:test-line'},
    'pkce-oauth.js':{startPkceOAuth:async()=>{},completePkceOAuth:async()=>null},
    'read-only-api.js':{requestReadOnly:async()=>{}},'permissions.js':{normalizeRole:x=>x,normalizeGroup:x=>x},
    'directory-snapshot.js':{ACTIVE_DIRECTORY_NAMES:[],DIRECTORY_SNAPSHOT_DATE:''},'state.js':{getStore:()=>({})},
  };
  const module=new vm.SourceTextModule(authSource,{context});
  await module.link(specifier=>{const values=modules[specifier.split('/').at(-1).split('?')[0]];return new vm.SyntheticModule(Object.keys(values),function(){for(const[name,value]of Object.entries(values))this.setExport(name,value);},{context});});
  await module.evaluate();
  assert.equal(module.namespace.getSupabaseLineAccessToken(),'');
});
for (const route of ['groups','machines','item-names','employees']) {
  test('OAuth cleanup preserves the guarded Admin route: ' + route, async () => {
    let nextUrl;
    const saved = new Map([['factory-pwa-p18-pkce-verifier','test-verifier']]);
    const context=vm.createContext({
      URL, URLSearchParams, Date,
      location:{pathname:'/factory-pwa-test-pages/',search:'?code=test-code',hash:'#/admin/'+route},
      history:{replaceState:(state,title,url)=>{nextUrl=url;}},
      sessionStorage:{getItem:key=>saved.get(key),removeItem:key=>saved.delete(key)},
      fetch:async()=>({ok:true,json:async()=>({access_token:'invalid-test-token',refresh_token:'invalid-test-refresh',expires_in:3600})}),
    });
    const module=new vm.SourceTextModule(pkceSource,{context});
    await module.link(()=>{throw Error('No imports expected');}); await module.evaluate();
    await module.namespace.completePkceOAuth({supabaseUrl:'https://example.supabase.co',publishableKey:'test-publishable'});
    assert.equal(nextUrl,'/factory-pwa-test-pages/#/admin/'+route);
    assert.equal(saved.has('factory-pwa-p18-pkce-verifier'),false);
  });
}
test('app and Admin adapters import the same primary auth module and new files are cached', async () => {
  const app=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
  const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(app,/auth\.js\?v=1\.3\.238/);
  assert.match(source,/auth\.js\?v=1\.3\.238/);
  assert.doesNotMatch(source,/sessionStorage|completePkceOAuth|refresh_token|user_metadata/);
  assert.doesNotMatch(app,/machineOAuthCode/);
  for(const path of ['js/app','js/auth','js/router','js/machine-admin-auth','js/live-admin-context','pages/admin/groups','pages/admin/machines','pages/admin/item-names','pages/admin/employees']){
    assert.ok(sw.includes('./'+path+'.js?v=1.3.238'),path);
  }
});


