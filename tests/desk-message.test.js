import test from 'node:test';
import assert from 'node:assert/strict';
import { DeskMessageConnection, SERVICE_UUID, RX_UUID, STATUS_UUID, layoutMessage, normalizeMessage } from '../site/desk-message.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function fixture(options={}) {
  const writes=[];
  const status=new EventTarget();
  status.value=new DataView(new TextEncoder().encode('ready').buffer);
  status.startNotifications=async()=>{status.started=true; return status;};
  status.stopNotifications=async()=>{status.stopped=true;};
  status.readValue=async()=>status.value;
  const emit=(text)=>{const bytes=new TextEncoder().encode(text);status.value=new DataView(bytes.buffer);status.dispatchEvent(new Event('characteristicvaluechanged'));};
  const rx={writeValueWithResponse:async(bytes)=>{writes.push(Array.from(bytes)); await options.onWrite?.(bytes,emit);}};
  const service={getCharacteristic:async uuid=>uuid===RX_UUID?rx:uuid===STATUS_UUID?status:Promise.reject(new Error('wrong characteristic'))};
  const device=new EventTarget();
  device.name='Desk-ABC123';
  device.gatt={connected:false, disconnectCount:0, connect:async()=>{await options.beforeConnect?.();device.gatt.connected=true;return device.gatt;},getPrimaryService:async uuid=>{assert.equal(uuid,SERVICE_UUID);return service;},disconnect:()=>{device.gatt.disconnectCount++; device.gatt.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
  const requests=[];
  const bluetooth={requestDevice:request=>{requests.push(request);return options.choose?options.choose():Promise.resolve(device);}};
  const states=[];
  const connection=new DeskMessageConnection({bluetooth,onState:state=>states.push(state),timeoutMs:options.timeoutMs??1000});
  return {connection,device,status,rx,writes,requests,states,emit};
}

test('messages normalize line endings and wrap in the four-line display area',()=>{
  assert.equal(normalizeMessage('Hello\r\nDesk'),'Hello\nDesk');
  assert.deepEqual(layoutMessage('one two three\n'+'x'.repeat(29)),['one two three','x'.repeat(28),'x']);
  for(const message of ['', '   ', 'Hi 🌤', 'x\ry', 'x\ty', 'x'.repeat(113), 'a\nb\nc\nd\ne']) assert.throws(()=>normalizeMessage(message));
  assert.deepEqual(layoutMessage('x'.repeat(112)),Array(4).fill('x'.repeat(28)));
});

test('connect opens the filtered chooser synchronously and discovers notifications',async()=>{
  const f=fixture(); const connecting=f.connection.connect();
  assert.equal(f.requests.length,1);
  assert.deepEqual(f.requests[0],{filters:[{services:[SERVICE_UUID]}]});
  await connecting;
  assert.equal(f.connection.connected,true);assert.equal(f.status.started,true);
  await assert.rejects(f.connection.connect(),/already|busy/i);
  f.connection.disconnect();assert.equal(f.connection.connected,false);assert.equal(f.status.stopped,true);
});

test('send uses default-MTU packets and waits for the matching displayed acknowledgement',async()=>{
  const f=fixture();await f.connection.connect();let done=false;
  const sending=f.connection.send('x'.repeat(112)).then(value=>{done=true;return value;});
  await tick();
  assert.ok(f.writes.every(packet=>packet.length<=20));
  const id=f.writes[0][1];assert.deepEqual(f.writes[0],[1,id,112]);
  assert.deepEqual(f.writes.at(-1),[3,id]);
  assert.equal(f.writes.filter(p=>p[0]===2).flatMap(p=>p.slice(2)).length,112);
  f.emit('shown:'+((id+1)%256));await tick();assert.equal(done,false);
  f.emit('shown:'+id);await sending;assert.equal(done,true);f.connection.disconnect();
});

test('validation and concurrent sends cannot write unintended messages',async()=>{
  const f=fixture();await assert.rejects(f.connection.send('hello'),/connect/i);await f.connection.connect();
  await assert.rejects(f.connection.send('emoji 🙂'));assert.equal(f.writes.length,0);
  const sending=f.connection.send('hello');await tick();
  await assert.rejects(f.connection.send('other'),/busy|pending/i);
  const id=f.writes[0][1];f.emit('shown:'+id);await sending;f.connection.disconnect();
});

test('an early shown notification cannot override a later write failure',async()=>{
  const f=fixture({onWrite:(bytes,emit)=>{if(bytes[0]===3){emit('shown:'+bytes[1]);throw new Error('write failed');}}});
  await f.connection.connect();await assert.rejects(f.connection.send('hello'),/write failed/);f.connection.disconnect();
});

test('early successful acknowledgement waits for the final write to resolve',async()=>{
  const last=deferred();const f=fixture({onWrite:(bytes,emit)=>{if(bytes[0]===3){emit('shown:'+bytes[1]);return last.promise;}}});
  await f.connection.connect();let done=false;const sending=f.connection.send('hello').then(()=>{done=true;});await tick();assert.equal(done,false);
  last.resolve();await sending;assert.equal(done,true);f.connection.disconnect();
});

for(const state of ['error','busy']) test('receiver '+state+' rejects without retry or success',async()=>{
  const f=fixture({onWrite:(bytes,emit)=>{if(bytes[0]===3)emit(state+':'+bytes[1]);}});
  await f.connection.connect();await assert.rejects(f.connection.send('hello'),/reject|busy|error/i);assert.equal(f.writes.filter(p=>p[0]===1).length,1);f.connection.disconnect();
});

test('timeout disconnects and rejects rather than treating a write as display success',async()=>{
  const f=fixture({timeoutMs:10});await f.connection.connect();await assert.rejects(f.connection.send('hello'),/timed out|timeout/i);assert.equal(f.connection.connected,false);
});

test('device disconnect rejects an active send even if a GATT write is still pending',async()=>{
  const write=deferred();const f=fixture({onWrite:()=>write.promise});await f.connection.connect();const sending=f.connection.send('hello');await tick();f.device.gatt.disconnect();await assert.rejects(sending,/disconnect/i);write.resolve();
});

test('disconnect cancels chooser and a later selection cannot become connected',async()=>{
  const choose=deferred();const f=fixture({choose:()=>choose.promise});const pending=f.connection.connect();f.connection.disconnect();await assert.rejects(pending,/cancel|disconnect/i);choose.resolve(f.device);await tick();assert.equal(f.connection.connected,false);
});

test('cancelled connection cleans up a late GATT connect',async()=>{
  const wait=deferred();const f=fixture({beforeConnect:()=>wait.promise});const pending=f.connection.connect();await tick();f.connection.disconnect();await assert.rejects(pending,/cancel|disconnect/i);wait.resolve();await tick();assert.equal(f.device.gatt.connected,false);assert.equal(f.connection.connected,false);
});

test('notification setup failure releases the device and permits retry',async()=>{
  const f=fixture();f.status.startNotifications=async()=>{throw new Error('notify failed');};await assert.rejects(f.connection.connect(),/notify failed/);assert.equal(f.device.gatt.connected,false);assert.equal(f.connection.connected,false);
  f.status.startNotifications=async()=>f.status;await f.connection.connect();f.connection.disconnect();
});
