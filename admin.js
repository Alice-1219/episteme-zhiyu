import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C=window.EPISTEME_CONFIG||{};
const sb=createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
const app=document.querySelector("#app"),logout=document.querySelector("#logoutBtn");
let me,profile,canEditPositions=false,subjects=[],managers=[],items=[],resources=[],tab="resources";

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const subject=id=>subjects.find(s=>Number(s.id)===Number(id));
const subjectName=id=>subject(id)?.name||"未分类";
const coordinator=()=>profile?.role==="coordinator";
const size=n=>{n=Number(n||0);if(!n)return"";if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;if(n<1073741824)return`${(n/1048576).toFixed(1)} MB`;return`${(n/1073741824).toFixed(2)} GB`};
const statusText={pending:"待审核",rereview:"重审",approved:"已通过",rejected:"已驳回"};
const badge=s=>`<span class="ep-badge ${s}">${statusText[s]||s}</span>`;
const toast=msg=>{let t=document.querySelector("#toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.append(t)}t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)};

function reader(title,url,type=""){
 if(!url)return toast("这个资料暂时没有可阅读地址");
 const box=document.createElement("div");box.className="ep-reader-back";box.innerHTML=`<div class="ep-reader"><div class="ep-reader-head"><div><b>${esc(title)}</b><small>嵌入式阅读器</small></div><button class="mini" id="closeReader">关闭</button></div><div class="ep-reader-body"></div></div>`;
 document.body.append(box);const body=box.querySelector(".ep-reader-body");
 if(type.includes("image"))body.innerHTML=`<img src="${url}" alt="">`;
 else if(type.includes("video"))body.innerHTML=`<video src="${url}" controls autoplay></video>`;
 else if(type.includes("audio"))body.innerHTML=`<audio src="${url}" controls autoplay></audio>`;
 else body.innerHTML=`<iframe src="${url}" title="${esc(title)}"></iframe>`;
 box.querySelector("#closeReader").onclick=()=>box.remove();box.onclick=e=>{if(e.target===box)box.remove()};
}
async function signed(bucket,path){const r=await sb.storage.from(bucket).createSignedUrl(path,3600);if(r.error)throw r.error;return r.data.signedUrl}
async function openItem(x){try{if(x.external_url)return reader(x.name||x.title,x.external_url,x.mime_type);if(x.storage_path){const u=await signed(x.provider==="notion"?"episteme-library":"episteme-library",x.storage_path);return reader(x.name,u,x.mime_type)}if(x.file_path){const u=await signed("episteme-resources",x.file_path);return reader(x.title,u,x.mime_type)}toast("这个资料暂时没有可阅读地址")}catch(e){toast(e.message||"打开失败")}}

async function boot(){
 try{
  if(!C.SUPABASE_URL||!C.SUPABASE_PUBLISHABLE_KEY)throw Error("网站配置没有加载。");
  const {data:{session}}=await sb.auth.getSession();if(!session){location.href="./#login";return}me=session.user;
  const p=await sb.from("profiles").select("id,username,role").eq("id",me.id).single();if(p.error)throw p.error;profile=p.data;
  const ce=await sb.rpc("can_edit_manager_positions");canEditPositions=!ce.error&&ce.data===true;
  if(!coordinator()&&!canEditPositions&&profile.role!=="subject_manager"){app.innerHTML=denied();return}
  await load();render();
 }catch(e){app.innerHTML=`<div class="admin-card"><h2>后台加载失败</h2><p class="danger">${esc(e.message)}</p><a class="outline" href="./">返回网站</a></div>`}
}

async function load(){
 const qs=[
  sb.from("subjects").select("id,name,code").order("name"),
  sb.from("subject_managers").select("id,user_id,subject_id,position_title,profiles:profiles(username),subjects:subjects(name,code)").order("created_at"),
  sb.from("library_items").select("id,name,subject_id,provider,storage_path,external_url,mime_type,file_size,status,review_stage,is_hidden,created_by,created_at,profiles:created_by(username),subjects:subject_id(name,code)").in("item_type",["file","embed"]).order("created_at",{ascending:false}),
  sb.from("resources").select("id,title,description,subject_id,resource_type,file_path,external_url,uploader_id,status,is_hidden,file_size,mime_type,created_at,profiles:uploader_id(username),subjects:subject_id(name,code)").order("created_at",{ascending:false})
 ];
 const out=await Promise.all(qs);out.forEach(r=>{if(r.error)throw r.error});
 [subjects,managers,items,resources]=out.map(r=>r.data||[]);
 if(!coordinator()&&!canEditPositions){const ids=new Set(managers.filter(m=>m.user_id===me.id).map(m=>Number(m.subject_id)));items=items.filter(x=>ids.has(Number(x.subject_id)));resources=resources.filter(x=>ids.has(Number(x.subject_id)));}
}
function denied(){return`<div class="admin-card"><h2>没有后台权限</h2><p class="muted">只有 Coordinator 和学科负责人可以进入这里。</p><a class="outline" href="./">返回网站</a></div>`}
function render(){
 const tabs=canEditPositions||coordinator()?["resources","managers"]:["resources"];
 app.innerHTML=`<div class="admin-top"><div><div class="eyebrow">EPISTEME · ADMIN</div><h1>${coordinator()?"Coordinator 后台":"学科负责人后台"}</h1><p>资料审核与学科负责人管理。所有操作都会经过系统权限验证。</p></div><span class="role-pill">${coordinator()?"Coordinator":"学科负责人"}</span></div><div class="admin-tabs">${tabs.map(t=>`<button class="admin-tab ${tab===t?"active":""}" data-tab="${t}">${t==="resources"?"资料审核":"负责人"}</button>`).join("")}</div><div id="view"></div>`;
 renderTab();document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderTab()});
}
function renderTab(){document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelector("#view").innerHTML=tab==="managers"?managerView():resourceView();bind()}
function resourceView(){
 const all=[...items.map(x=>({kind:"library",...x})),...resources.map(x=>({kind:"resource",...x}))];
 const counts=s=>all.filter(x=>(x.review_stage||x.status)==s).length;
 return `<div class="stat-grid"><div class="stat"><small>待审核</small><b>${counts("pending")}</b></div><div class="stat"><small>重审</small><b>${counts("rereview")}</b></div><div class="stat"><small>已通过</small><b>${counts("approved")}</b></div></div><div class="admin-card"><div class="toolbar-admin"><h2>资料审核</h2><span class="muted">查看 → 通过 / 驳回 → 重审</span></div>${all.length?`<table class="admin-table"><thead><tr><th>资料</th><th>学科</th><th>上传者</th><th>状态</th><th>操作</th></tr></thead><tbody>${all.map(row).join("")}</tbody></table>`:`<div class="empty-admin">暂无资料</div>`}</div>`;
}
function row(x){
 const state=x.review_stage||x.status||"pending",title=x.name||x.title,subject=x.subjects?.name||subjectName(x.subject_id),who=x.profiles?.username||"成员";
 return `<tr><td><b>${esc(title)}</b><br><small class="muted">${esc(x.mime_type||x.resource_type||"资料")}${x.file_size?` · ${size(x.file_size)}`:""}</small></td><td>${esc(subject)}</td><td>${esc(who)}</td><td>${badge(state)}</td><td><div class="ep-actions"><button class="mini" data-open data-kind="${x.kind}" data-id="${x.id}">查看</button>${state!=="approved"?`<button class="mini ok" data-status="approved" data-kind="${x.kind}" data-id="${x.id}">通过</button>`:""}${state!=="rejected"?`<button class="mini no" data-status="rejected" data-kind="${x.kind}" data-id="${x.id}">驳回</button>`:""}${state!=="pending"?`<button class="mini" data-rereview data-kind="${x.kind}" data-id="${x.id}">重审</button>`:""}</div></td></tr>`;
}
async function review(kind,id,status){
 try{
  let r;
  if(kind==="library")r=await sb.rpc("review_library_item",{p_item_id:id,p_status:status});
  else r=await sb.from("resources").update({status,is_hidden:status!=="approved",approved_by:status==="approved"?me.id:null,approved_at:status==="approved"?new Date().toISOString():null,rejection_reason:status==="rejected"?"审核未通过":null}).eq("id",id);
  if(r.error)throw r.error;await load();renderTab();toast(status==="approved"?"已通过":"已驳回");
 }catch(e){toast(e.message||"操作失败")}
}
async function rereview(kind,id){
 try{let r=kind==="library"?await sb.rpc("request_library_item_rereview",{p_item_id:id}):await sb.from("resources").update({status:"pending",is_hidden:true}).eq("id",id);if(r.error)throw r.error;await load();renderTab();toast("已放回审核队列")}catch(e){toast(e.message||"操作失败")}
}
function managerView(){
 return `<div class="admin-card"><div class="toolbar-admin"><div><h2>学科负责人</h2><p class="muted">岗位名称只能由指定的管理人修改。</p></div></div>${managers.length?managers.map(m=>`<div class="manager-row"><div><b>${esc(m.profiles?.username||m.user_id)}</b><small>${esc(subjectName(m.subject_id))}</small></div><div class="manager-edit">${canEditPositions?`<input data-position="${m.id}" value="${esc(m.position_title||subjectName(m.subject_id)+" 学科负责人")}" placeholder="岗位名称"><button class="mini ok" data-save-position="${m.id}">保存</button>`:`<span class="muted">${esc(m.position_title||subjectName(m.subject_id)+" 学科负责人")}</span>`}</div></div>`).join(""):`<div class="empty-admin">暂无学科负责人</div>`}</div>`;
}
async function savePosition(id){
 const input=document.querySelector(`[data-position="${id}"]`);const title=input?.value.trim();if(!title)return toast("请输入岗位名称");
 try{const r=await sb.rpc("update_subject_manager_position",{p_manager_id:id,p_position_title:title});if(r.error)throw r.error;const m=managers.find(x=>x.id===id);if(m)m.position_title=title;toast("岗位已更新")}catch(e){toast(e.message||"更新失败")}
}
function bind(){
 document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{const x=(b.dataset.kind==="library"?items:resources).find(x=>x.id===b.dataset.id);if(x)openItem({...x,kind:b.dataset.kind})});
 document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>review(b.dataset.kind,b.dataset.id,b.dataset.status));
 document.querySelectorAll("[data-rereview]").forEach(b=>b.onclick=()=>rereview(b.dataset.kind,b.dataset.id));
 document.querySelectorAll("[data-save-position]").forEach(b=>b.onclick=()=>savePosition(b.dataset.savePosition));
}
logout?.addEventListener("click",async()=>{await sb.auth.signOut();location.href="./#login"});
boot();
