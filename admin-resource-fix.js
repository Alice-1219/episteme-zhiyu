import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C=window.EPISTEME_CONFIG||{};
const sb=createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

let running=false;
let lastSignature='';
let lastActive='';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function getIdentity(){
  const {data:{session},error:sessionError}=await sb.auth.getSession();
  if(sessionError||!session)return null;
  const {data:profile,error}=await sb.from('profiles').select('id,username,role').eq('id',session.user.id).maybeSingle();
  if(error){console.error('[admin-resource-fix] profile',error);return null;}
  return {session,profile};
}

function activeResourcesTab(){
  const tab=document.querySelector('.admin-tab.active');
  return !tab || tab.dataset.tab==='resources';
}

function setError(message,details=''){
  const view=document.querySelector('#view');
  if(!view||!activeResourcesTab())return;
  view.innerHTML=`<div class="admin-card" style="grid-column:1/-1"><h2>资料审核</h2><div class="section-note" style="background:#f7e9e9"><b>资料列表暂时读取失败</b><br>${esc(message)}${details?`<br><span class="muted">${esc(details)}</span>`:''}</div><button class="primary" id="resourceRetry">重新读取</button></div>`;
  document.querySelector('#resourceRetry')?.addEventListener('click',()=>render(true));
}

function statusText(s){return ({pending:'待审核',approved:'已通过',rejected:'已拒绝'})[s]||s||'待审核';}
function resourceType(s){return ({notes:'笔记',worksheet:'讲义',past_paper:'真题',slides:'Slides',other:'其他'})[s]||s||'资料';}
function fileSize(n){
  n=Number(n||0);if(!n)return '';
  const u=['B','KB','MB','GB'];let i=0;
  while(n>=1024&&i<3){n/=1024;i++;}
  return `${i===0?Math.round(n):n>=10?Math.round(n):n.toFixed(1)} ${u[i]}`;
}

async function loadData(identity){
  // Do NOT use PostgREST relationship expansion here. The old page depended on
  // resources -> profiles/subjects foreign-key relationships; if one relationship
  // is missing or stale, Supabase returns an error and the UI silently becomes 0.
  const resourceQuery=sb.from('resources').select('id,title,description,subject_id,topic,resource_type,status,file_path,external_url,uploader_id,file_size,mime_type,is_hidden,created_at,rejection_reason,approved_at,approved_by').order('created_at',{ascending:false});
  const subjectQuery=sb.from('subjects').select('id,name,code').order('name');
  const [{data:rs,error:re},{data:subs,error:se}]=await Promise.all([resourceQuery,subjectQuery]);
  if(re)throw new Error(`resources 查询失败：${re.message}`);
  if(se)throw new Error(`subjects 查询失败：${se.message}`);

  const rows=rs||[];
  const subjects=subs||[];
  const ids=[...new Set(rows.map(r=>r.uploader_id).filter(Boolean))];
  let users=[];
  if(ids.length){
    const q=await sb.from('profiles').select('id,username').in('id',ids);
    if(q.error)console.warn('[admin-resource-fix] uploader lookup',q.error);
    users=q.data||[];
  }

  let visible=rows;
  if(identity.profile.role==='subject_manager'){
    const q=await sb.from('subject_managers').select('subject_id').eq('user_id',identity.session.user.id);
    if(q.error)throw new Error(`负责学科查询失败：${q.error.message}`);
    const ids=new Set((q.data||[]).map(x=>Number(x.subject_id)));
    visible=rows.filter(r=>ids.has(Number(r.subject_id))||r.uploader_id===identity.session.user.id);
  }

  return {rows:visible,subjects,users};
}

function buildTable(rows,subjects,users){
  const sm=new Map(subjects.map(s=>[Number(s.id),s]));
  const um=new Map(users.map(u=>[u.id,u.username]));
  if(!rows.length)return '<div class="empty-admin">目前没有资料。<br><span class="muted">如果刚上传，请点击“刷新”。</span></div>';
  return `<div style="overflow:auto"><table class="admin-table"><thead><tr><th>资料</th><th>学科</th><th>上传者</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>${rows.map(r=>{
    const s=sm.get(Number(r.subject_id));
    const actions=[
      r.file_path||r.external_url?`<button class="mini" data-ar-view="${esc(r.id)}">查看</button>`:'',
      r.status!=='approved'?`<button class="mini ok" data-ar-approve="${esc(r.id)}">通过</button>`:'',
      r.status!=='rejected'?`<button class="mini no" data-ar-reject="${esc(r.id)}">拒绝</button>`:'',
      `<button class="mini danger" data-ar-delete="${esc(r.id)}">删除</button>`
    ].join('');
    return `<tr><td><b>${esc(r.title)}</b><br><span class="muted">${esc(resourceType(r.resource_type))}${r.file_size?` · ${fileSize(r.file_size)}`:''}</span>${r.topic?`<br><span class="muted">${esc(r.topic)}</span>`:''}</td><td>${esc(s?.name||'未分类')}${s?.code?`<br><span class="muted">${esc(s.code)}</span>`:''}</td><td>${esc(um.get(r.uploader_id)||'成员')}</td><td>${statusText(r.status)}${r.status==='rejected'&&r.rejection_reason?`<br><span class="muted">${esc(r.rejection_reason)}</span>`:''}</td><td>${r.created_at?new Date(r.created_at).toLocaleString('zh-CN'):''}</td><td><div class="admin-actions">${actions}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

async function render(force=false){
  if(running)return;
  const view=document.querySelector('#view');
  if(!view||!activeResourcesTab())return;
  const identity=await getIdentity();
  if(!identity?.profile||!['coordinator','subject_manager'].includes(identity.profile.role))return;

  running=true;
  try{
    const {rows,subjects,users}=await loadData(identity);
    const signature=rows.map(x=>`${x.id}:${x.status}:${x.updated_at||''}`).join('|');
    if(!force&&signature===lastSignature&&lastActive==='resources')return;
    lastSignature=signature;lastActive='resources';
    const pending=rows.filter(x=>x.status==='pending').length;
    const approved=rows.filter(x=>x.status==='approved').length;
    const rejected=rows.filter(x=>x.status==='rejected').length;
    view.innerHTML=`<div class="stat-grid"><div class="stat"><b>${rows.length}</b><span class="muted">可管理资料</span></div><div class="stat"><b>${pending}</b><span class="muted">待审核</span></div><div class="stat"><b>${approved}</b><span class="muted">已通过</span></div></div><div class="admin-card" style="grid-column:1/-1"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px"><div><h2 style="margin:0">资料审核</h2><div class="muted" style="margin-top:5px">${rejected?`已拒绝 ${rejected} 份 · `:''}共 ${rows.length} 份</div></div><button class="mini" id="resourceRefresh">刷新</button></div><div class="section-note">这里直接读取资料审核表，不依赖学科/上传者关联查询。Coordinator 可以管理全部资料。</div>${buildTable(rows,subjects,users)}</div>`;
    bind(rows);
  }catch(e){
    console.error('[admin-resource-fix]',e);
    setError(e.message||'未知错误','请点击“重新读取”；如果仍失败，页面会保留具体错误信息。');
  }finally{
    running=false;
  }
}

function bind(rows){
  document.querySelector('#resourceRefresh')?.addEventListener('click',()=>render(true));
  document.querySelectorAll('[data-ar-approve]').forEach(b=>b.onclick=()=>review(b.dataset.arApprove,'approved'));
  document.querySelectorAll('[data-ar-reject]').forEach(b=>b.onclick=()=>review(b.dataset.arReject,'rejected'));
  document.querySelectorAll('[data-ar-delete]').forEach(b=>b.onclick=()=>removeResource(b.dataset.arDelete));
  document.querySelectorAll('[data-ar-view]').forEach(b=>b.onclick=()=>viewResource(b.dataset.arView));
}

async function review(id,next){
  const r=rows.find(x=>x.id===id);
  let reason=null;
  if(next==='rejected'){
    reason=prompt('请输入拒绝原因（可选）：');
    if(reason===null)return;
    reason=reason.trim()||null;
  }
  const patch={status:next};
  if(next==='approved'){patch.approved_by=(await sb.auth.getUser()).data.user?.id||null;patch.approved_at=new Date().toISOString();patch.rejection_reason=null;}
  if(next==='rejected'){patch.rejection_reason=reason;patch.approved_by=null;patch.approved_at=null;}
  const {error}=await sb.from('resources').update(patch).eq('id',id);
  if(error){alert(`审核失败：${error.message}`);return;}
  lastSignature='';
  await render(true);
}

async function viewResource(id){
  const {data:r,error}=await sb.from('resources').select('title,description,file_path,external_url').eq('id',id).maybeSingle();
  if(error||!r){alert(`找不到这份资料${error?`：${error.message}`:''}`);return;}
  let url=r.external_url||'';
  if(r.file_path){
    const x=await sb.storage.from('episteme-resources').createSignedUrl(r.file_path,3600);
    if(x.error){alert(`无法打开资料：${x.error.message}`);return;}
    url=x.data?.signedUrl||'';
  }
  if(url)window.open(url,'_blank','noopener');
  else alert(`${r.title}\n\n${r.description||''}\n\n这份资料没有可访问文件。`);
}

async function removeResource(id){
  const {data:r,error:re}=await sb.from('resources').select('title,file_path').eq('id',id).maybeSingle();
  if(re||!r){alert(`找不到这份资料${re?`：${re.message}`:''}`);return;}
  if(!confirm(`确定删除“${r.title}”？`))return;
  if(r.file_path){
    const x=await sb.storage.from('episteme-resources').remove([r.file_path]);
    if(x.error){alert(`文件删除失败：${x.error.message}`);return;}
  }
  const {error}=await sb.from('resources').delete().eq('id',id);
  if(error){alert(`资料删除失败：${error.message}`);return;}
  lastSignature='';
  await render(true);
}

const observer=new MutationObserver(()=>{
  const active=document.querySelector('.admin-tab.active')?.dataset?.tab||'';
  if(active!==lastActive){lastActive=active;if(active==='resources')render(true);return;}
  if(active==='resources'&&!running){clearTimeout(window.__epResourceFixTimer);window.__epResourceFixTimer=setTimeout(()=>render(false),150);}
});
observer.observe(document.body,{childList:true,subtree:true});

(async()=>{
  for(let i=0;i<30;i++){
    if(document.querySelector('.admin-tab.active')?.dataset?.tab==='resources')break;
    await sleep(150);
  }
  await render(true);
})();
