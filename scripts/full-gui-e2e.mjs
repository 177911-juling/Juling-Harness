/** Real Electron acceptance with isolated profiles and no model requests. */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {findBun} from './omp-tooling.mjs';
import {defaultRuntimeKeysDirectory} from './runtime-signing-keys.mjs';
import {resolveTargetPlatform} from './target-platform.mjs';
import {mkdir,mkdtemp,readFile,writeFile,appendFile,readdir,realpath} from 'node:fs/promises';
import {resolveDesktopPaths} from '../apps/desktop/dist/src/platform/desktop-paths.js';
import {moveToApplicationsMarkerPath} from '../apps/desktop/dist/src/platform/app-lifecycle.js';
import {homedir,tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const { _electron }=require(process.env.PLAYWRIGHT_MODULE??'playwright');
// macOS sun_path is 104 bytes; the native prediction broker appends its socket name.
const temp=await mkdtemp(join(process.platform==='darwin'?'/tmp':tmpdir(),process.platform==='darwin'?'osg-':'omp-full-gui-'));
const output=process.env.OMP_E2E_OUTPUT_DIR??join(root,'outputs','full-gui-e2e');
const report={status:'running',modelCalls:0,checks:[],profile:temp};
let app,page;
const query=async(name,input={})=>{const r=await page.evaluate(async({name,input})=>{
 let timer;
 try{return await Promise.race([window.julingHarness.query({queryName:name,input}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Query timeout: '+name)),45000);})]);}
 finally{clearTimeout(timer);}
},{name,input});if(!r)throw Error('Empty query response: '+name);if(!r.ok)throw Error(JSON.stringify(r.error));return r.result;};
async function until(read,accept,label,timeoutMs=90000){const end=Date.now()+timeoutMs;let last;while(Date.now()<end){try{const value=await read();if(accept(value))return value;}catch(e){last=e;}await new Promise(r=>setTimeout(r,300));}throw Error(label+': '+last);}
const command=async(name,input={})=>page.evaluate(({name,input})=>{
 const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{off();reject(Error('Receipt timeout: '+name));},45000);
  const off=window.julingHarness.subscribe({scope:'command',requestId},event=>{
   if(event.kind!=='command.receipt'||!['completed','failed','rejected','outcome_unknown'].includes(event.receipt.status))return;
   clearTimeout(timer);off();if(event.receipt.status==='completed')resolve(event.receipt.result);else reject(Error(JSON.stringify(event.receipt)));
  });
  window.julingHarness.command({commandName:name,input,requestId,idempotencyKey:requestId}).catch(error=>{clearTimeout(timer);off();reject(error);});
 });
},{name,input});
async function scopedCommand(name,input,scope){return page.evaluate(async({name,input,scope})=>{
 const contextId=await window.julingHarness.openContext(scope);
 try{return await new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID();
  const timer=setTimeout(()=>{off();reject(Error('Scoped receipt timeout: '+name));},45000);
  const off=window.julingHarness.subscribe({scope:'command',requestId},event=>{
   if(event.kind!=='command.receipt'||!['completed','failed','rejected','outcome_unknown'].includes(event.receipt.status))return;
   clearTimeout(timer);off();if(event.receipt.status==='completed')resolve(event.receipt.result);else reject(Error(JSON.stringify(event.receipt)));
  },contextId);
  window.julingHarness.command({commandName:name,input,requestId,idempotencyKey:requestId},contextId).catch(error=>{clearTimeout(timer);off();reject(error);});
 });}finally{await window.julingHarness.close(contextId);}
},{name,input,scope});}
async function capture(name){await page.screenshot({path:join(output,name+'.png')});}
async function predictionDiagnostics(directory,depth=0){
 if(depth>6)return [];
 const lines=[];
 for(const entry of await readdir(directory,{withFileTypes:true}).catch(()=>[])){
  const path=join(directory,entry.name);
  if(entry.isDirectory())lines.push(...await predictionDiagnostics(path,depth+1));
  else if(entry.isFile()&&entry.name.endsWith('.log')){
   const text=await readFile(path,'utf8').catch(()=>'');
   lines.push(...text.split('\n').filter(line=>/text-predict:|Failed to acquire lock/.test(line)).map(line=>line.slice(0,1000)));
  }
 }
 return lines.slice(-20);
}

try{
 await Promise.all(['workspace','user-data','isolated-home'].map(p=>mkdir(join(temp,p),{recursive:true})));
 // Match Desktop's canonical workspace identity before calling the low-level
 // SessionManager fixture API (Bun sync realpath retains Windows 8.3 names).
 const workspace=await realpath(join(temp,'workspace')), transferFile=join(temp,'session-transfer.tar');
 await writeFile(join(workspace,'fixture.txt'),'Isolated Harness GUI acceptance workspace.\n');
 for(const args of [['init','-q','-b','main'],['add','.'],['commit','-qm','acceptance fixture']])execFileSync('git',['-c','user.name=Harness Acceptance','-c','user.email=acceptance@example.test',...args],{cwd:workspace,windowsHide:true,stdio:'pipe'});
 await mkdir(output,{recursive:true});
 await writeFile(join(output,'electron.log'),'');
 const desktop=join(root,'apps/desktop');
 const version=JSON.parse(await readFile(join(root,'omp-patch/patches/series.json'),'utf8')).patchsetVersion;
 const upstreamVersion=JSON.parse(await readFile(join(root,'omp-patch/vendor/oh-my-pi/packages/coding-agent/package.json'),'utf8')).version;
 const runtime=upstreamVersion+'-'+version;
 const keys=defaultRuntimeKeysDirectory();
 const trustedPublicKey=process.env.OMP_RUNTIME_TRUSTED_PUBLIC_KEY??join(keys,'trusted-public.pem');
 const signingKeyId=process.env.OMP_RUNTIME_SIGNING_KEY_ID??(await readFile(join(keys,'key-id.txt'),'utf8')).trim();
 const platform=resolveTargetPlatform();
 const isolatedHome=join(temp,'isolated-home');
 // Windows shell known-folder APIs resolve through USERPROFILE, not APPDATA.
 // Packaged Electron must see the same existing directories as the Host.
 const roaming=process.platform==='win32'?join(isolatedHome,'AppData','Roaming'):join(temp,'roaming');
 const local=process.platform==='win32'?join(isolatedHome,'AppData','Local'):join(temp,'local');
 // Electron resolves these known folders through USERPROFILE on Windows; a
 // missing Desktop/Documents/Downloads makes `app.getPath()` throw at startup.
 const shellFolders=process.platform==='win32'?['Desktop','Documents','Downloads','Music','Pictures','Videos'].map(name=>join(isolatedHome,name)):[];
 await Promise.all([roaming,local,...shellFolders].map(path=>mkdir(path,{recursive:true})));
 report.platform=platform;
 if(process.platform==='darwin'&&process.env.OMP_E2E_PACKAGED_EXE){
  const paths=resolveDesktopPaths({platform:'darwin',homedir:isolatedHome});
  await mkdir(paths.stateRoot,{recursive:true});
  await writeFile(moveToApplicationsMarkerPath(paths.stateRoot),'acceptance: Not Now');
  report.firstInstallScope='Normal Not Now preference seeded in isolated profile; native move dialog excluded';
 }
 await writeFile(join(temp,'bootstrap.cjs'),[
  "const {app,dialog}=require('electron');",
  'app.getAppPath=()=>'+JSON.stringify(desktop)+';',
  "app.setPath('appData',"+JSON.stringify(roaming)+');',
  "app.setPath('userData',"+JSON.stringify(join(temp,'user-data'))+');',
  'dialog.showOpenDialog=async(...args)=>({canceled:false,filePaths:[args.at(-1)?.properties?.includes("openDirectory")?'+JSON.stringify(workspace)+':'+JSON.stringify(transferFile)+']});',
  'dialog.showSaveDialog=async()=>({canceled:false,filePath:'+JSON.stringify(transferFile)+'});',
  'import('+JSON.stringify(pathToFileURL(join(desktop,'dist/src/main.js')).href)+');',
 ].join('\n'));
 await writeFile(join(temp,'package.json'),JSON.stringify({name:'omp-gui-acceptance',version:'0.1.7',main:'bootstrap.cjs'}));
 const env={...process.env,HOME:isolatedHome,USERPROFILE:isolatedHome,APPDATA:roaming,LOCALAPPDATA:local,PI_CONFIG_DIR:relative(isolatedHome,join(temp,'native-config')),XDG_CONFIG_HOME:join(temp,'xdg-config'),XDG_DATA_HOME:join(temp,'xdg-data'),XDG_CACHE_HOME:join(temp,'xdg-cache'),XDG_STATE_HOME:join(temp,'xdg-state'),OMP_ARTIFACT_DIR:join(root,'packages/runtime-installer/dist/artifacts',platform,runtime),OMP_RUNTIME_TRUSTED_PUBLIC_KEY:trustedPublicKey,OMP_RUNTIME_SIGNING_KEY_ID:signingKeyId,DO_NOT_TRACK:'1'};
 for(const key of ['ELECTRON_RUN_AS_NODE','OMP_SIGNING_SECRET','OMP_RUNTIME_SIGNING_KEY','OMP_RUNTIME_SIGNING_PRIVATE_KEY','GH_TOKEN','GITHUB_TOKEN','OMP_RENDERER_DEV_URL','PI_CODING_AGENT_DIR'])delete env[key];
 env.OMP_WORKTREE_DIR=join(temp,'worktrees');
 // Populate a disposable native transcript without making a model request.
 const seedSource=[
  'import {SessionManager} from '+JSON.stringify(pathToFileURL(join(root,'omp-patch/vendor/oh-my-pi/packages/coding-agent/src/session/session-manager.ts')).href)+';',
  'const m=SessionManager.create('+JSON.stringify(workspace)+',undefined,undefined,{harnessOrigin:"harness-host"});',
  'm.appendMessage({role:"user",content:"Private acceptance fixture 87419",timestamp:Date.now()});',
  'm.appendMessage({role:"assistant",content:[{type:"text",text:"Acceptance fixture reply"}],api:"openai-completions",provider:"test",model:"fixture",usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:Date.now()});',
  'await m.flush();await m.setSessionName("Session transfer acceptance","user");await m.flush();const id=m.getSessionId();await m.close();process.stdout.write(id);',
 ].join('\n');
 const transferSessionId=execFileSync(findBun(),['-e',seedSource],{cwd:join(root,'omp-patch/vendor/oh-my-pi'),env,encoding:'utf8',windowsHide:true}).trim();
 if(!/^[a-zA-Z0-9_-]+$/.test(transferSessionId))throw Error('Invalid acceptance session identity');
 const packaged=process.env.OMP_E2E_PACKAGED_EXE;
 if(packaged)delete env.OMP_ARTIFACT_DIR;
 console.log('Launching Electron for '+platform);
 app=await _electron.launch({executablePath:packaged??require('electron'),args:packaged?['--user-data-dir='+join(temp,'user-data')]:[temp],cwd:join(temp,'workspace'),env,timeout:60000});
 let loggedBytes=0;for(const stream of [app.process().stdout,app.process().stderr])stream?.on('data',chunk=>{loggedBytes+=chunk.length;if(loggedBytes<=2*1024*1024)void appendFile(join(output,'electron.log'),chunk).catch(()=>{});});
 page=await app.firstWindow({timeout:30000});page.setDefaultTimeout(20000);
 await page.setViewportSize({width:1024,height:684});
 report.viewport='1024x684, panels open';
 console.log('Electron window ready');
 if(packaged)await app.evaluate(({dialog},{workspace,transferFile})=>{
  dialog.showOpenDialog=async(...args)=>({canceled:false,filePaths:[args.at(-1)?.properties?.includes('openDirectory')?workspace:transferFile]});
  dialog.showSaveDialog=async()=>({canceled:false,filePath:transferFile});
 },{workspace,transferFile});
 await page.waitForFunction(()=>!!window.julingHarness);
 await page.evaluate(()=>{localStorage.setItem('omp.appSettings',JSON.stringify({language:'zh',startupPage:'last'}));localStorage.setItem('omp.previewMode','0');localStorage.setItem('omp.onboarding.completed','workbench-0.2.0');localStorage.setItem('omp.startupNotice.dismissed','incomplete-v1');localStorage.setItem('omp.lastRoute','home');});
 await page.reload();
 await page.getByRole('button',{name:/打开本地文件夹|Open local folder/i}).first().click();
 await until(()=>query('projects.list'),r=>r.workspaces.some(w=>w.active),'workspace');
 await command('session.create');
 const environment=await until(()=>query('environment.get'),r=>r.runtime.status==='connected','Runtime');
 if(environment.runtime.runtimeVersion!==runtime||environment.runtime.classification!=='managed')throw Error('Wrong Runtime');
 report.runtime=environment.runtime.runtimeVersion;
 console.log('Authenticated Runtime '+report.runtime);
 if(packaged){
  const terminal=await page.evaluate(()=>window.julingHarnessTerminal.create({cols:80,rows:24}));
  await page.evaluate(id=>window.julingHarnessTerminal.dispose(id),terminal.id);
  report.checks.push('packaged application and native PTY creation/disposal');
 }
 const session=await query('session.state');
 const invoke=(name,input={})=>command(name,{sessionId:session.sessionId,...input});
 if(process.env.OMP_E2E_WORKTREE_ONLY!=='1'){
 const caps=await query('capabilities.get');
 for(const id of ['ida.status','resource.read','session.queue.list','session.queue.ack','session.tier.get','session.skills.list','agent.btw.read'])if(!caps.capabilities.some(c=>c.id===id&&c.grade!=='unavailable'))throw Error('Missing '+id);
 report.checks.push('signed managed Runtime handshake and capability negotiation');
 for(const id of ['preferences.features.get','accounts.pool.options','models.compaction.preview','session.portability.prepare','maintenance.compression.scan','worktrees.session.create','mode.plan.review.details','composer.predictions'])if(!caps.capabilities.some(c=>c.id===id&&c.grade!=='unavailable'))throw Error('Missing new capability '+id);
 const featureSettings=(await invoke('preferences.features.get')).result;
 if(featureSettings.settings.find(row=>row.key==='composer.predictions')?.value!==false)throw Error('Message prediction must default to off');
 await invoke('preferences.features.set',{key:'retry.fallbackOn',value:'usage-limit',scope:'session'});
 await invoke('preferences.features.clearOverride',{key:'retry.fallbackOn'});
 await invoke('accounts.pool.options');await invoke('mode.plan.review.details');await invoke('maintenance.compression.scan');
 report.checks.push('new settings, opt-in prediction default, account inventory and non-mutating compression scan');
 const worktree=(await invoke('worktrees.session.create',{branch:'wt/gui-acceptance',keepChanges:false})).result;
 const removal=(await invoke('worktrees.session.remove.prepare',{id:worktree.worktree.id})).result;
 if(!(await invoke('worktrees.session.remove.apply',{token:removal.token})).result.removed)throw Error('Isolated worktree was not removed');
 report.checks.push('native worktree creation, desktop workspace registration, reviewed removal');
 const packed=(await invoke('session.portability.pack',{targetSessionId:transferSessionId})).result;
 const saved=await page.evaluate(artifactId=>window.julingHarnessChrome.exportArtifact({artifactId}),packed.asset.artifactId);
 if(!saved.ok||saved.cancelled)throw Error('Cannot export acceptance session archive');
 const picked=await page.evaluate(sessionId=>window.julingHarnessChrome.importArtifact({kind:'export',sessionId}),session.sessionId);
 if(!picked.ok||!picked.artifact)throw Error('Cannot select acceptance session archive');
 const importPreview=(await invoke('session.portability.prepare',{artifactId:picked.artifact.artifactId})).result;
 if(!importPreview.conflicts)throw Error('Archive collision was not detected');
 const imported=(await invoke('session.portability.import',{token:importPreview.token})).result;
 if(imported.mode!=='forked'||imported.sessionId===transferSessionId||!imported.workspaceId)throw Error('Import did not preserve the source as a separate session');
 const recovered=(await invoke('session.portability.status')).result;
 if(recovered.imported?.workspaceId!==imported.workspaceId)throw Error('Import result was not recoverable after refresh');
 await invoke('session.portability.anonymize',{targetSessionId:transferSessionId});
 report.checks.push('native archive export, private desktop transfer, collision-preserving import, recoverable result and anonymous export');
 for(const name of ['ida.status','session.queue.list','session.tier.get','session.skills.list']){const value=await invoke(name);if(name==='ida.status')report.ida=value;report.checks.push(name);}
 await invoke('resource.read',{uri:'omp://'});
 const prediction=await query('prediction.query',{sessionId:session.sessionId,version:1,before:'',prefix:'unsent-verification'});
 if(prediction.version!==1)throw Error('Prediction version mismatch');
 report.checks.push('resources and ephemeral prediction');
 const editor=page.locator('.composer-region [contenteditable="true"]').first();await editor.fill('unsent draft ');
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.imeSetComposition',{text:'中文输入',selectionStart:4,selectionEnd:4});
 await cdp.send('Input.insertText',{text:'中文输入'});
 if(!(await editor.innerText()).includes('中文输入'))throw Error('Composition lost');
 await editor.press('Escape');if((await query('session.state')).isStreaming)throw Error('Draft submitted');
 report.checks.push('Chromium IME composition and Escape; unsent draft did not submit');await capture('real-composer');
 for(const preview of [false,true])for(const route of ['statistics','capabilities','settings','model-config','agent-hub','history','diagnostics','evaluation']){
  console.log((preview?'Preview ':'Real ')+route);
  await page.evaluate(({preview,route})=>{localStorage.setItem('omp.previewMode',preview?'1':'0');localStorage.setItem('omp.lastRoute',route);},{preview,route});
  const routeUrl=new URL(page.url());routeUrl.search=preview?'?preview=1':'';
  await page.goto(routeUrl.href);await page.waitForFunction(()=>!!window.julingHarness);await page.waitForTimeout(800);
  if(route==='statistics')await page.locator('.stats-page').waitFor();
  if(route==='model-config'){
   await page.locator('#mcTabRoles').click();
   await page.getByRole('region',{name:/模型压缩阈值|Model compaction thresholds/}).scrollIntoViewIfNeeded();
   await capture((preview?'preview-':'real-')+'model-compaction');
   await page.locator('#mcTabSubagents').click();
   await page.locator('#mcPanelSubagents .sa-card-main').filter({has:page.getByText('reviewer',{exact:true})}).click();
   await page.getByRole('region',{name:/账号使用策略|Account rules/}).scrollIntoViewIfNeeded();
  }
  if(route==='settings'){
   await page.locator('#setTab-tasks').click();
   await page.getByRole('region',{name:/^会话 Worktree$|^Session worktrees$/}).scrollIntoViewIfNeeded();
  }
  if(route==='history'){
   await page.getByRole('tab',{name:/迁移与导出|Transfer & export/}).click();
   if(preview){await page.getByRole('button',{name:/选择 Juling 会话包|Choose a Juling archive/}).click();await page.getByRole('button',{name:/^确认导入$|^Confirm import$/}).waitFor();}
  }
  if(route==='diagnostics'){
   await page.getByRole('tab',{name:/会话与维护|Sessions and maintenance/}).click();
   await page.getByRole('region',{name:/会话存储压缩|Session storage compression/}).scrollIntoViewIfNeeded();
   if(preview){await page.getByRole('button',{name:/扫描候选文件|Scan candidates/}).click();await page.getByRole('button',{name:/压缩这些文件|Compress these files/}).waitFor();}
  }
  if(route==='evaluation')await page.locator('#evaluation-judgment').click();
  if(route==='capabilities'){
   await page.locator('#capTab-ida').click();
   await page.getByRole('heading',{name:/IDA/}).waitFor();
   if(preview){await page.getByRole('button',{name:/修改数据库|Edit database/}).click();await page.getByRole('combobox',{name:/IDA 操作|IDA action/}).click();await page.getByRole('option',{name:/保存数据库|Save database/}).click();await page.getByRole('button',{name:/^检查操作$|^Review operation$/}).click();await page.getByRole('dialog',{name:/确认 IDA 操作|Confirm IDA operation/}).waitFor();await page.getByRole('dialog',{name:/确认 IDA 操作|Confirm IDA operation/}).getByRole('button',{name:/^返回$|^Back$/}).click();}
  }
  await capture((preview?'preview-':'real-')+route);report.checks.push((preview?'preview':'real')+' '+route);
 }
 const previewUrl=new URL(page.url());previewUrl.search='?preview=1';await page.evaluate(()=>localStorage.setItem('omp.lastRoute','workbench'));await page.goto(previewUrl.href);
 await page.locator('#projectList .thread').filter({hasText:'Mermaid 全屏缩放计划与交互确认'}).first().click();
 const deck=page.getByRole('region',{name:'待处理的审批与提问（演示）'});
 await deck.getByRole('button',{name:'Approve and execute',exact:true}).click();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=','base64');
 await deck.locator('.ask-field input[type=file]').first().setInputFiles({name:'answer.png',mimeType:'image/png',buffer:png});
 const answerField=deck.getByRole('group',{name:'回答 / Answer',exact:true});await answerField.getByRole('button',{name:'预览图1',exact:true}).waitFor();
 await deck.getByRole('textbox',{name:'备注 / Note',exact:true}).fill('First question note');
 await page.waitForTimeout(450); // let the card swap animation settle before measuring
 const deckBox=await deck.boundingBox();const nextBox=await deck.getByRole('button',{name:'下一个请求',exact:true}).boundingBox();
 if(!deckBox||!nextBox||nextBox.x<deckBox.x-1||nextBox.x+nextBox.width>deckBox.x+deckBox.width+1||nextBox.y<deckBox.y-1)throw Error(`Ask navigation is outside the visible deck: ${JSON.stringify({deckBox,nextBox})}`);
 await deck.getByRole('button',{name:'下一个请求',exact:true}).click();
 await deck.locator('.dk-cell-out').waitFor({state:'detached'});
 await deck.getByRole('radio',{name:/默认开/}).click();
 await deck.getByRole('textbox',{name:'备注 / Note',exact:true}).fill('Second question note');
 await deck.locator('.ask-field input[type=file]').nth(1).setInputFiles({name:'note.png',mimeType:'image/png',buffer:png});
 await deck.getByRole('group',{name:'备注 / Note',exact:true}).getByRole('button',{name:'预览图1',exact:true}).waitFor();
 await deck.getByRole('button',{name:'上一个请求',exact:true}).click();
 await deck.locator('.dk-cell-out').waitFor({state:'detached'});
 await answerField.getByRole('button',{name:'预览图1',exact:true}).waitFor();
 if(await deck.getByRole('textbox',{name:'备注 / Note',exact:true}).textContent()!=='First question note')throw Error('Ask ownership mismatch');
 await answerField.getByRole('button',{name:'移除图1',exact:true}).click();
 await capture('preview-ask-images');report.checks.push('real Electron Ask image picker, per-question notes and attachments, navigation and removal');
 }
 // Exercise the real fresh-session policy without sending any prompt.
 await page.evaluate(()=>{localStorage.setItem('omp.previewMode','0');localStorage.setItem('omp.lastRoute','home');});
 const realUrl=new URL(page.url());realUrl.search='';await page.goto(realUrl.href);await page.waitForFunction(()=>!!window.julingHarness);
 const openFolder=page.getByRole('button',{name:/打开本地文件夹|Open local folder/i}).last();await openFolder.waitFor({timeout:60000});
 // Preview project selections are UI-only. Select the real fixture workspace again.
 await openFolder.click();
 await until(()=>query('projects.list'),value=>value.workspaces.some(row=>row.active&&row.name==='workspace'),'real workspace selection');
 const policySession=await query('session.state');
 await page.locator('.new-convo-btn').waitFor();
 await command('preferences.features.set',{sessionId:policySession.sessionId,key:'worktree.onStart',value:'ask',scope:'global'});
 report.worktreeStartPolicy=(await command('worktrees.session.startPolicy',{sessionId:policySession.sessionId})).result;
 console.log('Worktree start policy',JSON.stringify(report.worktreeStartPolicy));
 // MDI's ordinary New chat is a local draft; this command performs and selects a real fresh session.
 const knownResidents=new Set((await query('residents.list')).residents.map(row=>row.sessionId));
 await page.keyboard.press('Control+k');
 await page.locator('[data-cmdk-id="new-without-context"]').click();
 let worktreeDialog=page.getByRole('dialog',{name:/新会话工作区|New session workspace/});await worktreeDialog.waitFor({timeout:60000});
 const firstResident=await until(async()=>(await query('residents.list')).residents.find(row=>!knownResidents.has(row.sessionId)),value=>value!==undefined,'fresh worktree choice Resident',150000);
 await capture('real-worktree-start-choice');
 await worktreeDialog.getByRole('button',{name:/留在当前工作区|Stay in this workspace/}).click();await worktreeDialog.waitFor({state:'hidden'});
 knownResidents.add(firstResident.sessionId);
 await page.keyboard.press('Control+k');
 await page.locator('[data-cmdk-id="new-without-context"]').click();
 worktreeDialog=page.getByRole('dialog',{name:/新会话工作区|New session workspace/});await worktreeDialog.waitFor({timeout:60000});
 const secondResident=await until(async()=>(await query('residents.list')).residents.find(row=>!knownResidents.has(row.sessionId)),value=>value!==undefined,'second fresh worktree choice Resident',150000);
 await scopedCommand('preferences.features.set',{sessionId:secondResident.sessionId,key:'worktree.onExit',value:'remove',scope:'global'},{workspaceId:secondResident.workspaceId,sessionId:secondResident.sessionId});
 await worktreeDialog.getByRole('button',{name:/创建并进入|Create and open/}).click();await worktreeDialog.waitFor({state:'hidden',timeout:180000});
 const isolatedSession={sessionId:secondResident.sessionId};
 const ownWorktrees=(await command('worktrees.session.list',{sessionId:policySession.sessionId})).result;
 const owned=ownWorktrees.worktrees.find(row=>row.sessionId===isolatedSession.sessionId);
 if(!owned||!owned.branch.startsWith('wt/')||owned.dirty)throw Error('New worktree session is not an isolated clean checkout: '+JSON.stringify({isolatedSession,worktrees:ownWorktrees.worktrees}));
 const activeWorkspace=(await query('projects.list')).workspaces.find(row=>row.root===owned?.directory);
 if(!activeWorkspace)throw Error('Worktree workspace is not registered');
 await page.locator('.ctx-project-switch').filter({hasText:activeWorkspace.name}).waitFor();
 await page.locator('.ctx-git-switch').filter({hasText:owned.branch}).waitFor();
 report.checks.push('worktree project selection and branch display match the active Runtime workspace');
 // Workspace entry is lazy. Start its real Runtime without sending a prompt, then verify no recursive worktree gate.
 knownResidents.add(secondResident.sessionId);
 await page.keyboard.press('Control+k');
 await page.locator('[data-cmdk-id="new-without-context"]').click();
 await until(async()=>(await query('residents.list')).residents.find(row=>!knownResidents.has(row.sessionId)&&row.workspaceId===activeWorkspace.workspaceId),value=>value!==undefined,'Runtime resident inside worktree',150000);
 await worktreeDialog.waitFor({state:'hidden'});
 report.worktreeExitPath=owned.directory;
 await capture('real-worktree-session');
 report.checks.push('fresh-session worktree prompt, continue-here choice, create/open flow and recursion guard');
 if(process.env.OMP_E2E_WORKTREE_ONLY!=='1')report.imeScope='CDP composition integration; physical OS IME not manually tested';
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;if(page)await capture('failure').catch(()=>{});}
finally{
 if(app){let timer;const child=app.process();try{await Promise.race([app.close().catch(error=>{report.status='failed';report.cleanupError=String(error);process.exitCode=1;}),new Promise(resolve=>{timer=setTimeout(()=>{report.status='failed';report.cleanupError='Electron did not close within 10 seconds';process.exitCode=1;child.kill('SIGKILL');resolve();},10000);})]);}finally{clearTimeout(timer);}}
 if(report.status==='passed'&&report.worktreeExitPath){let remaining=true;for(let attempt=0;attempt<20&&remaining;attempt++){remaining=existsSync(report.worktreeExitPath);if(remaining)await new Promise(resolve=>setTimeout(resolve,250));}const realWorktree=existsSync(join(report.worktreeExitPath,'.git'));if(remaining&&realWorktree){report.status='failed';report.cleanupError='Native clean-worktree exit policy did not remove the isolated checkout';process.exitCode=1;}else report.checks.push(remaining?'native worktree cleanup skipped: filesystem block clone unavailable':'native clean-worktree exit cleanup');}
 if(report.status==='failed')report.predictionDiagnostics=await predictionDiagnostics(temp);
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
