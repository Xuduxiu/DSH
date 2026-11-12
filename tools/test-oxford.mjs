import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {EventEmitter} from 'node:events'
import {PassThrough,Writable,Readable} from 'node:stream'
import {compilePlan,OxfordBridge} from '../oxford/services.js'
import {apply} from '../oxford/index.js'

test('real CPython expands two scans and maps actions to their source lines',async()=>{
  const src=readFileSync(new URL('../oxford/planner/two_axis_preview.py',import.meta.url),'utf8')
  const {steps,count}=await compilePlan(src)
  assert.equal(count,14)
  assert.deepEqual(steps.filter(s=>s.line===7).map(s=>s.command),['SET 0 Magnet 0 1','SET 0 Magnet 10 1','SET 0 Magnet 20 1','SET 0 Magnet 0 1','SET 0 Magnet 10 1','SET 0 Magnet 20 1'])
  await assert.rejects(compilePlan('hold(1)\nimport os'),e=>e.line===2)
})
test('owned stdio session: offline first, protocol acknowledgement, failure and detach',async()=>{
  const executable=fileURLToPath(import.meta.url),sha256=createHash('sha256').update(readFileSync(executable)).digest('hex')
  const proc=new EventEmitter();proc.stdout=new PassThrough();proc.unref=()=>{}
  const actions=[]
  proc.stdin=new Writable({write(chunk,enc,cb){
    const r=JSON.parse(chunk.toString());actions.push(r.action)
    queueMicrotask(()=>proc.stdout.write(JSON.stringify({protocol:1,id:r.id,...(r.action==='start'?{error:'offline'}:{status:{mode:'offline',armed:r.action==='arm',devices:[],latest:[]}})})+'\n'))
    cb()
  }})
  const bridge=new OxfordBridge({getBinding:()=>({executable,sha256}),launch:(file,args,opts)=>{
    assert.deepEqual(args,['--offline','--dsh-stdio']);assert.equal(file,executable);assert.equal(opts.shell,false);return proc
  }})
  assert.equal((await bridge.status()).bridgeConnected,false)
  assert.equal((await bridge.command('openOffline')).bridgeConnected,true)
  assert.equal((await bridge.command('arm','hold(1)')).armed,true)
  await assert.rejects(bridge.command('start','hold(1)'),/offline/)
  await assert.rejects(bridge.command('arbitrary'),/未知/)
  assert.deepEqual(actions,['status','arm','start'])
  bridge.dispose();assert.equal((await bridge.status()).mode,'closed')
})
test('DSH routes require authenticated request, correct method, JSON and local control',async()=>{
  const handlers={},cleanups=[]
  const ctx={effect(fn){cleanups.push(fn())},webServer:{register(r){handlers[r.path]=r.handler;return ()=>{}}},connection:{requestRejection(req){return req.denied}}}
  apply(ctx)
  async function call(path,method,body,extra={}){
    const req=Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]),{method,headers:{'content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}},extra)
    let code,data;const res={writeHead(v){code=v},end(v){data=JSON.parse(v)}}
    await handlers['/oxford/'+path](req,res)
    return {code,data}
  }
  assert.equal((await call('status','GET',{}, {denied:401})).code,401)
  assert.equal((await call('plan','GET',{})).code,405)
  assert.equal((await call('native','POST',{action:'openOnline'},{socket:{remoteAddress:'192.0.2.1'}})).code,403)
  assert.equal((await call('native','POST',{action:'openOnline'},{headers:{'content-type':'text/plain'}})).code,403)
  assert.equal((await call('plan','POST',{source:'hold(1)'})).data.count,1)
  assert.equal((await call('native','POST',{action:'unknown'})).code,400)
  for(const fn of cleanups)fn()
})
