import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const element = (type,props,...children)=>({type,props:{...props,children}});
async function compile(scope) {
  const original = await readFile(new URL('../src/features/auth/AdminProtectedRoute.jsx',import.meta.url),'utf8');
  const source = original.replace(/import[^;]+;/g,'').replace('export default ','');
  const {code}=await transformWithOxc(source,'AdminProtectedRoute.jsx',{jsx:{runtime:'classic'}});
  return new Function('scope',`with(scope){${code};return {AdminProtectedRoute,AdminNetworkGate};}`)({React:{createElement:element},Link:'Link',Navigate:'Navigate',Outlet:'Outlet',AuthPage:'AuthPage',ADMIN_ENTRY_PATH:'/harvestlinkadmin',...scope});
}

test('Admin routing waits for the session, uses existing login, and rejects non-admin roles',async()=>{
  let auth={loading:true,currentUser:null};
  let pathname='/harvestlinkadmin';
  const {AdminProtectedRoute}=await compile({useAuth:()=>auth,useLocation:()=>({pathname})});
  assert.equal(AdminProtectedRoute().props.title,'Checking Admin access');
  auth={loading:false,currentUser:null};
  const login=AdminProtectedRoute();assert.equal(login.type,'AuthPage');assert.equal(login.props.mode,'login');assert.equal(login.props.adminPortal,true);
  pathname='/admin-users';assert.equal(AdminProtectedRoute().props.to,'/harvestlinkadmin');
  auth.currentUser={id:'buyer',role:'buyer'};assert.equal(AdminProtectedRoute().props.title,'Admin access restricted');
  assert.equal(AdminProtectedRoute().props.message,'You do not have permission to access the HarvestLink Admin Portal.');
});

test('network gate does not render Admin content before authorization and removes it after denial',async()=>{
  const slots=[null,0];let index=0;let effect;
  const listeners=new Map();let interval;
  let resolve;let requests=0;
  const scope={
    useState:()=>{const i=index++;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useEffect:fn=>{effect=fn;},
    apiClient:{get:async path=>{assert.equal(path,'/auth/admin-access');requests++;return new Promise(done=>{resolve=done;});}},
    document:{visibilityState:'visible'},
    window:{addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),setInterval:fn=>{interval=fn;return 1;},clearInterval(){}},
  };
  const {AdminNetworkGate}=await compile(scope);
  const render=()=>{index=0;return AdminNetworkGate({userId:'admin',pathname:'/admin-users'});};
  assert.equal(render().props.title,'Checking Admin access');
  const cleanup=effect();assert.equal(requests,1);
  assert.equal(render().props.title,'Checking Admin access');
  resolve({allowed:true});await new Promise(done=>setImmediate(done));
  assert.equal(render().type,'Outlet');
  interval();assert.equal(requests,2);
  assert.equal(render().type,'Outlet','background rechecks do not reset page forms or filters');
  listeners.get('harvestlink:admin-network-denied')();
  assert.equal(render().props.title,'Admin access restricted');
  resolve({allowed:true});await new Promise(done=>setImmediate(done));
  assert.equal(render().props.title,'Admin access restricted','late success cannot reverse a network denial');
  cleanup();assert.equal(listeners.size,0);
});

test('a network failure is not treated as authorization and has a retry action',async()=>{
  const slots=[null,0];let index=0;let effect;
  const {AdminNetworkGate}=await compile({useState:()=>{const i=index++;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useEffect:fn=>{effect=fn;},apiClient:{get:async()=>{throw new Error('Offline');}},document:{visibilityState:'visible'},window:{addEventListener(){},removeEventListener(){},setInterval(){return 1;},clearInterval(){}}});
  const render=()=>{index=0;return AdminNetworkGate({userId:'admin',pathname:'/admin-orders'});};
  render();const cleanup=effect();await new Promise(done=>setImmediate(done));
  const result=render();assert.equal(result.props.title,'Unable to verify Admin access');result.props.retry();assert.equal(slots[1],1);cleanup();
});
