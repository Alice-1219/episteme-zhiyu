import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C = window.EPISTEME_CONFIG || {};
const sb = createClient(C.SUPABASE_URL, C.SUPABASE_PUBLISHABLE_KEY);
const esc = s => String(s ?? "").replace(/[&<>\"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const size = n => { n=Number(n||0); if(!n)return ""; if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`; return `${(n/1073741824).toFixed(2)} GB`; };

let busy=false;
let selectedId=null;
let lastRenderKey="";

const resourcesTab=()=>document.querySelector('.admin-tab.active')?.dataset.tab==='resources';

function css(){
  if(document.getElementById('epReviewV2Style'))return;
  const s=document.createElement('style');s.id='epReviewV2Style';s.textContent=`
  .ep-review-shell{display:grid;gap:18px}.ep-review-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.ep-review-layout{display:grid;grid-template-columns:minmax(390px,.92fr) minmax(480px,1.08fr);gap:18px;align-items:start}.ep-review-panel{background:#fff;border:1px solid #e2e5df;border-radius:20px;box-shadow:0 8px 30px rgba(40,50,40,.05);overflow:hidden}.ep-review-panel-head{padding:18px 20px;border-bottom:1px solid #e9ece7;display:flex;justify-content:space-between;align-items:center;gap:12px}.ep-review-panel-head h2{margin:0;font-size:20px}.ep-review-panel-head small{color:#78817a}.ep-review-queue{max-height:700px;overflow:auto}.ep-review-item{padding:15px 17px;border-bottom:1px solid #edf0eb;cursor:pointer;transition:.12s}.ep-review-item:hover{background:#f8faf7}.ep-review-item.active{background:#eef4ec;box-shadow:inset 3px 0 0 #536b57}.ep-review-item-main{display:flex;gap:12px;align-items:flex-start}.ep-review-file-icon{width:42px;height:42px;flex:0 0 42px;border-radius:11px;background:#eaf0e6;color:#536a57;display:grid;place-items:center;font-size:10px;font-weight:800}.ep-review-item-title{font-weight:750;line-height:1.35;overflow-wrap:anywhere}.ep-review-item-meta{font-size:12px;color:#7a847c;margin-top:5px;line-height:1.5}.ep-review-actions{display:flex;gap:7px;margin-top:11px;flex-wrap:wrap}.ep-review-actions button{border:1px solid #d5dbd3;border-radius:8px;background:#fff;padding:7px 11px;cursor:pointer;font:inherit;font-size:12px}.ep-review-actions .approve{background:#e7efdf;border-color:#cbdac3;color:#3f5a42}.ep-review-actions .reject{background:#f5e8e8;border-color:#ead0d0;color:#934b4b}.ep-review-actions .rereview{background:#f5f1df;border-color:#e8ddbb;color:#776338}.ep-review-viewer{min-height:700px;display:flex;flex-direction:column}.ep-review-viewer-head{padding:18px 20px;border-bottom:1px solid #e9ece7}.ep-review-viewer-head b{font-size:17px}.ep-review-viewer-head p{margin:6px 0 0;color:#748078;font-size:12px;line-height:1.5}.ep-review-view{flex:1;min-height:610px;background:#f4f6f3;display:grid;place-items:center}.ep-review-view iframe{width:100%;height:610px;border:0;background:#fff}.ep-review-view img{max-width:100%;max-height:610px;object-fit:contain}.ep-review-view video{width:100%;max-height:610px;background:#111}.ep-review-view audio{width:min(720px,90%)}.ep-review-empty{padding:50px 24px;text-align:center;color:#7b847d}.ep-review-empty b{display:block;color:#556158;margin-bottom:7px}.ep-review-foot{padding:12px 16px;border-top:1px solid #e9ece7;display:flex;justify-content:space-between;align-items:center;gap:10px}.ep-review-open{border:1px solid #d5dbd3;border-radius:8px;background:#fff;padding:7px 11px;cursor:pointer}.ep-review-note{padding:12px 14px;border-radius:12px;background:#f7f5ea;color:#687169;font-size:13px;line-height:1.55}.ep-review-notified{font-size:11px;color:#7a6a43}
  @media(max-width:980px){.ep-review-layout{grid-template-columns:1fr}.ep-review-viewer{min-height:500px}.ep-review-view{min-height:430px}.ep-review-view iframe{height:430px}.ep-review-view img{max-height:430px}.ep-review-view video{max-height:430px}}
  @media(max-width:620px){.ep-review-stats{grid-template-columns:1fr}.ep-review-panel-head{align-items:flex-start;flex-direction:column}.ep-review-queue{max-height:none}}
  `;document.head.appendChild(s);
}

async function identity(){
  const {data:{session}}=await sb.auth.getSession();if(!session)return null;
  const {data:profile}=await sb.from('profiles').select('id,username,role').eq('id',session.user.id).maybeSingle();
  if(!profile||!['coordinator','subject_manager'].includes(profile.role))return null;
  return {session,profile};
}

async function loadPending(me){
  const [r,s,u]=await Promise.all([
    sb.from('library_items').select('id,name,description,subject_id,created_by,item_type,provider,storage_path,mime_type,file_size,status,is_hidden,created_at,updated_at').eq('item_type','file').eq('status','pending').order('created_at',{ascending:false}),
    sb.from('subjects').select('id,name,code').order('name'),
    sb.from('profiles').select('id,username')
  ]);
  if(r.error)throw r.error;if(s.error)throw s.error;if(u.error)throw u.error;
  let rows=r.data||[];
  if(me.profile.role==='subject_manager'){
    const {data:assign,error}=await sb.from('subject_managers').select('subject_id').eq('user_id',me.session.user.id);if(error)throw error;
    const allowed=new Set((assign||[]).map(x=>Number(x.subject_id)));
    rows=rows.filter(x=>allowed.has(Number(x.subject_id)));
  }
  const sm=new Map((s.data||[]).map(x=>[Number(x.id),x]));
  const um=new Map((u.data||[]).map(x=>[x.id,x.username]));
  return rows.map(x=>({...x,subject:sm.get(Number(x.subject_id)),uploader:um.get(x.created_by)||'成员'}));
}

function fileIcon(x){const m=x.mime_type||'';if(m.includes('pdf'))return 'PDF';if(m.startsWith('image/'))return 'IMG';if(m.startsWith('video/'))return '▶';if(m.startsWith('audio/'))return '♪';return 'DOC'}

function queueItem(x){
  return `<article class="ep-review-item ${x.id===selectedId?'active':''}" data-review-select="${esc(x.id)}">
    <div class="ep-review-item-main"><span class="ep-review-file-icon">${fileIcon(x)}</span><div style="min-width:0;flex:1"><div class="ep-review-item-title">${esc(x.name)}</div><div class="ep-review-item-meta">${esc(x.subject?.name||'未分类')} · ${esc(x.uploader)} · ${size(x.file_size)||'文件大小未知'}<br>${x.created_at?new Date(x.created_at).toLocaleString('zh-CN'):''}</div></div></div>
    <div class="ep-review-actions">
      <button class="approve" data-review-action="approved" data-id="${esc(x.id)}">通过</button>
      <button class="reject" data-review-action="rejected" data-id="${esc(x.id)}">驳回</button>
      <button class="rereview" data-review-action="rereview" data-id="${esc(x.id)}">重审</button>
    </div>
  </article>`;
}

async function signedUrl(item){
  if(!item?.storage_path)return null;
  const {data,error}=await sb.storage.from('episteme-library').createSignedUrl(item.storage_path,3600);
  if(error)throw error;return data?.signedUrl||null;
}

function viewer(item,url){
  if(!item)return `<div class="ep-review-empty"><b>选择一份待审核资料</b><span>左侧选择文件后，这里会直接显示文件内容。</span></div>`;
  const m=item.mime_type||'';
  if(!url)return `<div class="ep-review-empty"><b>无法预览</b><span>这份资料还没有可访问的文件地址。</span></div>`;
  if(m.startsWith('image/'))return `<img src="${esc(url)}" alt="">`;
  if(m.startsWith('video/'))return `<video src="${esc(url)}" controls playsinline></video>`;
  if(m.startsWith('audio/'))return `<audio src="${esc(url)}" controls></audio>`;
  return `<iframe src="${esc(url)}" title="资料预览"></iframe>`;
}

async function render(force=false){
  if(!resourcesTab())return;
  const host=document.querySelector('#view');if(!host)return;
  const me=await identity();if(!me)return;
  const rows=await loadPending(me);
  if(!rows.length)selectedId=null;
  else if(!selectedId||!rows.some(x=>x.id===selectedId))selectedId=rows[0].id;
  const selected=rows.find(x=>x.id===selectedId)||null;
  const key=rows.map(x=>`${x.id}:${x.updated_at||x.created_at}`).join('|')+`|${selectedId||''}`;
  if(!force&&key===lastRenderKey&&document.getElementById('epReviewShell'))return;
  lastRenderKey=key;
  let url=null;
  if(selected){try{url=await signedUrl(selected)}catch(e){console.error(e)}}
  const approved=await countApproved(me);
  css();
  host.innerHTML=`<div id="epReviewShell" class="ep-review-shell">
    <div class="ep-review-stats"><div class="stat"><b>${rows.length}</b><span class="muted">待审核</span></div><div class="stat"><b>${approved}</b><span class="muted">已通过</span></div><div class="stat"><b>${rows.length}</b><span class="muted">当前队列</span></div></div>
    <div class="ep-review-note">资料上传后不会直接进入公开资料库。审核人只需要在这里处理：<b>通过</b>＝立即公开；<b>驳回</b>＝删除文件与记录；<b>重审</b>＝资料继续留在队列，并通知该学科的所有 Subject Manager。</div>
    <div class="ep-review-layout">
      <section class="ep-review-panel"><div class="ep-review-panel-head"><div><h2>资料审核队列</h2><small>共 ${rows.length} 份待处理资料</small></div><button class="mini" id="reviewRefresh">刷新</button></div><div class="ep-review-queue">${rows.length?rows.map(queueItem).join(''):`<div class="ep-review-empty"><b>审核队列为空</b><span>新的资料会先进入这里，审核通过后才会公开。</span></div>`}</div></section>
      <section class="ep-review-panel ep-review-viewer"><div class="ep-review-viewer-head"><b>${esc(selected?.name||'文件预览')}</b><p>${selected?`${esc(selected.subject?.name||'未分类')} · 上传者 ${esc(selected.uploader)}`:'选择左侧文件后查看内容'}</p></div><div class="ep-review-view">${viewer(selected,url)}</div><div class="ep-review-foot"><span class="muted" style="font-size:12px">${selected?'审核前可直接检查文件内容。':'暂无选中的资料。'}</span>${url?`<button class="ep-review-open" id="reviewOpen">在新窗口打开</button>`:''}</div></section>
    </div>
  </div>`;
  bind(rows,selected,url);
}

async function countApproved(me){
  let q=sb.from('library_items').select('id',{count:'exact',head:true}).eq('item_type','file').eq('status','approved');
  if(me.profile.role==='subject_manager'){
    const {data:assign}=await sb.from('subject_managers').select('subject_id').eq('user_id',me.session.user.id);
    const ids=(assign||[]).map(x=>Number(x.subject_id));if(!ids.length)return 0;q=q.in('subject_id',ids);
  }
  const {count,error}=await q;if(error)console.warn(error);return count||0;
}

function bind(rows,selected,url){
  document.querySelector('#reviewRefresh')?.addEventListener('click',()=>render(true));
  document.querySelectorAll('[data-review-select]').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('[data-review-action]'))return;selectedId=el.dataset.reviewSelect;render(true)}));
  document.querySelectorAll('[data-review-action]').forEach(btn=>btn.addEventListener('click',async e=>{e.stopPropagation();await act(btn.dataset.id,btn.dataset.reviewAction)}));
  document.querySelector('#reviewOpen')?.addEventListener('click',()=>url&&window.open(url,'_blank','noopener,noreferrer'));
}

async function act(id,action){
  if(busy)return;busy=true;
  try{
    const {data:item,error:ie}=await sb.from('library_items').select('id,name,subject_id,storage_path,status').eq('id',id).maybeSingle();
    if(ie)throw ie;if(!item||item.status!=='pending')throw new Error('这份资料已经不在待审核状态。');
    if(action==='rereview'){
      const {data:count,error}=await sb.rpc('request_library_item_rereview',{p_item_id:id});
      if(error)throw error;
      alert(`已通知 ${count||0} 位该学科负责人，资料继续保留在审核队列。`);
    }else if(action==='approved'){
      const {data:{user}}=await sb.auth.getUser();
      const {error}=await sb.from('library_items').update({status:'approved',is_hidden:false,updated_at:new Date().toISOString()}).eq('id',id);
      if(error)throw error;
      selectedId=null;
    }else if(action==='rejected'){
      if(!confirm(`确定驳回并删除「${item.name}」？\n文件和审核记录都会删除。`))return;
      if(item.storage_path){const sr=await sb.storage.from('episteme-library').remove([item.storage_path]);if(sr.error)throw sr.error;}
      const {error}=await sb.from('library_items').delete().eq('id',id);if(error)throw error;
      selectedId=null;
    }
    lastRenderKey='';await render(true);
  }catch(e){console.error(e);alert(e?.message||'操作失败，请稍后重试。')}
  finally{busy=false}
}

let timer=null;
const mo=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(resourcesTab())render(false)},120)});
mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
document.addEventListener('click',e=>{if(e.target.closest('.admin-tab'))setTimeout(()=>{if(resourcesTab())render(true)},0)});
setTimeout(()=>render(true),500);
