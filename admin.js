import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C=window.EPISTEME_CONFIG||{};
const sb=createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
const app=document.querySelector("#app");
const logout=document.querySelector("#logoutBtn");
let me,profile,subjects=[],managers=[],queue=[],selectedId=null,canEditPositions=false,monthlyReport=null;

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const size=n=>{n=Number(n||0);if(!n)return"";if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;if(n<1073741824)return`${(n/1048576).toFixed(1)} MB`;return`${(n/1073741824).toFixed(2)} GB`};
const statusText={pending:"待审核",rereview:"重审",approved:"已通过",rejected:"已驳回"};
const state=x=>x.review_stage||x.status||"pending";
const subjectName=id=>subjects.find(s=>Number(s.id)===Number(id))?.name||"未分类";
const toast=msg=>{let t=document.querySelector("#toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.append(t)}t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)};

async function signed(path){const r=await sb.storage.from("episteme-library").createSignedUrl(path,3600);if(r.error)throw r.error;return r.data.signedUrl}
async function buildUrl(x){
 if(x.external_url)return x.external_url;
 if(x.storage_path)return signed(x.storage_path);
 if(x.file_path){const r=await sb.storage.from("episteme-resources").createSignedUrl(x.file_path,3600);if(r.error)throw r.error;return r.data.signedUrl}
 return null;
}
function readerHtml(x,url){
 const mime=(x.mime_type||x.resource_type||"").toLowerCase();
 if(mime.includes("image"))return`<img src="${url}" alt="${esc(x.name||x.title)}">`;
 if(mime.includes("video"))return`<video src="${url}" controls autoplay></video>`;
 if(mime.includes("audio"))return`<audio src="${url}" controls autoplay></audio>`;
 return`<iframe src="${url}" title="${esc(x.name||x.title)}"></iframe>`;
}
async function selectItem(id){
 selectedId=id;
 const x=queue.find(v=>v.id===id);const pane=document.querySelector("#readerPane");
 document.querySelectorAll(".review-item").forEach(el=>el.classList.toggle("active",el.dataset.id===id));
 if(!x){pane.innerHTML=`<div class="reader-empty"><b>选择一份资料</b><span>资料内容会显示在这里</span></div>`;return}
 pane.innerHTML=`<div class="reader-head"><div><b>${esc(x.name||x.title)}</b><small>${esc(subjectName(x.subject_id))} · ${esc(x.profiles?.username||"成员")}</small></div><span class="status ${state(x)}">${statusText[state(x)]||state(x)}</span></div><div class="reader-body"><div class="reader-loading">正在打开资料……</div></div>`;
 try{const url=await buildUrl(x);if(!url)throw Error("资料没有可阅读地址");pane.querySelector(".reader-body").innerHTML=readerHtml(x,url)}catch(e){pane.querySelector(".reader-body").innerHTML=`<div class="reader-empty"><b>暂时无法预览</b><span>${esc(e.message||"打开失败")}</span></div>`}
}

async function load(){
 const [s,m,l,r]=await Promise.all([
  sb.from("subjects").select("id,name,code").order("name"),
  sb.from("subject_managers").select("id,user_id,subject_id,position_title,profiles:profiles(username),subjects:subjects(name,code)").order("created_at"),
  sb.from("library_items").select("id,name,subject_id,storage_path,external_url,mime_type,file_size,status,review_stage,is_hidden,created_by,created_at,profiles:created_by(username)").in("item_type",["file","embed"]).order("created_at",{ascending:false}),
  sb.from("resources").select("id,title,description,subject_id,resource_type,file_path,external_url,uploader_id,status,is_hidden,file_size,mime_type,created_at,profiles:uploader_id(username)").order("created_at",{ascending:false})
 ]);
 [s,m,l,r].forEach(x=>{if(x.error)throw x.error});
 subjects=s.data||[];managers=m.data||[];
 const all=[...(l.data||[]).map(x=>({kind:"library",...x})),...(r.data||[]).map(x=>({kind:"resource",...x}))];
 queue=all.sort((a,b)=>{const rank={pending:0,rereview:1,approved:2,rejected:3};return(rank[state(a)]-rank[state(b)])||new Date(b.created_at)-new Date(a.created_at)});
 if(!profile||profile.role!=="coordinator"){
  const ids=new Set(managers.filter(x=>x.user_id===me.id).map(x=>Number(x.subject_id)));
  queue=queue.filter(x=>ids.has(Number(x.subject_id)));
 }
 if(profile?.role==="coordinator"){
  const mr=await sb.rpc("ensure_current_monthly_user_report");
  if(!mr.error)monthlyReport=mr.data;
 }
}

function stats(){
 const d=monthlyReport?.data||{};
 return `<section class="monthly"><div class="section-label">USER DATA · ${monthlyReport?.report_month?String(monthlyReport.report_month).slice(0,7):"—"}</div><div class="monthly-grid">
 <div><b>${d.users??0}</b><span>users</span></div><div><b>${d.questions??0}</b><span>questions</span></div><div><b>${d.answered??0}</b><span>answered</span></div><div><b>${d.resources??0}</b><span>resources</span></div><div><b>${d.subjects??subjects.length}</b><span>subjects</span></div><div><b>${d.answered_rate??0}%</b><span>questions answered</span></div>
 </div></section>`;
}
function reviewList(){
 return `<div class="review-list"><div class="list-head"><div><b>审核列表</b><span>${queue.length} 份资料</span></div></div>${queue.length?queue.map(x=>{
  const s=state(x),title=x.name||x.title,who=x.profiles?.username||"成员";
  return `<article class="review-item ${selectedId===x.id?"active":""}" data-id="${x.id}"><button class="item-main" data-select="${x.id}"><strong>${esc(title)}</strong><small>${esc(subjectName(x.subject_id))} · ${esc(who)}</small><em>${esc(x.mime_type||x.resource_type||"资料")}${x.file_size?` · ${size(x.file_size)}`:""}</em></button><div class="item-actions"><button data-action="approved" data-kind="${x.kind}" data-id="${x.id}">通过</button><button data-action="rejected" data-kind="${x.kind}" data-id="${x.id}">驳回</button><button data-action="rereview" data-kind="${x.kind}" data-id="${x.id}">重审</button><span class="status ${s}">${statusText[s]||s}</span></div></article>`;
 }).join(""):`<div class="empty-list">暂无审核资料</div>`}</div>`;
}
function auditView(){
 const current=queue.find(x=>x.id===selectedId);
 return `<div class="audit"><div class="audit-left">${reviewList()}</div><div class="audit-right" id="readerPane"><div class="reader-empty"><b>${current?esc(current.name||current.title):"选择一份资料"}</b><span>点击左侧资料即可在这里阅读</span></div></div></div>`;
}
function managerView(){
 return `<div class="manager-card"><div class="section-label">SUBJECT MANAGERS</div><div class="manager-head"><h2>学科负责人</h2><p>岗位名称可由指定管理人修改。</p></div>${managers.length?managers.map(m=>`<div class="manager-row"><div><b>${esc(m.profiles?.username||m.user_id)}</b><small>${esc(subjectName(m.subject_id))}</small></div><div class="position"><input data-position="${m.id}" value="${esc(m.position_title||subjectName(m.subject_id)+" 学科负责人")}"><button data-save="${m.id}">保存</button></div></div>`).join(""):`<div class="empty-list">暂无负责人记录</div>`}</div>`;
}
function render(){
 const editor=canEditPositions||profile?.role==="coordinator";
 app.innerHTML=`<div class="admin-top"><div><div class="eyebrow">EPISTEME · ADMIN</div><h1>管理后台</h1><p>资料审核、嵌入式阅读与学科负责人管理。</p></div><span class="role-pill">${profile?.role==="coordinator"?"Coordinator":"学科负责人"}</span></div>${profile?.role==="coordinator"?stats():""}<nav class="admin-tabs"><button class="active" data-tab="audit">资料审核</button>${editor?`<button data-tab="managers">学科负责人</button>`:""}</nav><div id="view">${auditView()}</div>`;
 bind();
}
function bind(){
 document.querySelectorAll("[data-select]").forEach(b=>b.onclick=()=>selectItem(b.dataset.select));
 document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>act(b.dataset.kind,b.dataset.id,b.dataset.action));
 document.querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>savePosition(b.dataset.save));
 document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelector("#view").innerHTML=b.dataset.tab==="managers"?managerView():auditView();bind();if(b.dataset.tab==="audit"&&selectedId)selectItem(selectedId)});
}
async function act(kind,id,status){
 try{
  let r;
  if(status==="rereview")r=kind==="library"?await sb.rpc("request_library_item_rereview",{p_item_id:id}):await sb.from("resources").update({status:"pending",is_hidden:true}).eq("id",id);
  else r=kind==="library"?await sb.rpc("review_library_item",{p_item_id:id,p_status:status}):await sb.from("resources").update({status,is_hidden:status!=="approved",approved_by:status==="approved"?me.id:null,approved_at:status==="approved"?new Date().toISOString():null,rejection_reason:status==="rejected"?"审核未通过":null}).eq("id",id);
  if(r.error)throw r.error;
  await load();
  if(!queue.some(x=>x.id===selectedId))selectedId=queue[0]?.id||null;
  render();
  if(selectedId)selectItem(selectedId);
  toast(status==="approved"?"已通过":status==="rejected"?"已驳回":"已放回审核队列");
 }catch(e){toast(e.message||"操作失败")}
}
async function savePosition(id){
 const input=document.querySelector(`[data-position="${id}"]`);const title=input?.value.trim();if(!title)return toast("请输入岗位名称");
 const r=await sb.rpc("update_subject_manager_position",{p_manager_id:id,p_position_title:title});
 if(r.error)return toast(r.error.message||"更新失败");
 const m=managers.find(x=>x.id===id);if(m)m.position_title=title;toast("岗位已更新");
}
async function boot(){
 try{
  if(!C.SUPABASE_URL||!C.SUPABASE_PUBLISHABLE_KEY)throw Error("网站配置没有加载。");
  const {data:{session}}=await sb.auth.getSession();if(!session){location.href="./#login";return}me=session.user;
  const p=await sb.from("profiles").select("id,username,role").eq("id",me.id).single();if(p.error)throw p.error;profile=p.data;
  const ce=await sb.rpc("can_edit_manager_positions");canEditPositions=!ce.error&&ce.data===true;
  if(profile.role!=="coordinator"&&profile.role!=="subject_manager"&&!canEditPositions){app.innerHTML=`<div class="admin-card"><h2>没有后台权限</h2><p>只有 Coordinator 和学科负责人可以进入这里。</p></div>`;return}
  await load();selectedId=queue[0]?.id||null;render();if(selectedId)selectItem(selectedId);
 }catch(e){app.innerHTML=`<div class="admin-card"><h2>后台加载失败</h2><p class="danger">${esc(e.message)}</p></div>`}
}
logout?.addEventListener("click",async()=>{await sb.auth.signOut();location.href="./#login"});
boot();
