import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, isAbsolute, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

export const home = () => process.env.DSH_HOME || join(homedir(), '.dsh')
const here = dirname(fileURLToPath(import.meta.url))
const isFile = path => typeof path === 'string' && isAbsolute(path) && existsSync(path)
export function binding() {
  try {
    const cfg = JSON.parse(readFileSync(join(home(), 'toolkit', 'oxford.json'), 'utf8').replace(/^\uFEFF/, ''))
    return process.platform === 'win32' && isFile(cfg.executable) && basename(cfg.executable).toLowerCase() === 'oxford.exe'
      && /^[0-9a-f]{64}$/i.test(cfg.sha256) ? cfg : null
  } catch { return null }
}
export function pythonExecutable() {
  const rel = join('dependencies', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3')
  const bound = binding()
  return [process.env.DSH_OXFORD_PYTHON, bound && join(dirname(bound.executable),'Assets','Python','python.exe'),
    join(home(),'dsh-runtimes','dsh-primary-runtime',rel),
    join(dirname(process.execPath),'resources','runtime','primary-runtime',rel)].find(isFile)
}
export function validatedSource(source) {
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source)>65536)
    throw Error('请输入不超过 64 KiB 的 Python 测量计划。')
  return source
}
export async function compilePlan(source) {
  validatedSource(source)
  const py = pythonExecutable()
  if (!py) throw Error('未找到 Python。请配置 DSH_OXFORD_PYTHON 为本机 Python 3 的绝对路径，再重启 DSH。')
  return new Promise((resolve,reject) => {
    const proc=spawn(py,['-I','-B','-X','utf8',join(here,'planner','compile_plan.py')],{shell:false,windowsHide:true,stdio:['pipe','pipe','ignore']})
    let size=0, exceeded=false
    const parts=[]
    const deadline=setTimeout(()=>{ exceeded=true;proc.kill() },10000)
    proc.stdout.on('data',chunk=>{
      size+=chunk.length
      if(size>12*1024*1024){exceeded=true;proc.kill()} else parts.push(chunk)
    })
    proc.once('error',()=>{clearTimeout(deadline);reject(Error('无法启动本机 Python 编译器。'))})
    proc.stdin.on('error',()=>{})
    proc.once('close',code=>{
      clearTimeout(deadline)
      try {
        if(exceeded) throw Error('计划编译超时或输出过大。')
        const value=JSON.parse(Buffer.concat(parts).toString('utf8'))
        if(code!==0 || value.error) throw Object.assign(Error(value.error||'编译失败'),{line:value.line})
        if(!Array.isArray(value.steps)||!value.steps.length||value.steps.length>10000) throw Error('编译器返回无效计划。')
        resolve({count:value.steps.length,steps:value.steps})
      }catch(err){reject(err)}
    })
    proc.stdin.end(source,'utf8')
  })
}

// One owned Oxford child. No listener, shell, discovery of arbitrary local
// processes, or executable path supplied by the browser. Disconnecting DSH
// leaves an open native console in charge of any measurement in progress.
export class OxfordBridge {
  constructor({getBinding=binding,launch=spawn}={}){this.getBinding=getBinding;this.launch=launch;this.proc=null;this.pending=null;this.serial=0;this.last=null;this.note='';this.theme=null}
  setTheme(theme){
    if(!['day','night','glass','xlab'].includes(theme))throw Error('未知视觉协议。')
    if(this.theme!==theme){
      this.theme=theme
      // A presentation update has no command slot. Replies with id 0 are
      // ignored; a colour change never rejects or queues a measurement action.
      if(this.proc)this.proc.stdin.write(JSON.stringify({id:0,action:'status',theme})+'\n',()=>{})
    }
  }
  base(){
    return {plannerAvailable:!!pythonExecutable(),nativeAvailable:!!this.getBinding(),bridgeConnected:false,mode:'closed',
      measuring:false,paused:false,armed:false,devices:[],latest:[],sampleUtc:null,message:this.note}
  }
  async status(){
    if(!this.proc)return this.base()
    if(this.pending) return {...this.base(),...this.last,busy:true}
    try {return {...this.base(),...await this.ask('status')}} catch {return {...this.base(),message:this.note||'原生窗口尚未响应；设备状态未知。'}}
  }
  async open(online){
    if(this.proc)throw Error('已有原生窗口；请先结束测量并关闭该窗口，再切换启动模式。')
    const cfg=this.getBinding()
    if(!cfg)throw Error('尚未绑定兼容的 Oxford 本机程序。')
    if(createHash('sha256').update(readFileSync(cfg.executable)).digest('hex')!==cfg.sha256.toLowerCase())
      throw Error('Oxford 文件已更改，请重新绑定受信任的构建。')
    let proc
    try {proc=this.launch(cfg.executable,[online?'--connect':'--offline','--dsh-stdio'],{cwd:dirname(cfg.executable),shell:false,stdio:['pipe','pipe','ignore']})}
    catch {this.note='无法启动本机 Oxford。请检查 Windows 应用控制策略及绑定的构建；未连接仪器。';throw Error(this.note)}
    this.proc=proc;this.last=null;this.note=''
    proc.stdin.on('error',()=>{})
    const closed=reason=>{
      if(this.proc!==proc)return
      this.proc=null;this.last=null;this.note=reason
      if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error(reason));this.pending=null}
    }
    proc.once('error',()=>closed('系统未能启动 Oxford。请检查应用控制策略和绑定版本；未确认连接。'))
    proc.once('exit',()=>closed('Oxford 进程已退出。'))
    const reader=createInterface({input:proc.stdout,crlfDelay:Infinity})
    reader.on('line',line=>{
      let r;try{r=JSON.parse(line)}catch{return}
      const next=this.pending
      if(this.proc!==proc||!next||r.protocol!==1||r.id!==next.id)return
      clearTimeout(next.timer);this.pending=null
      if(r.error){next.reject(Error(String(r.error)));return}
      if(!r.status||!['offline','online'].includes(r.status.mode)){next.reject(Error('Oxford 协议不兼容。'));return}
      this.last={...r.status,bridgeConnected:true};this.note=''
      next.resolve(this.last)
    })
    return {...this.base(),...await this.ask('status')}
  }
  ask(action,source){
    if(!this.proc)return Promise.reject(Error('请先打开 Oxford。'))
    if(this.pending)return Promise.reject(Error('原生窗口仍在处理上一个请求；请检查该窗口。'))
    const proc=this.proc, id=++this.serial
    const outcome=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.note='等待 Oxford 超时。请检查原生窗口；不要重复提交采集操作。'
        // A modal dialog may complete late. Never queue or retry a hardware command.
        if(action==='status' && this.pending?.id===id)this.pending=null
        reject(Error(this.note))
      },action==='status'?6000:90000)
      this.pending={id,timer,resolve,reject,action}
      proc.stdin.write(JSON.stringify({id,action,source,theme:this.theme})+'\n','utf8',err=>{
        if(err && this.pending?.id===id){clearTimeout(timer);this.pending=null;reject(Error('Oxford 管道已关闭。'))}
      })
    })
    if(this.pending?.id===id)this.pending.done=outcome
    return outcome
  }
  async command(action,source){
    if(action==='openOffline'||action==='openOnline')return this.open(action==='openOnline')
    if(!['arm','start','stop','pause','resume','close','focus'].includes(action))throw Error('未知的仪器操作。')
    if(action==='arm'||action==='start')validatedSource(source)
    if(this.pending?.action==='status'){
      const owner=this.proc;await this.pending.done
      if(owner!==this.proc)throw Error('原生会话已更换；请重新检查状态。')
    }
    return {...this.base(),...await this.ask(action,source)}
  }
  dispose(){
    if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('测量插件已卸载。'));this.pending=null}
    this.proc?.stdin.end();this.proc?.unref();this.proc=null;this.last=null
  }
}
