import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import * as tus from "https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm";

const C=window.EPISTEME_CONFIG||{};
const sb=createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
const BUCKET='episteme-library';
const projectRef=(()=>{try{return new URL(C.SUPABASE_URL).hostname.split('.')[0]}catch{return ''}})();
const esc=s=>String(s??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]));
let open=false;

function style(){
  if(document.getElementById('epUploadEntryStyle'))return;
  const s=document.createElement('style');s.id='epUploadEntryStyle';s.textContent=`
  .ep-upload-entry{background:#435d4b!important;color:#fff!important;border-color:#435d4b!important}.ep-upload-entry:hover{background:#354d3d!important}.ep-upload-modal-note{padding:11px 13px;border-radius:11px;background:#f7f5ea;color:#687169;font-size:12px;line-height:1.55}.ep-upload-success{text-align:center;padding:28px 20px}.ep-upload-success b{display:block;font-size:18px;margin-bottom:7px}.ep-upload-progress{font-size:12px;color:#68736b;min-height:18px}
  `;document.head.appendChild(s);
}

async function session(){const {data:{session}}=await sb.auth.getSession();return session}
function subjectFromPage(){const el=document.querySelector('.lib-title h1');const text=el?.textContent?.trim();if(!text||text==='资源库')return null;return (window.__epLibraryUploadSubjects||[]).find(x=>x.name===text)||null}

async function loadSubjects(){
  const {data,error}=await sb.from('subjects').select('id,name,code').order('name');
  if(error)throw error;
  window.__epLibraryUploadSubjects=data||[];
  return data||[];
}

function modal(body){
  const r=document.createElement('div');r.className='lib-modal-back';r.innerHTML=`<div class="lib-modal small"><div class="lib-modal-head"><b>上传资料</b><button class="lib-close">×</button></div>${body}</div>`;
  r.querySelector('.lib-close').onclick=()=>{open=false;r.remove()};r.onclick=e=>{if(e.target===r){open=false;r.remove()}};document.body.appendChild(r);return r;
}

async function showUpload(){
  if(open)return;open=true;style();
  const s=await session();
  if(!s){open=false;location.hash='#login';return}
  let subjects=[];try{subjects=await loadSubjects()}catch(e){open=false;alert(e.message||'无法读取学科列表。');return}
  const pageSubject=subjectFromPage();
  const subjectOptions=subjects.map(x=>`<option value="${x.id}" ${pageSubject&&Number(pageSubject.id)===Number(x.id)?'selected':''}>${esc(x.name)}${x.code?' · '+esc(x.code):''}</option>`).join('');
  const root=modal(`<form class="lib-form" id="epUploadForm">
    <div class="ep-upload-modal-note">资料上传后会先进入审核队列。<b>这里不需要选择最终存放位置。</b>审核通过后，系统会自动将资料公开到对应学科的资料库。</div>
    <label>所属学科<select name="subject_id" required>${subjectOptions}</select></label>
    <label>资料名称<input name="name" placeholder="可留空，自动使用文件名"></label>
    <label>备注<textarea name="description" placeholder="可选"></textarea></label>
    <label>文件<input name="file" type="file" required></label>
    <div class="ep-upload-progress" id="epUploadProgress"></div>
    <button class="lib-btn primary" type="submit" id="epUploadSubmit">上传并提交审核</button>
  </form>`);
  root.querySelector('form').onsubmit=e=>submit(e,root);
}

function uploadTUS(file,path,onProgress){
  return new Promise(async(resolve,reject)=>{
    const s=await session();
    if(!projectRef||!s)return reject(new Error('登录状态无效，请重新登录。'));
    const u=new tus.Upload(file,{endpoint:`https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,retryDelays:[0,3000,5000,10000,20000],headers:{authorization:`Bearer ${s.access_token}`,apikey:C.SUPABASE_PUBLISHABLE_KEY},uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,chunkSize:6*1024*1024,metadata:{bucketName:BUCKET,objectName:path,contentType:file.type||'application/octet-stream',cacheControl:'31536000'},onError:reject,onProgress:(a,b)=>onProgress(Math.round(a/b*100)),onSuccess:resolve});
    try{const p=await u.findPreviousUploads();if(p.length)u.resumeFromPreviousUpload(p[0]);u.start()}catch(e){reject(e)}
  });
}

async function submit(e,root){
  e.preventDefault();
  const form=e.currentTarget,btn=root.querySelector('#epUploadSubmit'),progress=root.querySelector('#epUploadProgress');
  const fd=new FormData(form);const file=fd.get('file');const subjectId=Number(fd.get('subject_id'));const name=String(fd.get('name')||'').trim()||file?.name||'未命名资料';const description=String(fd.get('description')||'').trim()||null;
  if(!file||!file.size)return alert('请选择文件。');if(!subjectId)return alert('请选择所属学科。');
  btn.disabled=true;progress.textContent='正在创建审核记录……';
  let itemId=null,path=null;
  try{
    const s=await session();if(!s)throw new Error('登录状态已失效，请重新登录。');
    const {data:item,error:ie}=await sb.from('library_items').insert({subject_id:subjectId,parent_id:null,name,item_type:'file',provider:'supabase',description,mime_type:file.type||null,file_size:file.size,status:'pending',is_hidden:false,created_by:s.user.id}).select('id').single();
    if(ie)throw ie;itemId=item.id;
    const safe=file.name.replace(/[^a-zA-Z0-9._()\- ]/g,'_');path=`nodes/${item.id}/${safe}`;
    progress.textContent='正在上传文件…… 0%';
    await uploadTUS(file,path,p=>progress.textContent=`正在上传文件…… ${p}%`);
    const {error:ue}=await sb.from('library_items').update({storage_path:path,updated_at:new Date().toISOString()}).eq('id',item.id);
    if(ue)throw ue;
    root.querySelector('.lib-modal').innerHTML=`<div class="ep-upload-success"><b>上传成功</b><div class="muted">资料已经进入审核队列，审核通过后会自动公开到对应学科资料库。</div><div style="height:16px"></div><button class="lib-btn primary" id="epUploadDone">完成</button></div>`;
    root.querySelector('#epUploadDone').onclick=()=>{open=false;root.remove()};
  }catch(err){
    if(path)await sb.storage.from(BUCKET).remove([path]);
    if(itemId)await sb.from('library_items').delete().eq('id',itemId);
    progress.textContent='';alert(`上传失败：${err?.message||err}`);btn.disabled=false;
  }
}

function ensureEntry(){
  if(location.hash.slice(1)!=='/library')return;
  style();
  const title=document.querySelector('.lib-title');if(!title)return;
  if(document.getElementById('epLibraryUploadEntry'))return;
  const tools=title.querySelector('.lib-tools');
  const btn=document.createElement('button');btn.id='epLibraryUploadEntry';btn.className='lib-btn primary ep-upload-entry';btn.textContent='＋ 上传资料';btn.onclick=showUpload;
  if(tools)tools.appendChild(btn);else{const wrap=document.createElement('div');wrap.className='lib-tools';wrap.appendChild(btn);title.appendChild(wrap)}
}

const mo=new MutationObserver(()=>{clearTimeout(window.__epUploadEntryTimer);window.__epUploadEntryTimer=setTimeout(ensureEntry,80)});
mo.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(ensureEntry,200));
setTimeout(ensureEntry,500);
