import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const C=window.EPISTEME_CONFIG||{}, sb=C.SUPABASE_URL?createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY):null;
let user=null,profile=null,subjects=[];
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const toast=s=>{const x=$("#toast");x.textContent=s;x.className="toast show";setTimeout(()=>x.className="toast",2200)};
const close=()=>$("#modal").innerHTML="";
const sub=id=>(subjects.find(x=>x.id===id)||{}).name||"未分类";

async function boot(){
  if(sb){
    const q=await sb.auth.getSession(); user=q.data.session?.user||null;
    if(user){const p=await sb.from("profiles").select("*").eq("id",user.id).maybeSingle();profile=p.data}
    const s=await sb.from("subjects").select("*").order("name");subjects=s.data||[];
  }
  if(location.pathname.endsWith("admin.html"))return admin();
  if(location.pathname.endsWith("auth.html"))return authPage();
  render();
}
function render(){
  const r=location.hash.slice(1)||"/";
  if(r==="/")home();
  else if(r==="/community")community();
  else if(r==="/library")library();
  else if(r==="/courses")courses();
  else if(r==="/about")about();
  else if(r==="/auth")authPage();
  else if(r==="/admin")admin();
  else if(r.startsWith("/course/"))course(r.split("/")[2]);
  else home();
}
function home(){
  $("#app").innerHTML='<section class="landing"><div class="landing-hero"><div class="landing-inner"><div class="landing-brand"><img src="logo.png"><span>Episteme</span></div><div class="landing-copy"><p class="landing-slogan">TRUE KNOWLEDGE BELONGS TO NO ONE.</p><h1>Have you ever hidden a question because you thought it was stupid?<br><br>Have you ever struggled to understand your teacher\'s logic?<br><br>Have you ever felt like you needed help from someone who knows where you are?</h1><p class="landing-sub">So did we.</p><p class="landing-sub">And welcome to Episteme.</p><p class="landing-sub">A safe place where every question can be asked without fear.<br>A place where every student can find their own path to success.<br>A student community where you can help your peers — and help yourself — navigate the struggles of learning.</p><div class="landing-actions"><a class="primary landing-enter" href="#/community">Ask a question <span>→</span></a><a class="secondary" href="#/courses">Explore knowledge</a></div></div></div></div><div class="landing-bottom"><span>STUDENT-LED LEARNING COMMUNITY</span><span class="landing-scroll">SCROLL TO EXPLORE ↓</span></div></section>';
}
function pageHead(k,t,d){return '<div class="container page-title"><div class="eyebrow">'+k+'</div><h1>'+esc(t)+'</h1><p>'+esc(d)+'</p></div>'}
async function community(){
  $("#app").innerHTML=pageHead("COMMUNITY","讨论群","把不会的地方问出来，把有价值的解释留下来。")+'<section class="container content"><div class="panel"><div class="toolbar"><h2>Question Cards</h2><button id="ask" class="primary">＋ 提问</button></div><div id="questions"><div class="empty">正在加载……</div></div></div><div class="panel" style="margin-top:16px"><div class="toolbar"><h2>开放讨论</h2></div><div id="chat"><div class="empty">正在加载……</div></div></div></section>';
  if(!sb)return;
  const [q,m]=await Promise.all([sb.from("questions").select("*,profiles(username),subjects(name)").order("created_at",{ascending:false}),sb.from("messages").select("*,profiles(username)").eq("channel","general").order("created_at",{ascending:true}).limit(50)]);
  $("#questions").innerHTML=(q.data||[]).map(x=>'<article class="question"><div class="meta">'+esc(x.profiles?.username||"成员")+' · '+esc(x.subjects?.name||sub(x.subject_id))+'</div><h3>'+esc(x.title)+'</h3><p>'+esc(x.content)+'</p></article>').join("")||'<div class="empty">还没有问题。</div>';
  $("#chat").innerHTML=(m.data||[]).map(x=>'<div class="question"><b>'+esc(x.profiles?.username||"成员")+'</b><p>'+esc(x.content)+'</p></div>').join("")||'<div class="empty">还没有消息。</div>';
  $("#ask").onclick=ask;
}
function ask(){
  if(!user)return authPage();
  $("#modal").innerHTML='<div class="modal-back"><div class="modal-box"><div class="modal-head"><h3>提出一个问题</h3><button id="x">×</button></div><form id="f" class="form"><input name="title" required placeholder="问题标题"><select name="subject">'+subjects.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join("")+'</select><textarea name="content" required placeholder="把你卡住的地方写下来……"></textarea><button class="primary">发布</button></form></div></div>';
  $("#x").onclick=close;$("#f").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await sb.from("questions").insert({author_id:user.id,subject_id:f.get("subject"),title:f.get("title"),content:f.get("content"),status:"unanswered"});if(r.error)toast(r.error.message);else{close();toast("问题已发布");community()}}
}
async function library(){
  $("#app").innerHTML=pageHead("RESOURCE LIBRARY","资源库","资料经过审核后公开。文件本体可以继续放在外部存储，Episteme 只保存索引。")+'<section class="container content"><div class="toolbar"><input id="search" class="field" placeholder="搜索资源……"><button id="upload" class="primary">＋ 上传</button></div><div id="resources" class="cards"><div class="empty">正在加载……</div></div></section>';
  if(!sb)return;
  const r=await sb.from("resources").select("*,subjects(name)").order("created_at",{ascending:false});
  const draw=q=>{const d=(r.data||[]).filter(x=>(x.status==="approved"||x.uploader_id===user?.id)&&(!q||(x.title+" "+(x.description||"")+" "+sub(x.subject_id)).toLowerCase().includes(q.toLowerCase())));$("#resources").innerHTML=d.map(x=>'<article class="card resource"><div class="res-icon">R</div><div class="file-type">'+esc(x.resource_type)+' · '+esc(x.subjects?.name||sub(x.subject_id))+'</div><h3>'+esc(x.title)+'</h3><p>'+esc(x.description||"")+'</p><small>'+esc(x.status)+'</small><button class="resource-open" data-url="'+esc(x.external_url||"")+'">打开 →</button></article>').join("")||'<div class="empty">没有找到资源。</div>';$("#resources").querySelectorAll("[data-url]").forEach(b=>b.onclick=()=>b.dataset.url?window.open(b.dataset.url,"_blank","noopener,noreferrer"):toast("没有资源链接"))};
  draw("");$("#search").oninput=e=>draw(e.target.value);$("#upload").onclick=resourceForm;
}
function resourceForm(){
  if(!user)return authPage();
  $("#modal").innerHTML='<div class="modal-back"><div class="modal-box"><div class="modal-head"><h3>提交资源</h3><button id="x">×</button></div><form id="f" class="form"><input name="title" required placeholder="资源标题"><select name="subject">'+subjects.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join("")+'</select><select name="type"><option value="note">笔记</option><option value="paper">真题</option><option value="handout">讲义</option><option value="tool">工具</option></select><input name="url" type="url" required placeholder="百度网盘 / Notion / 其他资源链接"><textarea name="description" placeholder="资源说明"></textarea><button class="primary">提交审核</button></form></div></div>';
  $("#x").onclick=close;$("#f").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),r=await sb.from("resources").insert({title:f.get("title"),subject_id:f.get("subject"),resource_type:f.get("type"),external_url:f.get("url"),description:f.get("description"),uploader_id:user.id,status:"pending",file_path:null});if(r.error)toast(r.error.message);else{close();toast("已进入审核队列");library()}}
}
async function courses(){
  $("#app").innerHTML=pageHead("COURSES","录课","按学科观看课程，视频保留在 Bilibili 等外部平台。")+'<section class="container content"><div id="courses" class="cards"><div class="empty">正在加载……</div></div></section>';
  if(!sb)return;
  const r=await sb.from("courses").select("*,subjects(name)").eq("status","published").eq("is_hidden",false).order("created_at",{ascending:false});
  $("#courses").innerHTML=(r.data||[]).map(c=>'<article class="card" data-course="'+c.id+'"><div class="thumb sage">'+esc(c.subjects?.name||sub(c.subject_id))+'</div><div class="card-body"><h3>'+esc(c.title)+'</h3><p>'+esc(c.description||"")+'</p></div></article>').join("")||'<div class="empty">暂时没有公开课程。</div>';
  $("#courses").querySelectorAll("[data-course]").forEach(x=>x.onclick=()=>location.hash="/course/"+x.dataset.course)
}
async function course(id){
  const [c,l]=await Promise.all([sb.from("courses").select("*,subjects(name)").eq("id",id).maybeSingle(),sb.from("course_lessons").select("*").eq("course_id",id).order("lesson_order")]);
  const d=c.data,ls=l.data||[];if(!d)return home();
  $("#app").innerHTML=pageHead("COURSE",d.title,(d.subjects?.name||sub(d.subject_id)))+'<section class="container content"><div class="panel"><div id="player" class="player"></div><div class="course-info"><b>课程简介</b><p>'+esc(d.description||"暂无简介")+'</p></div><div class="list" style="margin-top:15px">'+ls.map(x=>'<div class="row"><b>'+esc(x.title)+'</b><button class="ghost" data-video="'+esc(x.video_url||"")+'">播放</button></div>').join("")+'</div></div></section>';
  $("#app").querySelectorAll("[data-video]").forEach(b=>b.onclick=()=>play(b.dataset.video));
}
function play(url){let m=String(url).match(/BV[0-9A-Za-z]+/i);let u=m?"https://player.bilibili.com/player.html?bvid="+m[0]+"&page=1":url;$("#player").innerHTML=u?'<iframe src="'+esc(u)+'" allowfullscreen></iframe>':'<div class="empty">没有视频链接。</div>'}
function about(){ $("#app").innerHTML=pageHead("ABOUT EPISTEME","关于知屿","True knowledge belongs to no one.")+'<section class="container content"><div class="about-grid"><div class="about-card"><h3>我们是谁</h3><p>一个由学生发起并主导的学习共同体，通过同伴授课、资源共享和答疑互助，让知识可以被长期保存。</p></div><div class="about-card"><h3>我们相信</h3><p>学习不只是得到答案，更是理解答案为什么成立，并把这种理解分享给下一位学习者。</p></div></div></section>'}
function authPage(){
  if(user){$("#modal").innerHTML='<div class="modal-back"><div class="modal-box"><div class="modal-head"><h3>我的账号</h3><button id="x">×</button></div><div class="account"><div class="avatar">'+esc((profile?.username||"U")[0])+'</div><h3>'+esc(profile?.username||"Member")+'</h3><p>'+esc(user.email||"")+'</p><p>角色：'+esc(profile?.role||"member")+'</p>'+(["coordinator","subject_manager"].includes(profile?.role)?'<a class="submit" href="admin.html" style="display:block">进入后台</a>':"")+'<button id="out" class="submit">退出登录</button></div></div></div>';$("#x").onclick=close;$("#out").onclick=async()=>{await sb.auth.signOut();user=null;profile=null;close();location.hash="/"};return}
  $("#app").innerHTML=pageHead("ACCOUNT","登录 / 注册","进入 Episteme 知屿。")+'<section class="container content"><div class="card" style="max-width:470px"><form id="authForm" class="form"><input name="username" placeholder="用户名（注册时填写）"><input name="email" type="email" required placeholder="邮箱"><input name="password" type="password" required placeholder="密码"><div class="actions-row"><button class="primary" id="login">登录</button><button class="secondary" id="signup">注册</button></div><div id="msg" class="meta"></div></form></div></section>';
  $("#login").onclick=async e=>{e.preventDefault();const f=new FormData($("#authForm"));const r=await sb.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});if(r.error)$("#msg").textContent=r.error.message;else{user=r.data.user;location.hash="/";boot()}};$("#signup").onclick=async e=>{e.preventDefault();const f=new FormData($("#authForm"));const r=await sb.auth.signUp({email:f.get("email"),password:f.get("password"),options:{emailRedirectTo:new URL("auth.html",location.href).href,data:{username:f.get("username")||f.get("email").split("@")[0],language:"en"}}});$("#msg").textContent=r.error?r.error.message:"注册成功，请检查邮箱。"}
}
async function admin(){
  if(!profile||!["coordinator","subject_manager"].includes(profile.role)){layoutAdmin("无权限");return}
  $("#app").innerHTML='<section class="container section"><div class="eyebrow">ADMIN CONSOLE</div><h2>管理后台</h2><div class="admin-tabs"><button class="ghost active" data-tab="review">资料审核</button><button class="ghost" data-tab="jobs">岗位管理</button><button class="ghost" data-tab="courses">课程</button></div><div class="admin-grid"><div id="left" class="admin-panel"></div><div id="right" class="admin-panel"><div class="reader-empty"><b>选择资料</b><span>审核时可以在这里预览。</span></div></div></div></section>';
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");b.dataset.tab==="review"?review():b.dataset.tab==="jobs"?jobs():courseAdmin()});review();
}
function layoutAdmin(t){$("#app").innerHTML='<section class="container section"><h2>'+esc(t)+'</h2><p>该页面只对学科负责人开放。</p></section>'}
async function review(){
  const r=await sb.from("library_items").select("*,subjects(name)").in("status",["pending","rereview"]).order("created_at");const d=r.data||[];
  $("#left").innerHTML='<div class="admin-head"><b>待审核</b><div class="meta">通过 / 重审 / 驳回</div></div>'+(d.length?d.map(x=>'<div class="admin-item" data-item="'+x.id+'"><strong>'+esc(x.name)+'</strong><small>'+esc(x.subjects?.name||"")+'</small><div class="admin-actions"><button class="ghost" data-r="'+x.id+'" data-s="approved">通过</button><button class="ghost" data-r="'+x.id+'" data-s="rereview">重审</button><button class="ghost danger" data-r="'+x.id+'" data-s="rejected">驳回</button></div></div>').join(""):'<div class="empty">没有待审核资料。</div>');
  document.querySelectorAll("[data-r]").forEach(b=>b.onclick=async e=>{e.stopPropagation();const r=await sb.rpc("review_library_item",{p_item_id:b.dataset.r,p_status:b.dataset.s});if(r.error)toast(r.error.message);else review()});
  d.forEach(x=>document.querySelector('[data-item="'+x.id+'"]')?.addEventListener("click",()=>{const u=x.external_url||x.storage_path;$("#right").innerHTML=u?'<div class="reader-head"><b>'+esc(x.name)+'</b></div><div class="reader-body"><iframe src="'+esc(u)+'"></iframe></div>':'<div class="reader-empty">没有可预览地址。</div>'}))
}
async function jobs(){
  if(profile.role!=="coordinator")return $("#left").innerHTML='<div class="empty">只有 coordinator 可以管理岗位。</div>';
  const r=await sb.from("manager_invites").select("*").eq("role","subject_manager").order("created_at"),d=r.data||[];
  $("#left").innerHTML='<div class="admin-head"><b>学科负责人岗位</b><div class="meta">负责人 + 邀请码 + 岗位名称</div></div>'+d.map(x=>'<div class="job"><div class="job-top"><h3>'+esc(x.name||"未领取")+'</h3><span class="badge">'+(x.active?"active":"inactive")+'</span></div><p>邀请码：'+esc(x.code)+'</p><input data-job="'+x.id+'" value="'+esc(x.label||"学科负责人")+'"><button class="ghost job-save" data-save="'+x.id+'">保存岗位名称</button></div>').join("");
  document.querySelectorAll("[data-save]").forEach(b=>b.onclick=async()=>{const i=document.querySelector('[data-job="'+b.dataset.save+'"]'),r=await sb.from("manager_invites").update({label:i.value}).eq("id",b.dataset.save);if(r.error)toast(r.error.message);else toast("岗位名称已更新")})
}
async function courseAdmin(){const r=await sb.from("courses").select("*,subjects(name)").order("created_at",{ascending:false});$("#left").innerHTML='<div class="admin-head"><b>课程</b></div>'+((r.data||[]).map(x=>'<div class="admin-item"><strong>'+esc(x.title)+'</strong><small>'+esc(x.subjects?.name||"")+' · '+esc(x.course_type)+' · '+esc(x.status)+'</small></div>').join("")||'<div class="empty">暂无课程。</div>')}
document.getElementById("authBtn")?.addEventListener("click",authPage);
document.getElementById("searchBtn")?.addEventListener("click",()=>toast("搜索入口下一步统一接入"));
document.getElementById("menuBtn")?.addEventListener("click",()=>document.getElementById("mobileNav").classList.toggle("open"));
window.addEventListener("hashchange",render);boot();
