import { OxfordBridge,compilePlan } from './services.js'
export const name='oxford'
export const inject=['connection','webServer']
function answer(res,code,body){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
async function readBody(req){
  let bytes=0;const parts=[]
  for await(const chunk of req){bytes+=chunk.length;if(bytes>400000)throw Error('请求过大。');parts.push(chunk)}
  return JSON.parse(Buffer.concat(parts).toString('utf8'))
}
export function apply(ctx){
  const bridge=new OxfordBridge()
  let compiling=0
  ctx.effect(()=>()=>bridge.dispose(),'oxford: detach native bridge')
  for(const [path,method] of [['status','GET'],['plan','POST'],['native','POST'],['theme','POST']]){
    ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/oxford/'+path,handler:async(req,res)=>{
      let denied;try{denied=ctx.connection.requestRejection(req)}catch{denied=401}
      if(denied!==undefined)return answer(res,denied,{error:'需要有效的 DSH 会话。'})
      if(req.method!==method)return answer(res,405,{error:'请求方式不正确。'})
      if((path==='native'||path==='theme') && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))
        return answer(res,403,{error:'仪器控制只允许在本机使用。'})
      if(method==='POST' && (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'') || req.headers['sec-fetch-site']==='cross-site'))
        return answer(res,403,{error:'请从当前 DSH 工作台提交请求。'})
      try {
        if(path==='status')return answer(res,200,await bridge.status())
        const body=await readBody(req)
        if(path==='theme'){bridge.setTheme(body.theme);return answer(res,200,{theme:body.theme})}
        if(path==='native')return answer(res,200,await bridge.command(body.action,body.source))
        if(compiling>=2)return answer(res,429,{error:'已有计划正在编译，请稍后重试。'})
        compiling++;try{return answer(res,200,await compilePlan(body.source))}finally{compiling--}
      }catch(e){return answer(res,400,{error:e.message,line:e.line})}
    }}),'Oxford '+method+' '+path)
  }
}
