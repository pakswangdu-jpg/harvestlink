import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { ROLE_DASHBOARDS } from '../src/utils/constants.js';

const element = (type,props,...children)=>({type,props:{...props,children}});
async function compile(scope) {
  const original = await readFile(new URL('../src/features/auth/AdminProtectedRoute.jsx',import.meta.url),'utf8');
  const source = original.replace(/import[^;]+;/g,'').replace('export default ','');
  const {code}=await transformWithOxc(source,'AdminProtectedRoute.jsx',{jsx:{runtime:'classic'}});
  return new Function('scope',`with(scope){${code};return {AdminProtectedRoute,AdminNetworkGate,AccessScreen};}`)({React:{createElement:element},Link:'Link',Navigate:'Navigate',Outlet:'Outlet',AuthPage:'AuthPage',ArrowLeft:'ArrowLeft',ShieldAlert:'ShieldAlert',ADMIN_ENTRY_PATH:'/admin',ROLE_DASHBOARDS,...scope});
}

test('Admin routing waits for the session and checks the network before rendering signed-out login',async()=>{
  let auth={loading:true,currentUser:null};
  let pathname='/admin';
  const {AdminProtectedRoute}=await compile({useAuth:()=>auth,useLocation:()=>({pathname})});
  assert.equal(AdminProtectedRoute().props.title,'Checking Admin access');
  auth={loading:false,currentUser:null};
  const entry=AdminProtectedRoute();assert.equal(entry.type.name,'AdminNetworkGate');assert.equal(entry.props.entry,true);
  pathname='/admin-users';assert.equal(AdminProtectedRoute().props.to,'/admin');
  auth.currentUser={id:'admin',role:'admin'};
  assert.equal(AdminProtectedRoute().type.name,'AdminNetworkGate');
});

test('Buyer, Farmer and Stakeholder Admin URLs show 404 with a dashboard link without sign-out or Admin content',async()=>{
  let auth;
  let pathname;
  const {AdminProtectedRoute,AccessScreen}=await compile({useAuth:()=>auth,useLocation:()=>({pathname})});
  for (const role of ['buyer','farmer','stakeholder']) {
    auth={loading:false,currentUser:{id:role,role},logout:()=>assert.fail('Role denial must preserve the marketplace session')};
    for (pathname of ['/admin','/admin-dashboard','/admin-users','/admin-orders','/admin-donations','/admin-reports','/admin-profile','/admin-price-monitoring']) {
      const denied=AdminProtectedRoute();
      assert.equal(denied.type.name,'AccessScreen');
      assert.equal(denied.props.title,'404 - Page not found');
      assert.equal(denied.props.message,'The page you requested could not be found.');
      assert.equal(denied.props.backTo,ROLE_DASHBOARDS[role]);
      assert.equal(denied.props.backLabel,'Back to dashboard');
      assert.equal(denied.props.retry,undefined,'A role denial must not offer another authorization attempt');
      const screen=AccessScreen(denied.props);
      const children=screen.props.children[0].props.children;
      assert.equal(children[1].props.children[0],'404 - Page not found');
      const link=children[3].props.children[1];
      assert.equal(link.type,'Link');
      assert.equal(link.props.to,ROLE_DASHBOARDS[role]);
    }
  }
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
  assert.equal(render().props.title,'404 - Page not found');
  assert.equal(render().props.accountDenied,true);
  assert.equal(render().props.message,'The page you requested could not be found.');
  assert.equal(typeof render().props.retry,'function');
  resolve({allowed:true});await new Promise(done=>setImmediate(done));
  assert.equal(render().props.title,'404 - Page not found','late success cannot reverse a network denial');
  cleanup();assert.equal(listeners.size,0);
});

test('a network failure is not treated as authorization and has a retry action',async()=>{
  const slots=[null,0];let index=0;let effect;
  const {AdminNetworkGate}=await compile({useState:()=>{const i=index++;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useEffect:fn=>{effect=fn;},apiClient:{get:async()=>{throw new Error('Offline');}},document:{visibilityState:'visible'},window:{addEventListener(){},removeEventListener(){},setInterval(){return 1;},clearInterval(){}}});
  const render=()=>{index=0;return AdminNetworkGate({userId:'admin',pathname:'/admin-orders'});};
  render();const cleanup=effect();await new Promise(done=>setImmediate(done));
  const result=render();assert.equal(result.props.title,'Unable to verify Admin access');result.props.retry();assert.equal(slots[1],1);cleanup();
});

test('signed-out login waits for the exact allowed response and cannot reuse it as Admin authorization',async()=>{
  const slots=[null,0];let index=0;let effect;let finish;
  const paths=[];
  const {AdminNetworkGate}=await compile({
    useState:()=>{const i=index++;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useEffect:fn=>{effect=fn;},apiClient:{get:async path=>{paths.push(path);return new Promise(resolve=>{finish=resolve;});}},
    document:{visibilityState:'visible'},window:{addEventListener(){},removeEventListener(){},setInterval(){return 1;},clearInterval(){}},
  });
  const render=(entry=true)=>{index=0;return AdminNetworkGate({userId:entry?null:'admin',pathname:'/admin',entry});};
  assert.equal(render().props.title,'Checking Admin access');
  const cleanup=effect();
  assert.deepEqual(paths,['/auth/admin-entry-access']);
  finish({allowed:true});await new Promise(done=>setImmediate(done));
  assert.equal(render().type,'AuthPage');
  assert.equal(render().props.adminPortal,true);
  assert.equal(render(false).props.title,'Checking Admin access','an entry check cannot unlock the authenticated Outlet');
  cleanup();
});

test('403, malformed authorization and offline entry checks never display the Admin login form',async()=>{
  for(const response of [{allowed:false},{allowed:'true'},null,{status:403,denied:true},new Error('Offline')]) {
    const slots=[null,0];let index=0;let effect;
    const {AdminNetworkGate}=await compile({
      useState:()=>{const i=index++;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
      useEffect:fn=>{effect=fn;},apiClient:{get:async()=>{if(response instanceof Error || response?.denied) throw response;return response;}},
      document:{visibilityState:'visible'},window:{addEventListener(){},removeEventListener(){},setInterval(){return 1;},clearInterval(){}},
    });
    const render=()=>{index=0;return AdminNetworkGate({userId:null,pathname:'/admin',entry:true});};
    render();const cleanup=effect();await new Promise(done=>setImmediate(done));
    assert.notEqual(render().type,'AuthPage');
    assert.notEqual(render().type,'Outlet');
    assert.equal(render().props.title,response?.denied?'404 - Page not found':'Unable to verify Admin access');
    cleanup();
  }
});
