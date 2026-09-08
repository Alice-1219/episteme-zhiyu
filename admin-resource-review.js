import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C = window.EPISTEME_CONFIG || {};
const sb = createClient(C.SUPABASE_URL, C.SUPABASE_PUBLISHABLE_KEY);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
let me = null;
let profile = null;
let subjects = [];
let users = [];
let rows = [];
let busy = false;

async function identity(){
  const {data:{session}} = await sb.auth.getSession();
  if(!session) return false;
  me = session.user;
  const {data,error} = await sb.from('profiles').select('id,role,username').eq('id',me.id).maybeSingle();
  if(error){console.error('[resource-review] profile',error);return false;}
  profile = data;
  return !!profile && ['coordinator','subject_manager'].includes(profile.role);
}

async function load(){
  if(!(await identity())) return;
  const [r,s,p] = await Promise.all([
    sb.from('resources').select('id,title,description,subject_id,topic,resource_type,file_path,external_url,uploader_id,status,rejection_reason,file_size,mime_type,created_at,approved_at,approved_by').order('created_at',{ascending:false}),
    sb.from('subjects').select('id,name,code').order('name'),
    sb.from('profiles').select('id,username')
  ]);
  if(r.error){
    console.error('[resource-review] resources',r.error);
    rows=[];
    showError(`资料列表读取失败：${r.error.message}`);
    return;
  }
  subjects=s.data||[];
  users=p.data||[];
  rows=r.data||[];
  if(profile.role==='subject_manager'){
    const {data:managed,error:e}=await sb.from('subject_managers').select('subject_id').eq('user_id',me.id);
    if(e){console.error('[resource-review] managers',e);showError(`负责学科读取失败：${e.message}`);return;}
    const ids=new Set((managed||[]).map(x=>Number(x.subject_id)));
    rows=rows.filter(x=>ids.has(Number(x.subject_id)) || x.uploader_id===me.id);
  }
  render();
}

function subjectName(id){return subjects.find(s=>Number(s.id)===Number(id))?.name || '未分类';}
function subjectCode(id){return subjects.find(s=>Number(s.id)===Number(id))?.code || '';}
function userName(id){return users.find(u=>u.id===id)?.username || '成员';}
function size(n){
  n=Number(n||0); if(!n)return '';
  const units=['B','KB','MB','GB']; let i=0;
  while(n>=1024&&i<units.length-1){n/=1024;i++;}
  return `${n>=10||i===0?Math.round(n):n.toFixed(1)} ${units[i]}`;
}
function status(s){return ({pending:'待审核',approved:'已通过',rejected:'已拒绝'})[s]||s||'待审核';}
function type(s){return ({notes:'笔记',worksheet:'讲义',past_paper:'真题',slides:'Slides',other:'其他'})[s]||s||'资料';}

function showError(msg){
  const v=document.querySelector('#view');
  if(v && document.querySelector('.admin-tab.active')?.dataset.tab==='resources'){
    v.innerHTML=`<div class="admin-card"><h2>资料审核</h2><div class="section-note" style="background:#f7e9e9">${esc(msg)}</div><button class="primary" id="resourceReviewRetry">重新读取</button></div>`;
    document.querySelector('#resourceReviewRetry')?.addEventListener('click',load);
  }
}

function render(){
  const v=document.querySelector('#view');
  if(!v || document.querySelector('.admin-tab.active')?.dataset.tab!=='resources') return;
  const pending=rows.filter(x=>x.status==='pending').length;
  const approved=rows.filter(x=>x.status==='approved').length;
  const rejected=rows.filter(x=>x.status==='rejected').length;
  v.innerHTML=`
    <div class="stat-grid">
      <div class="stat"><b>${rows.length}</b><span class="muted">可管理资料</span></div>
      <div class="stat"><b>${pending}</b><span class="muted">待审核</span></div>
      <div class="stat"><b>${approved}</b><span class="muted">已通过</span></div>
    </div>
    <div class="admin-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px">
        <div><h2 style="margin:0">资料审核</h2><div class="muted" style="margin-top:5px">${rejected ? `已拒绝 ${rejected} 份 · ` : ''}共 ${rows.length} 份</div></div>
        <button class="mini" id="resourceReviewRefresh">刷新</button>
      </div>
      <div class="section-note">成员上传的资料会先进入待审核。Coordinator 可以审核全部资料；Subject Manager 只看到自己负责的学科。</div>
      ${rows.length ? `<div style="overflow:auto"><table class="admin-table"><thead><tr><th>资料</th><th>学科</th><th>上传者</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>` : `<div class="empty-admin">目前没有资料。<br><span class="muted">如果刚上传，请点击右上角“刷新”。</span></div>`}
    </div>`;
  document.querySelector('#resourceReviewRefresh')?.addEventListener('click',load);
  document.querySelectorAll('[data-resource-review]').forEach(b=>b.addEventListener('click',()=>review(b.dataset.resourceReview)));
  document.querySelectorAll('[data-resource-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.resourceView)));
  document.querySelectorAll('[data-resource-delete]').forEach(b=>b.addEventListener('click',()=>remove(b.dataset.resourceDelete)));
}

function row(x){
  const actions = [
    `<button class="mini" data-resource-view="${esc(x.id)}">查看</button>`,
    x.status!=='approved' ? `<button class="mini ok" data-resource-review="${esc(x.id)}:approved">通过</button>` : '',
    x.status!=='rejected' ? `<button class="mini no" data-resource-review="${esc(x.id)}:rejected">拒绝</button>` : '',
    `<button class="mini danger" data-resource-delete="${esc(x.id)}">删除</button>`
  ].join('');
  return `<tr>
    <td><b>${esc(x.title)}</b><br><span class="muted">${esc(type(x.resource_type))}${x.file_size?` · ${size(x.file_size)}`:''}</span>${x.topic?`<br><span class="muted">${esc(x.topic)}</span>`:''}</td>
    <td>${esc(subjectName(x.subject_id))}${subjectCode(x.subject_id)?`<br><span class="muted">${esc(subjectCode(x.subject_id))}</span>`:''}</td>
    <td>${esc(userName(x.uploader_id))}</td>
    <td>${status(x.status)}${x.status==='rejected'&&x.rejection_reason?`<br><span class="muted">${esc(x.rejection_reason)}</span>`:''}</td>
    <td>${x.created_at?new Date(x.created_at).toLocaleString('zh-CN'):''}</td>
    <td><div class="admin-actions">${actions}</div></td>
  </tr>`;
}

async function review(spec){
  if(busy)return;
  const [id,next]=String(spec).split(':');
  const x=rows.find(r=>r.id===id); if(!x)return;
  let rejection_reason=x.rejection_reason||null;
  if(next==='rejected'){
    const reason=prompt('请输入拒绝原因（可选）：');
    if(reason===null)return;
    rejection_reason=reason.trim()||null;
  }
  busy=true;
  const patch={status:next};
  if(next==='approved'){patch.approved_by=me.id;patch.approved_at=new Date().toISOString();patch.rejection_reason=null;}
  if(next==='rejected'){patch.rejection_reason=rejection_reason;patch.approved_by=null;patch.approved_at=null;}
  const {error}=await sb.from('resources').update(patch).eq('id',id);
  busy=false;
  if(error){alert(`审核失败：${error.message}`);return;}
  await load();
}

async function view(id){
  const x=rows.find(r=>r.id===id);if(!x)return;
  let url=x.external_url||null;
  if(x.file_path){
    const r=await sb.storage.from('episteme-resources').createSignedUrl(x.file_path,3600);
    if(r.error){alert(`文件预览失败：${r.error.message}`);return;}
    url=r.data?.signedUrl||null;
  }
  if(url)window.open(url,'_blank','noopener');
  else alert(`${x.title}\n\n${x.description||''}\n\n这份资料没有可预览的文件链接。`);
}

async function remove(id){
  const x=rows.find(r=>r.id===id);if(!x)return;
  if(!confirm(`确定删除“${x.title}”？`))return;
  if(x.file_path){
    const r=await sb.storage.from('episteme-resources').remove([x.file_path]);
    if(r.error){alert(`文件删除失败：${r.error.message}`);return;}
  }
  const {error}=await sb.from('resources').delete().eq('id',id);
  if(error){alert(`资料删除失败：${error.message}`);return;}
  await load();
}

let lastTab='';
const observer=new MutationObserver(()=>{
  const active=document.querySelector('.admin-tab.active')?.dataset.tab||'';
  if(active==='resources' && active!==lastTab){lastTab=active;load();}
  if(active!=='resources')lastTab=active;
});

(async()=>{
  await new Promise(r=>setTimeout(r,300));
  observer.observe(document.body,{childList:true,subtree:true});
  const active=document.querySelector('.admin-tab.active')?.dataset.tab;
  if(active==='resources')await load();
})();
