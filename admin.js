import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C=window.EPISTEME_CONFIG||{};
const sb=createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
const app=document.querySelector("#app"), logout=document.querySelector("#logoutBtn");
let me,profile,subjects=[],managers=[],invites=[],items=[],resources=[],courses=[],lessons=[],tab="resources";
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const sub=id=>subjects.find(s=>Number(s.id)===Number(id));
const subName=id=>sub(id)?.name||"未分类";
const coord=()=>profile?.role==="coordinator";
const positionEditor=()=>["alice_lyx","feng03","llangvet"].includes(String(profile?.username||"").toLowerCase());
const managed=id=>coord()||managers.some(m=>m.user_id===me.id&&Number(m.subject_id)===Number(id));
const size=n=>{n=Number(n||0);if(!n)return"";if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;if(n<1073741824)return`${(n/1048576).toFixed(1)} MB`;return`${(n/1073741824).toFixed(2)} GB`};
const badge=s=>{s=s||"pending";return`<span class="ep-badge ${s}">${({pending:"待审核",rereview:"重审",approved:"已通过",rejected:"已拒绝"})[s]||s}</span>`};
const toast=m=>{let t=document.querySelector("#toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.append(t)}t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)};

function reader(title,url,type=""){
  if(!url){toast("暂时没有可阅读的文件");return}
  const box=document.createElement("div");box.className="ep-reader-back";box.innerHTML=`<div class="ep-reader"><div class="ep-reader-head"><div><b>${esc(title)}</b><small>嵌入式阅读器</small></div><button class="mini" id="closeReader">关闭</button></div><div class="ep-reader-body"></div></div>`;document.body.append(box);
  const body=box.querySelector(".ep-reader-body"), ext=type.split("/")[1]?.toLowerCase();
  if(type.includes("image"))body.innerHTML=`<img src="${url}" alt="">`;
  else if(type.includes("video"))body.innerHTML=`<video src="${url}" controls autoplay></video>`;
  else if(type.includes("audio"))body.innerHTML=`<audio src="${url}" controls autoplay></audio>`;
  else body.innerHTML=`<iframe src="${url}" title="${esc(title)}"></iframe>`;
  box.querySelector("#closeReader").onclick=()=>box.remove();box.onclick=e=>{if(e.target===box)box.remove()};
}
async function signed(bucket,path){const r=await sb.storage.from(bucket).createSignedUrl(path,3600);if(r.error)throw r.error;return r.data.signedUrl}
async function openItem(x){
  try{
    if(x.external_url) return reader(x.name||x.title,x.external_url,x.mime_type||"");
    if(x.storage_path){const u=await signed(x.kind==="library"?"episteme-library":"episteme-resources",x.storage_path);return reader(x.name||x.title,u,x.mime_type||"")}
    if(x.file_path){const u=await signed("episteme-resources",x.file_path);return reader(x.title,u,x.mime_type||"")}
    toast("这个资料没有可预览地址");
  }catch(e){toast(e.message||"打开失败")}
}
async function openLesson(l){
  try{let u=l.video_url||l.video_ref;if(l.video_provider==="bilibili"){let v=u.match(/(?:BV|av)([A-Za-z0-9]+)/i);u=v?`https://player.bilibili.com/player.html?bvid=${v[0]}`:u}else if(l.video_provider==="supabase"&&l.storage_path)u=await signed("episteme-courses",l.storage_path);reader(l.title,u,l.video_provider==="supabase"?"video/mp4":"text/html")}catch(e){toast(e.message||"打开失败")}
}

async function boot(){
 try{
  if(!C.SUPABASE_URL||!C.SUPABASE_PUBLISHABLE_KEY)throw Error("网站配置没有加载。");
  const {data:{session}}=await sb.auth.getSession();if(!session){location.href="./#login";return}me=session.user;
  const p=await sb.from("profiles").select("id,username,role").eq("id",me.id).single();if(p.error)throw p.error;profile=p.data;
  if(!coord()&&!positionEditor()&&profile.role!=="subject_manager"){app.innerHTML=denied();return}
  await load();render();
 }catch(e){app.innerHTML=`<div class="admin-card"><h2>后台加载失败</h2><p class="danger">${esc(e.message)}</p><a class="outline" href="./">返回网站</a></div>`}
}
async function load(){
 const q=[
  sb.from("subjects").select("id,name,code,description").order("name"),
  sb.from("subject_managers").select("id,user_id,subject_id,position_title,created_at,profiles(username),subjects(name,code)").order("created_at"),
  sb.from("library_items").select("id,name,subject_id,provider,storage_path,external_url,description,mime_type,file_size,status,review_stage,is_hidden,created_by,created_at,profiles:created_by(username),subjects(name,code)").in("item_type",["file","embed"]).order("created_at",{ascending:false}),
  sb.from("resources").select("id,title,description,subject_id,topic,resource_type,file_path,external_url,uploader_id,status,is_hidden,file_size,mime_type,created_at,profiles:uploader_id(username),subjects(name,code)").order("created_at",{ascending:false}),
  sb.from("courses").select("id,title,description,subject_id,teacher_id,course_type,status,is_hidden,profiles:teacher_id(username),subjects(name,code)").order("created_at",{ascending:false}),
  sb.from("course_lessons").select("id,course_id,title,video_url,video_provider,video_ref,storage_path,lesson_order,description,duration_seconds").order("lesson_order")
 ];
 if(coord()||positionEditor())q.push(sb.from("manager_invites").select("id,code,name,label,subject_id,active,role,created_at,subjects(name,code)").order("created_at",{ascending:false}));
 const out=await Promise.all(q);out.forEach(r=>{if(r.error)throw r.error});
 [subjects,managers,items,resources,courses,lessons]=out.slice(0,6).map(r=>r.data||[]);invites=out[6]?.data||[];
 if(profile.role==="subject_manager"&&!coord()&&!positionEditor()){const ids=new Set(managers.filter(m=>m.user_id===me.id).map(m=>Number(m.subject_id)));subjects=subjects.filter(s=>ids.has(Number(s.id)));items=items.filter(x=>ids.has(Number(x.subject_id))||x.created_by===me.id);resources=resources.filter(x=>ids.has(Number(x.subject_id))||x.uploader_id===me.id);courses=courses.filter(x=>ids.has(Number(x.subject_id)));}
}
function denied(){return`<div class="admin-card"><h2>没有后台权限</h2><p class="muted">只有 Coordinator 和学科负责人可以进入这里。</p><a class="outline" href="./">返回网站</a></div>`}
function render(){
 const tabs=coord()||positionEditor()?["resources","courses","managers","subjects"]:["resources","courses"];
 app.innerHTML=`<div class="admin-top"><div><div class="eyebrow">EPISTEME · ADMIN</div><h1>${coord()?"Coordinator 后台":"学科负责人后台"}</h1><p>资料审核、视频课和学科负责人管理。所有操作都会经过系统权限验证。</p></div><span class="role-pill">${coord()?"Coordinator":"学科负责人"}</span></div><div class="admin-tabs">${tabs.map(t=>`<button class="admin-tab ${tab===t?"active":""}" data-tab="${t}">${({resources:"资料审核",courses:"视频课",managers:"负责人",subjects:"学科"})[t]}</button>`).join("")}</div><div id="view"></div>`;
 renderTab();document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderTab()});
}
function renderTab(){const v=document.querySelector("#view");document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));v.innerHTML=({resources:resourceView,courses:courseView,managers:managerView,subjects:subjectView})[tab]();bind()}
function resourceView(){
 const all=[...items.map(x=>({kind:"library",...x})),...resources.map(x=>({kind:"resource",...x}))];
 return `<div class="stat-grid"><div class="stat"><small>待审核</small><b>${all.filter(x=>(x.review_stage||x.status)==="pending").length}</b></div><div class="stat"><small>重审</small><b>${all.filter(x=>(x.review_stage||x.status)==="rereview").length}</b></div><div class="stat"><small>已通过</small><b>${all.filter(x=>(x.review_stage||x.status)==="approved").length}</b></div></div><div class="admin-card"><div class="toolbar-admin"><h2>资料审核</h2><span class="muted">查看 → 审核 → 发布</span></div>${all.length?`<table class="admin-table"><thead><tr><th>资料</th><th>学科</th><th>上传者</th><th>状态</th><th>操作</th></tr></thead><tbody>${all.map(row).join("")}</tbody></table>`:`<div class="empty-admin">暂无资料</div>`}</div>`
}
function row(x){const state=x.review_stage||x.status||"pending",title=x.name||x.title,who=x.profiles?.username||"成员",subject=x.subjects?.name||subName(x.subject_id);return`<tr><td><b>${esc(title)}</b><br><small class="muted">${esc(x.mime_type||x.resource_type||"资料")}${x.file_size?` · ${size(x.file_size)}`:""}</small></td><td>${esc(subject)}</td><td>${esc(who)}</td><td>${badge(state)}</td><td><div class="ep-actions"><button class="mini" data-open data-kind="${x.kind}" data-id="${x.id}">查看</button>${state!=="approved"?`<button class="mini ok" data-status="approved" data-kind="${x.kind}" data-id="${x.id}">通过</button>`:""}${state!=="rejected"?`<button class="mini no" data-status="rejected" data-kind="${x.kind}" data-id="${x.id}">驳回</button>`:""}${state!=="pending"?`<button class="mini" data-rereview data-kind="${x.kind}" data-id="${x.id}">重审</button>`:""}<button class="mini danger" data-delete data-kind="${x.kind}" data-id="${x.id}">删除</button></div></td></tr>`}
async function review(kind,id,status){
 try{
  if(kind==="library") await sb.rpc("review_library_item",{p_item_id:id,p_status:status});
  else {const r=await sb.from("resources").update({status,is_hidden:status!=="approved",approved_at:status==="approved"?new Date().toISOString():null,approved_by:status==="approved"?me.id:null,rejection_reason:status==="rejected"?"审核未通过":null}).eq("id",id);if(r.error)throw r.error}
  await load();renderTab();toast(status==="approved"?"已通过": "已驳回");
 }catch(e){toast(e.message||"操作失败")}
}
async function rereview(kind,id){try{if(kind==="library")await sb.rpc("request_library_item_rereview",{p_item_id:id});else{const r=await sb.from("resources").update({status:"pending",is_hidden:true}).eq("id",id);if(r.error)throw r.error}await load();renderTab();toast("已放回审核队列")}catch(e){toast(e.message||"操作失败")}}
async function remove(kind,id){if(!confirm("确定删除这份资料吗？"))return;try{const r=await sb.from(kind==="library"?"library_items":"resources").delete().eq("id",id);if(r.error)throw r.error;await load();renderTab();toast("已删除")}catch(e){toast(e.message||"删除失败")}}
function courseView(){return`<div class="admin-grid"><div class="admin-card"><h2>视频课</h2>${courses.length?courses.map(c=>`<details class="ep-course-row"><summary><b>${esc(c.title)}</b> · ${esc(c.subjects?.name||subName(c.subject_id))}</summary><p class="muted">${esc(c.description||"")}</p>${lessons.filter(l=>l.course_id===c.id).map(l=>`<div class="ep-lesson"><span>${esc(l.title)}</span><span class="ep-actions"><button class="mini" data-lesson="${l.id}">查看</button><button class="mini danger" data-del-lesson="${l.id}">删除</button></span></div>`).join("")||`<div class="empty-admin">暂无 Lesson</div>`}</details>`).join(""):`<div class="empty-admin">暂无视频课</div>`}</div><div class="admin-card"><h2>新建</h2><form id="courseForm" class="form"><label>课程名称<input name="title" required></label><label>学科<select name="subject_id">${subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label><label>栏目<select name="course_type"><option value="textbook">课本内容</option><option value="ig">IG 题目讲解</option><option value="advanced">专题与进阶</option></select></label><label>简介<textarea name="description"></textarea></label><button class="primary">创建课程</button></form><hr><h2>添加 Lesson</h2><form id="lessonForm" class="form"><label>课程<select name="course_id">${courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join("")}</select></label><label>标题<input name="title" required></label><label>来源<select name="video_provider"><option value="bilibili">哔哩哔哩</option><option value="external">其他视频</option><option value="supabase">Episteme Storage</option></select></label><label>链接 / BV号<input name="video_ref" required></label><button class="primary">添加</button></form></div></div>`}
function managerView(){const canEdit=coord()||positionEditor();return`<div class="admin-card"><div class="toolbar-admin"><div><h2>学科负责人</h2><p class="muted">${canEdit?"可直接修改每个人的岗位名称。":"你只能管理自己负责的学科。"}</p></div></div>${managers.length?managers.map(m=>`<div class="manager-row"><div><b>${esc(m.profiles?.username||m.user_id)}</b><small>${esc(subName(m.subject_id))}</small></div><div class="manager-edit">${canEdit?`<input data-position="${m.id}" value="${esc(m.position_title||subName(m.subject_id)+" 学科负责人")}" title="岗位名称"><button class="mini ok" data-save-position="${m.id}">保存</button>`:`<span class="ep-badge">${esc(m.position_title||subName(m.subject_id)+" 学科负责人")}</span>`}</div></div>`).join(""):`<div class="empty-admin">暂无负责人</div>`}</div>${coord()?`<div class="admin-card"><h2>邀请码</h2><form id="inviteForm" class="form"><label>负责学科<select name="subject_id">${subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label><label>岗位名称<input name="name" placeholder="例如：Physics Lead"></label><button class="primary">生成邀请码</button></form>${invites.filter(i=>i.active).map(i=>`<div class="manager-row"><div><b>${esc(i.name||i.label||i.code)}</b><small>${esc(i.subjects?.name||"全局")}</small></div><code>${esc(i.code)}</code></div>`).join("")}</div>`:""}`}
function subjectView(){return`<div class="admin-card"><h2>学科</h2><div class="subject-list">${subjects.map(s=>{const ms=managers.filter(m=>Number(m.subject_id)===Number(s.id));return`<div class="subject-list-row"><span><b>${esc(s.name)}</b><small>${esc(s.code||"")}</small></span><span>${ms.length?ms.map(m=>esc(m.position_title||m.profiles?.username||"负责人")).join("、"):"暂无负责人"}</span></div>`}).join("")}</div></div>`}
function bind(){
 document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openItem([...items.map(x=>({kind:"library",...x})),...resources.map(x=>({kind:"resource",...x}))].find(x=>x.kind===b.dataset.kind&&x.id===b.dataset.id)));
 document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>review(b.dataset.kind,b.dataset.id,b.dataset.status));
 document.querySelectorAll("[data-rereview]").forEach(b=>b.onclick=()=>rereview(b.dataset.kind,b.dataset.id));
 document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>remove(b.dataset.kind,b.dataset.id));
 document.querySelectorAll("[data-lesson]").forEach(b=>b.onclick=()=>openLesson(lessons.find(l=>l.id===b.dataset.lesson)));
 document.querySelectorAll("[data-del-lesson]").forEach(b=>b.onclick=async()=>{if(!confirm("删除这个 Lesson？"))return;const r=await sb.from("course_lessons").delete().eq("id",b.dataset.delLesson);if(r.error)toast(r.error.message);else{await load();renderTab()}});
 document.querySelectorAll("[data-save-position]").forEach(b=>b.onclick=async()=>{const input=document.querySelector(`[data-position="${b.dataset.savePosition}"]`);const r=await sb.from("subject_managers").update({position_title:input.value.trim()||"学科负责人"}).eq("id",b.dataset.savePosition);if(r.error)toast(r.error.message);else toast("岗位名称已保存")});
 const cf=document.querySelector("#courseForm");if(cf)cf.onsubmit=async e=>{e.preventDefault();const f=new FormData(cf),r=await sb.from("courses").insert({title:f.get("title"),description:f.get("description"),subject_id:Number(f.get("subject_id")),teacher_id:me.id,course_type:f.get("course_type"),status:"published",is_hidden:false}).select().single();if(r.error)toast(r.error.message);else{await load();renderTab();toast("课程已创建")}};
 const lf=document.querySelector("#lessonForm");if(lf)lf.onsubmit=async e=>{e.preventDefault();const f=new FormData(lf),courseId=f.get("course_id"),order=lessons.filter(x=>x.course_id===courseId).length,r=await sb.from("course_lessons").insert({course_id:courseId,title:f.get("title"),video_provider:f.get("video_provider"),video_ref:f.get("video_ref"),video_url:f.get("video_ref"),lesson_order:order,description:""});if(r.error)toast(r.error.message);else{await load();renderTab();toast("Lesson 已添加")}};
 const inv=document.querySelector("#inviteForm");if(inv)inv.onsubmit=async e=>{e.preventDefault();const f=new FormData(inv),code=Math.random().toString(36).slice(2,10).toUpperCase(),name=f.get("name").trim()||`${subName(f.get("subject_id"))} 学科负责人`,r=await sb.from("manager_invites").insert({code,subject_id:Number(f.get("subject_id")),active:true,role:"subject_manager",name,label:name});if(r.error)toast(r.error.message);else{await load();renderTab();toast(`邀请码：${code}`)}};
}
logout.onclick=async()=>{await sb.auth.signOut();location.href="./"};
boot();