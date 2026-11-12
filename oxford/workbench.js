// Included in the DSH client factory by the bundle builder. No Node API or
// instrument commands run in the browser; the host owns capability checks.
function createOxfordWorkbench(React) {
  const h = React.createElement
  const {useState, useRef, useEffect} = React
  const DRAFT = 'oxford:measurement-draft:v1'
  const example = [
    '#!oxford-python',
    '# 两层扫描练习：只采样，不改变任何仪器的设定。',
    'for temperature in [4, 6]:',
    '    # 在这里设定温度，并等待样品稳定。',
    '    for field in [0, 10, 20]:',
    '        # 在这里设定磁场，并等待目标场。',
    '        hold(1)',
    '',
  ].join('\n')
  const twoAxis = [
    '#!oxford-python',
    '# PPMS 形式的设定示例；预览不执行。实机前核对设备、单位和稳定条件。',
    'for temperature in (4, 6):',
    '    set_value(0, "Temperature", temperature, 1)',
    '    for field in (0, 10, 20):',
    '        set_value(0, "Magnet", field, 1)',
    '        hold(1)',
    '',
  ].join('\n')
  function initialDraft() { try { return sessionStorage.getItem(DRAFT) ?? example } catch { return example } }
  function errText(e) { return e && typeof e.message === 'string' ? e.message : '无法完成请求。' }
  async function api(path, body, signal) {
    const response = await fetch('oxford/'+path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache:'no-store', signal,
      headers: body === undefined ? {accept:'application/json'} : {accept:'application/json','content-type':'application/json'},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}),
    })
    let data
    try { data = await response.json() } catch { throw new Error('Oxford 服务未返回可读取的响应（HTTP '+response.status+'）。') }
    if (!response.ok || data?.error) {
      const e = new Error(typeof data?.error === 'string' ? data.error : '请求失败（HTTP '+response.status+'）')
      if (Number.isInteger(data?.line)) e.line=data.line
      throw e
    }
    return data
  }
  function button(label, onClick, disabled=false, kind='', extra={}) {
    return h('button',{type:'button',className:'ox-btn '+kind, disabled, onClick, ...extra},label)
  }
  function eyebrow(text) { return h('span',{className:'ox-kicker'},text) }
  function sectionHeading(code, title, right) {
    return h('header',{className:'ox-section-h'},h('div',null,eyebrow(code),h('h2',null,title)),right)
  }
  function badge(text, active=false) { return h('span',{className:'ox-badge', 'data-active':active},h('i',{'aria-hidden':true}),text) }
  // The identity uses the project's 03 CORE geometry; the instrument drawing
  // is a schematic with no implied sensor values, wiring or physical scale.
  function mark() {
    return h('svg',{className:'ox-mark',viewBox:'0 0 1000 866','aria-hidden':true},h('path',{fill:'currentColor',fillRule:'evenodd',d:'M1000 866 500 0 0 866Z M500 24 512 44.785 512 332.554 718 689.356 967.215 833.241 979.215 854.025 955.215 854.025 706 710.141 294 710.141 44.785 854.025 20.785 854.025 32.785 833.241 282 689.356 488 332.554 488 44.785Z M415 626.425 585 626.425 500 479.201Z'}))
  }
  function diagram(compact=false) {
    const shapes = [
      ['M10 94 115 111 246 63 147 47Z','ground'],
      ['M34 83 78 90 107 80 64 73Z','plate'],
      ['M43 34 C43 21 84 22 84 34 V76 C84 87 43 85 43 76Z','wall'],
      ['M43 34 C43 23 84 23 84 34 C84 45 43 45 43 34Z','lid'],
      ['M48 29 48 24 C48 15 79 16 79 24 V29 C79 38 48 38 48 29Z','plate'],
      ['M54 22 V17 C54 11 74 11 74 17 V22 C74 29 54 29 54 22Z','lid'],
      ['M54 17 C54 11 74 11 74 17 C74 23 54 23 54 17Z','lid'],
      ['M46 69 C46 76 81 78 83 70 M47 38 V66 M79 39 V68 M48 46 58 48 V54 L48 52Z','line'],
    ]
    for (const [x,y] of [[158,51],[128,64],[98,77]]) {
      shapes.push([`M${x} ${y} l27 -11 50 8 -26 11Z`,'lid'],[`M${x} ${y} l51 8 v16 l-51 -8Z`,'plate'],
        [`M${x+51} ${y+8} l26 -11 v16 l-26 11Z`,'wall'],[`M${x+5} ${y+5} l17 2 v6 l-17 -2Z`,'screen'],
        [`M${x+27} ${y+6} l12 2 m-12 2 12 2 m-12 2 12 2 M${x+41} ${y+10} l5 1`,'line'])
    }
    return h('svg',{className:compact?'ox-art ox-art-small':'ox-art',viewBox:'0 0 254 120','aria-hidden':true},
      ...shapes.map(([d,k],i)=>h('path',{key:i,d,className:'ox-art-'+k})))
  }
  function timeText(raw) {
    const d=raw ? new Date(raw) : null
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : '—'
  }
  return function OxfordWorkbench({onClose}) {
    const [tab,setTab]=useState('plan'), [source,setSource]=useState(initialDraft)
    const [status,setStatus]=useState(null), [statusError,setStatusError]=useState('')
    const [result,setResult]=useState(null),[fault,setFault]=useState(null),[notice,setNotice]=useState('')
    const [operation,setOperation]=useState(''),[armedFor,setArmedFor]=useState(null),[page,setPage]=useState(0)
    const [selected,setSelected]=useState(null)
    const op=useRef(''),seq=useRef(0),alive=useRef(false),textEl=useRef(null),fileEl=useRef(null),curSource=useRef(source)
    curSource.current=source
    async function refresh(signal) {
      const ticket=++seq.current
      try {
        const state=await api('status',undefined,signal)
        if(!alive.current||ticket!==seq.current||op.current==='native')return
        setStatus(state); setStatusError('')
        if(!state.bridgeConnected || !state.armed)setArmedFor(null)
      } catch(e) {
        if(!alive.current||ticket!==seq.current||signal?.aborted||op.current==='native')return
        setStatus(null);setStatusError(errText(e));setArmedFor(null)
      }
    }
    useEffect(()=>{
      alive.current=true
      const ctrl=new AbortController()
      let timer
      const poll=async()=>{ if(!op.current) await refresh(ctrl.signal); if(!ctrl.signal.aborted)timer=setTimeout(poll,3000) }
      poll()
      return ()=>{alive.current=false;clearTimeout(timer);ctrl.abort();seq.current++}
    },[])
    useEffect(()=>{try {sessionStorage.setItem(DRAFT,source)} catch {}},[source])
    const bridge=status?.bridgeConnected===true, online=bridge&&status?.mode==='online'
    const running=bridge&&status?.measuring===true, paused=running&&status?.paused===true, armed=bridge&&status?.armed===true
    const compiled=result && result.source===source, locked=!!operation, canEdit=!running && !locked
    const devices=bridge&&Array.isArray(status?.devices)?status.devices:[]
    const device=devices.find(d=>d.id===selected)??devices[0]
    const latest=online&&Array.isArray(status?.latest)?status.latest:[]
    const dataStatus=statusError?'状态不可用':!status?'正在读取':!bridge?'未启动':online?'联机模式':'离线模式'
    function change(value) { curSource.current=value;setSource(value);setFault(null);setNotice('');setPage(0) }
    function gotoLine(line) {
      const node=textEl.current;if(!node||!Number.isInteger(line))return
      const lines=source.split('\n'),index=Math.max(0,Math.min(lines.length-1,line-1)),a=lines.slice(0,index).reduce((s,l)=>s+l.length+1,0)
      node.focus(); node.setSelectionRange(a,a+lines[index].length)
      node.scrollTop=Math.max(0,index*(parseFloat(getComputedStyle(node).lineHeight)||22)-node.clientHeight/3)
    }
    async function preview(){
      if(op.current || running || !status?.plannerAvailable || !source.trim())return
      const submitted=source; op.current='preview';setOperation('preview');setFault(null);setNotice('')
      try{
        const answer=await api('plan',{source:submitted})
        if(!Array.isArray(answer.steps)||!answer.steps.length)throw new Error('计划未生成可预览的步骤。')
        if(alive.current && submitted===curSource.current){setResult({source:submitted,steps:answer.steps});setPage(0)}
      }catch(e){if(alive.current&&submitted===curSource.current){setResult(null);setFault({text:errText(e),line:e.line})}}
      finally{op.current='';if(alive.current)setOperation('')}
    }
    const confirmations={
      openOffline:'打开原生 Oxford 离线窗口？此模式不会连接仪器。',
      openOnline:'切换到原生 Oxford 联机模式？这可能会打开当前配置的真实仪器连接。请先核对实验现场与设备。',
      start:'开始执行当前已启用的测量计划？其中的设定动作会写入真实仪器。请确认通道、保存位置和实验条件已就绪。',
      resume:'恢复当前测量？Oxford 将从暂停位置继续执行原计划。',
      close:'关闭原生 Oxford 窗口并断开工作台会话？',
    }
    async function native(action){
      if(op.current || status?.busy)return
      if(confirmations[action]&&!window.confirm(confirmations[action]))return
      op.current='native'; ++seq.current;setOperation(action);setNotice('');setFault(null)
      const submitted=source
      try {
        const data=await api('native',{action,...(['arm','start'].includes(action)?{source:submitted}:{})})
        if(!alive.current)return
        if(typeof data.bridgeConnected==='boolean')setStatus(data)
        if(action==='arm')setArmedFor(submitted)
        else if(['close','openOffline','openOnline','stop'].includes(action))setArmedFor(null)
        setNotice(data.message || ({arm:'已启用当前计划。',start:'已向 Oxford 提交开始请求。',stop:'已请求结束测量。',close:'已关闭原生窗口。'}[action]??'操作已提交。'))
      } catch(e){if(alive.current)setFault({text:errText(e),line:e.line})}
      finally{op.current='';if(alive.current){setOperation('');await refresh()}}
    }
    function keyDown(e){
      if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();preview();return}
      if(!canEdit)return
      if(e.key==='Tab'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey){
        e.preventDefault();const node=e.currentTarget,start=node.selectionStart,end=node.selectionEnd
        if(end>start) {
          const a=source.lastIndexOf('\n',Math.max(0,start-1))+1
          const selected=source.slice(a,end).replace(/\n(?=.)/g,'\n    ')
          change(source.slice(0,a)+'    '+selected+source.slice(end))
          requestAnimationFrame(()=>node.setSelectionRange(start+4,a+4+selected.length))
        } else {
          change(source.slice(0,start)+'    '+source.slice(end))
          requestAnimationFrame(()=>node.setSelectionRange(start+4,start+4))
        }
      }
      if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.nativeEvent?.isComposing) {
        const node=e.currentTarget,start=node.selectionStart,end=node.selectionEnd
        const current=source.slice(source.lastIndexOf('\n', start-1)+1,start)
        const padding=(current.match(/^[ \t]*/)?.[0]??'')+(current.trimEnd().endsWith(':')?'    ':'')
        if(padding){e.preventDefault();change(source.slice(0,start)+'\n'+padding+source.slice(end));requestAnimationFrame(()=>node.setSelectionRange(start+padding.length+1,start+padding.length+1))}
      }
      if(e.key==='Escape'){nodeFocusExit(e.currentTarget)}
    }
    function nodeFocusExit(node){const root=node.closest('.ox-workbench');(root?.querySelector('.ox-compile:not(:disabled)')??root?.querySelector('.ox-return'))?.focus()}
    function loadExample(value) { if(value && window.confirm('用所选示例替换当前草稿？'))change(value==='read'?example:twoAxis) }
    async function importScript(e) {
      const f=e.target.files?.[0];e.target.value='';if(!f)return
      if(f.size>65536){setFault({text:'脚本大小不能超过 64 KiB。'});return}
      if(source.trim()&&!window.confirm('用文件内容替换当前工作台草稿？'))return
      try{const content=new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer());change(content.replace(/\r\n?/g,'\n'))}catch{setFault({text:'无法读取此文件，请选择 UTF-8 编码的 Python 脚本。'})}
    }
    function download(){
      const url=URL.createObjectURL(new Blob([source],{type:'text/plain;charset=utf-8'}))
      const a=document.createElement('a');a.href=url;a.download='oxford-plan.py';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }
    const pages=result?Math.ceil(result.steps.length/25):0
    const editor=h('section',{className:'ox-box ox-editor'},sectionHeading('01 / SOURCE','测量脚本',h('span',{className:'ox-tag'},'Python')),
      h('div',{className:'ox-ed-tools'},h('select',{className:'ox-example','aria-label':'载入测量示例',value:'',disabled:!canEdit,onChange:e=>loadExample(e.target.value)},h('option',{value:''},'载入示例…'),h('option',{value:'read'},'嵌套只读采样'),h('option',{value:'scan'},'二维设定示例')),h('span',{className:'ox-spacer'}),button('导入',()=>fileEl.current?.click(),!canEdit,'ox-small'),button('导出',download,!source.trim(),'ox-small'),
        h('input',{hidden:true,type:'file',accept:'.py,text/plain',ref:fileEl,onChange:importScript})),
      h('textarea',{ref:textEl,className:'ox-code','aria-label':'Python 测量脚本',value:source,spellCheck:false,maxLength:65536,autoCapitalize:'off',autoCorrect:'off',readOnly:!canEdit,onKeyDown:keyDown,onChange:e=>change(e.target.value)}),
      h('div',{className:'ox-ed-bottom'},button(operation==='preview'?'正在编译…':'编译预览',preview,locked||running||!source.trim()||!status?.plannerAvailable,'ox-primary ox-compile'),
        h('span',{className:'ox-help'},'仅展开动作，不连接仪器。')))
    const previewBox=h('section',{className:'ox-box ox-preview'},sectionHeading('02 / SEQUENCE','动作预览',h('span',{className:'ox-tag'},compiled?result.steps.length+' 步':'—')),
      compiled?h(React.Fragment,null,h('div',{className:'ox-scroll'},h('table',{'aria-label':'展开的测量动作'},h('thead',null,h('tr',null,...['序号','源码行','动作'].map(x=>h('th',{key:x,scope:'col'},x)))),h('tbody',null,
        ...result.steps.slice(page*25,page*25+25).map((s,i)=>h('tr',{key:page*25+i},h('td',null,String(page*25+i+1).padStart(2,'0')),h('td',null,button(String(s.line),()=>gotoLine(s.line),false,'ox-line',{'aria-label':'转到源码第 '+s.line+' 行'})),h('td',null,h('code',null,s.command))))))),
        pages>1?h('div',{className:'ox-pagination'},button('上一页',()=>setPage(p=>p-1),page<=0,'ox-small'),h('span',null,(page+1)+' / '+pages),button('下一页',()=>setPage(p=>p+1),page>=pages-1,'ox-small')):null)
        :h('p',{className:'ox-empty'},result?'草稿已修改，请重新编译。':status?.plannerAvailable===false?'本机编译器不可用，请检查插件的 Python 环境。':'编译后可逐步查看仪器动作，并跳转到对应源码。'))
    const archive=h('section',{className:'ox-box'},sectionHeading('01 / REGISTRY','配置设备',h('span',{className:'ox-tag'},bridge?devices.length+' 台':'—')),
      devices.length?h('div',{className:'ox-device-list'},...devices.map(d=>button(h(React.Fragment,null,h('b',null,String(d.id).padStart(2,'0')),h('span',null,h('strong',null,d.name||d.type),h('small',null,d.type)),badge(online&&d.connected?'已连接':'未连接',online&&d.connected)),()=>setSelected(d.id),false,'ox-device',{key:d.id,'aria-pressed':d===device})))
        :h('div',{className:'ox-drawing'},diagram(),h('div',null,eyebrow('STRUCTURE / 结构示意'),h('p',null,bridge?'当前配置没有设备。':'原生窗口未连接，尚未载入设备配置。'))),
      device?h('div',{className:'ox-device-detail'},eyebrow('SELECTED / 当前设备'),h('strong',null,device.name||device.type),h('span',null,device.type+' · 编号 '+device.id)):null)
    const observations=h('section',{className:'ox-box'},sectionHeading('02 / TELEMETRY','最近采样',h('span',{className:'ox-tag'},online&&status?.sampleUtc?'实测记录':'—')),
      online&&status?.sampleUtc&&latest.length?h(React.Fragment,null,h('p',{className:'ox-help ox-inset'},timeText(status.sampleUtc)),h('dl',{className:'ox-kv'},...latest.map((s,i)=>h('div',{key:i},h('dt',null,s.label??'未命名通道'),h('dd',null,typeof s.value==='number'&&Number.isFinite(s.value)?String(s.value):typeof s.value==='string'&&s.value.trim()?s.value:'—'))))):
      h('p',{className:'ox-empty'},online?'尚未收到带时间的采样记录。':'离线时不显示实测读数。'))
    const nativeLocked=locked||!!status?.busy
    let controls=h('div',{className:'ox-pair'},button('离线打开',()=>native('openOffline'),nativeLocked||!status?.nativeAvailable,'ox-primary'),button('联机打开',()=>native('openOnline'),nativeLocked||!status?.nativeAvailable))
    if(bridge)controls=h(React.Fragment,null,
      h('div',{className:'ox-pair'},button('启用计划',()=>native('arm'),nativeLocked||running||!compiled),button('开始测量',()=>native('start'),nativeLocked||!online||running||!armed||!compiled||armedFor!==source,'ox-primary')),
      h('div',{className:'ox-pair'},button(paused?'恢复测量':'暂停测量',()=>native(paused?'resume':'pause'),nativeLocked||!running),button('结束测量',()=>native('stop'),nativeLocked||!running,'ox-stop')),
      h('div',{className:'ox-pair'},button('查看原生窗口',()=>native('focus'),nativeLocked),button('关闭原生窗口',()=>native('close'),nativeLocked||running)))
    const side=h('aside',{className:'ox-aside'},h('section',{className:'ox-box'},sectionHeading('OXFORD / NATIVE','原生控制',badge(dataStatus,online)),
      h('dl',{className:'ox-kv'},...[['计划编译器',status?(status.plannerAvailable?'可用':'不可用'):'—'],['原生窗口',bridge?'已连接':status?(status.nativeAvailable?'已绑定':'未绑定'):'—'],['测量状态',status?.busy?'等待原生响应':!bridge?'—':paused?'已暂停':running?'采集中':armed?'已启用':'待命']].map(([k,v])=>h('div',{key:k},h('dt',null,k),h('dd',null,v)))),
      h('div',{className:'ox-transport'},controls,h('p',{className:'ox-help'},!bridge?(status?.nativeAvailable===false?'本机没有可用的 Oxford 运行桥。可继续编辑脚本。':'离线打开只查看配置；联机打开将使用实际设备。'):!online?'请关闭离线窗口再选择「联机打开」。':running?'返回 DSH 不会停止正在进行的测量。':'请先在原生窗口确认通道与保存位置，再启用计划。'))),
      h('section',{className:'ox-note'},eyebrow('FIELD NOTES'),h('strong',null,tab==='plan'?'二维扫描':'数据来源'),h('p',null,tab==='plan'?'外层循环选择温度，内层循环选择磁场。示例中的 hold(1) 只采一个点；变量本身不会改变仪器设定。':'设备和时间戳来自当前 Oxford 实例。结构示意只帮助辨认设备，不代表连接或采样状态。')))
    return h('div',{className:'ox-workbench','aria-label':'Oxford 仪器工作台'},
      h('div',{className:'ox-shell'},h('header',{className:'ox-mast'},h('div',{className:'ox-id'},mark(),eyebrow('XLAB / COMPONENT 01')),h('div',{className:'ox-mast-main'},h('h1',null,'Oxford 仪器工作台'),h('p',null,'测量计划、仪器配置与采集控制')),button('返回 DSH',onClose,false,'ox-return',{'aria-label':'返回 DSH'})),
      h('nav',{className:'ox-nav','aria-label':'测量视图'},button('测量计划',()=>setTab('plan'),false,'ox-view',{'aria-pressed':tab==='plan'}),button('设备与读数',()=>setTab('devices'),false,'ox-view',{'aria-pressed':tab==='devices'}),h('span',{className:'ox-spacer'}),eyebrow('OXFORD / MEASUREMENT')),
      h('div',{className:'ox-messages','aria-live':'polite'},statusError?h('p',{role:'alert'},'暂时无法获取 Oxford 状态：'+statusError):null,
        fault?h('p',{role:'alert'},fault.text,Number.isInteger(fault.line)&&tab==='plan'?button('查看第 '+fault.line+' 行',()=>gotoLine(fault.line),false,'ox-small'):null):null,
        notice?h('p',null,notice):null,operation&&operation!=='preview'?h('p',null,'等待原生 Oxford 响应…'):null,
        !fault&&!statusError&&!notice&&status?.message?h('p',null,String(status.message)):null),
      h('div',{className:'ox-columns'},h('main',{className:'ox-body'},tab==='plan'?editor:archive,tab==='plan'?previewBox:observations),side)))
  }
}
