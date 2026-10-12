import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const element = (type,props,...children)=>({type,props:{...props,children}});
async function compile(scope) {
  const original = await readFile(new URL('../src/features/auth/AdminProtectedRoute.jsx',import.meta.url),'utf8');
  const source = original.replace(/import[^;]+;/g,'').replace('export default ','');
  const {code}=await transformWithOxc(source,'AdminProtectedRoute.jsx',{jsx:{runtime:'classic'}});
  return new Function('scope',`with(scope){${code};return {AdminProtectedRoute,AdminNetworkGate,SwitchAccountAction};}`)({React:{createElement:element},Link:'Link',Navigate:'Navigate',Outlet:'Outlet',AuthPage:'AuthPage',ADMIN_ENTRY_PATH:'/admin',...scope});
}

test('Admin routing waits for the session, uses existing login, and rejects non-admin roles',async()=>{
  let auth={loading:true,currentUser:null};
  let pathname='/admin';
  const {AdminProtectedRoute}=await compile({useAuth:()=>auth,useLocation:()=>({pathname})});
  assert.equal(AdminProtectedRoute().props.title,'Checking Admin access');
  auth={loading:false,currentUser:null};
  const login=AdminProtectedRoute();assert.equal(login.type,'AuthPage');assert.equal(login.props.mode,'login');assert.equal(login.props.adminPortal,true);
  pathname='/admin-users';assert.equal(AdminProtectedRoute().props.to,'/admin');
  for (const role of ['buyer','farmer','stakeholder']) {
    auth.currentUser={id:role,role};
    const denied=AdminProtectedRoute();
    assert.equal(denied.props.title,'Admin access restricted');
    assert.equal(denied.props.accountDenied,true);
    assert.equal(denied.props.switchAccount,true);
    assert.equal(denied.props.message,'This area is restricted to authorized HarvestLink administrators only.');
    assert.equal(denied.props.secondary,undefined);
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
  assert.equal(render().props.title,'Admin access restricted');
  assert.equal(render().props.accountDenied,true);
  assert.equal(render().props.message,'This area is restricted to authorized HarvestLink administrators only.');
  assert.equal(typeof render().props.retry,'function');
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

test('account switch waits for sign-out, prevents duplicate clicks, and returns to Admin login',async()=>{
  const slots=[false,''];let index=0;const pending={current:false};
  let finish;let calls=0;const navigations=[];
  const {SwitchAccountAction}=await compile({
    useAuth:()=>({logout:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}}),
    useNavigate:()=> (...args)=>navigations.push(args),useRef:()=>pending,
    useState:()=>{const i=index++;return[slots[i],value=>{slots[i]=value;}];},
  });
  const render=()=>{index=0;return SwitchAccountAction();};
  const button=render().props.children[0];
  const first=button.props.onClick();await button.props.onClick();
  assert.equal(calls,1);assert.equal(render().props.children[0].props.disabled,true);
  assert.deepEqual(navigations,[]);
  finish();await first;
  assert.deepEqual(navigations,[['/admin',{replace:true}]]);
});

test('failed account switch shows an alert and does not navigate',async()=>{
  const slots=[false,''];let index=0;const pending={current:false};
  const {SwitchAccountAction}=await compile({
    useAuth:()=>({logout:async()=>{throw new Error('Unavailable');}}),
    useNavigate:()=>()=>assert.fail('must not navigate after sign-out failure'),useRef:()=>pending,
    useState:()=>{const i=index++;return[slots[i],value=>{slots[i]=value;}];},
  });
  const render=()=>{index=0;return SwitchAccountAction();};
  await render().props.children[0].props.onClick();
  const output=render();assert.equal(output.props.children[0].props.disabled,false);
  assert.equal(output.props.children[1].props.role,'alert');
  assert.equal(output.props.children[1].props.children[0],'Unable to sign out. Please try again.');
});
