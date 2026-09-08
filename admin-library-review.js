import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const C=window.EPISTEME_CONFIG||{};
const sb=createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
let busy=false;

async function sessionProfile(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return null;
  const {data:profile}=await sb.from('profiles').select('id,role').eq('id',session.user.id).maybeSingle();
  return profile?.role==='coordinator'?profile:null;
}

async function loadItems(){
  const {data,error}=await sb.from('library_items').select('id,name,item_type,status,is_hidden,storage_path,external_url,mime_type,file_size,created_at,subject_id,subjects(name,code),profiles:created_by(username)').in('item_type',['file','embed']).order('created_at',{ascending:false});
  if(error)throw error;
  return data||[];
}

function status(s){return ({pending:'待审核',approved:'已通过',rejected:'已拒绝'})[s]||s||'待审核'}
function size(n){n=Number(n||0);if(!n)return '';if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(2)+' GB'}
function card(items){
  const pending=items.filter(x=>x.status==='pending').length,approved=items.filter(x=>x.status==='approved').length,rejected=items.filter(x=>x.status==='rejected').length;
  return `<div id="libraryReviewCard" class="admin-card" style="margin-top:20px"><div style="display:flex;justify-content:space-between;align-items:end;gap:15px;flex-wrap:wrap"><div><h2 style="margin:0 0 7px">资源库审核</h2><p class="muted" style="margin:0">这里审核新版资源库中的文件与外部资料。文件上传后会先进入待审核，不会直接公开。</p></div><div class="muted" style="font-size:13px">共 ${items.length} · 待审核 ${pending} · 已通过 ${approved} · 已拒绝 ${rejected}</div></div><div style="height:16px"></div>${items.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>资料</th><th>学科</th><th>上传者</th><th>状态</th><th>操作</th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${esc(x.name)}</b><br><span class="muted">${esc(x.item_type==='embed'?'外部资料':'文件')}${x.file_size?' · '+size(x.file_size):''}</span></td><td>${esc(x.subjects?.name||'未分类')}</td><td>${esc(x.profiles?.username||'成员')}</td><td>${status(x.status)}</td><td><div class="admin-actions"><button class="mini" data-lr-view="${x.id}">查看</button>${x.status!=='approved'?`<button class="mini ok" data-lr-approve="${x.id}">通过</button>`:''}${x.status!=='rejected'?`<button class="mini no" data-lr-reject="${x.id}">拒绝</button>`:''}<button class="mini danger" data-lr-delete="${x.id}">删除</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-admin">资源库目前没有可审核的文件。文件夹不会进入审核队列。</div>'}</div>`;
}

async function signedUrl(item){
  if(item.external_url)return item.external_url;
  if(!item.storage_path)return null;
  const {data,error}=await sb.storage.from('episteme-library').createSignedUrl(item.storage_path,3600);
  if(error)throw error;
  return data?.signedUrl||null;
}

async function act(id,next){
  if(busy)return;busy=true;
  const items=await loadItems(),item=items.find(x=>x.id===id);
  if(!item){busy=false;return}
  let rejection_reason=null;
  if(next==='rejected')rejection_reason=prompt('请输入拒绝原因（可选）：')||null;
  const update={status:next};
  if(rejection_reason!==null)update.rejection_reason=rejection_reason;
  const {error}=await sb.from('library_items').update(update).eq('id',id);
  if(error)alert(error.message);else await render();
  busy=false;
}

async function removeItem(id){
  if(busy||!confirm('确定删除这份资料？'))return;busy=true;
  const items=await loadItems(),item=items.find(x=>x.id===id);
  if(!item){busy=false;return}
  if(item.storage_path)await sb.storage.from('episteme-library').remove([item.storage_path]);
  const {error}=await sb.from('library_items').delete().eq('id',id);
  if(error)alert(error.message);else await render();
  busy=false;
}

async function viewItem(id){
  try{
    const item=(await loadItems()).find(x=>x.id===id);if(!item)return;
    const url=await signedUrl(item);if(!url){alert('这份资料没有可预览内容。');return}
    const wrap=document.createElement('div');wrap.className='lib-modal-back';wrap.innerHTML=`<div class="lib-modal"><div class="lib-modal-head"><b>${esc(item.name)}</b><button class="lib-close">关闭</button></div><div class="lib-view" id="lrView"></div></div>`;document.body.appendChild(wrap);wrap.querySelector('.lib-close').onclick=()=>wrap.remove();const view=wrap.querySelector('#lrView');const m=item.mime_type||'';
    if(item.item_type==='embed'||m.includes('pdf'))view.innerHTML=`<iframe src="${esc(url)}"></iframe>`;else if(m.startsWith('image/'))view.innerHTML=`<img src="${esc(url)}">`;else if(m.startsWith('video/'))view.innerHTML=`<video src="${esc(url)}" controls></video>`;else if(m.startsWith('audio/'))view.innerHTML=`<audio src="${esc(url)}" controls></audio>`;else view.innerHTML=`<iframe src="${esc(url)}"></iframe>`;
  }catch(e){alert(e.message||'无法打开资料。')}
}

function bind(items){
  document.querySelectorAll('[data-lr-approve]').forEach(b=>b.onclick=()=>act(b.dataset.lrApprove,'approved'));
  document.querySelectorAll('[data-lr-reject]').forEach(b=>b.onclick=()=>act(b.dataset.lrReject,'rejected'));
  document.querySelectorAll('[data-lr-delete]').forEach(b=>b.onclick=()=>removeItem(b.dataset.lrDelete));
  document.querySelectorAll('[data-lr-view]').forEach(b=>b.onclick=()=>viewItem(b.dataset.lrView));
}

async function render(){
  const profile=await sessionProfile();if(!profile)return;
  const host=document.querySelector('#view');if(!host)return;
  const old=document.getElementById('libraryReviewCard');if(old)old.remove();
  if(document.querySelector('.admin-tab.active')?.dataset.tab!=='resources')return;
  try{const items=await loadItems();host.insertAdjacentHTML('afterend',card(items));bind(items)}catch(e){host.insertAdjacentHTML('afterend',`<div id="libraryReviewCard" class="admin-card" style="margin-top:20px"><h2>资源库审核</h2><p class="muted">加载资源库审核列表失败：${esc(e.message)}</p></div>`)}
}

let lastTab='';let ticking=false;
function watch(){if(ticking)return;ticking=true;setTimeout(async()=>{ticking=false;const tab=document.querySelector('.admin-tab.active')?.dataset.tab||'';if(tab!==lastTab){lastTab=tab;await render()}},120)}
const mo=new MutationObserver(watch);mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});setInterval(watch,1000);setTimeout(watch,600);
