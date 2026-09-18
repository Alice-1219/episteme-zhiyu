import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG=window.EPISTEME_CONFIG||{};
const configured=CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("PASTE_") && CFG.SUPABASE_PUBLISHABLE_KEY && !CFG.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
const supabase=configured?createClient(CFG.SUPABASE_URL,CFG.SUPABASE_PUBLISHABLE_KEY):null;

const state={user:null,profile:null,subjects:[],questions:[],answers:[],courses:[],lessons:[],resources:[],messages:[],query:""};

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const fmtDate=x=>new Date(x).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const route=()=>location.hash.slice(1)||"/";
function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("show");clearTimeout(window.tt);window.tt=setTimeout(()=>t.classList.remove("show"),2300)}
function modal(title,body){document.getElementById("modalRoot").innerHTML=`<div class="backdrop" id="backdrop"><div class="modal"><div class="modal-head"><h3>${title}</h3><button onclick="closeModal()">×</button></div>${body}</div></div>`}
window.closeModal=()=>document.getElementById("modalRoot").innerHTML="";
const subjectName=id=>state.subjects.find(s=>s.id===id)?.name||"未分类";
const subjectId=name=>state.subjects.find(s=>s.name===name)?.id||null;
const statusText={unanswered:"Unanswered",discussing:"Discussing",answered:"Answered",archived:"Archived"};

async function boot(){
 if(!supabase){render();return}
 const {data:{session}}=await supabase.auth.getSession();
 await setUser(session?.user||null);
 supabase.auth.onAuthStateChange(async(_e,s)=>{await setUser(s?.user||null);});
 render();
}

async function loadPageData(r){
 if(!supabase)return;
 // Load only the data required by the current page.
 if(r==="/community"){
   const [q,a,s]=await Promise.all([
     supabase.from("questions").select("*,profiles(username),subjects(name)").order("created_at",{ascending:false}),
     supabase.from("answers").select("*,profiles(username)").order("created_at",{ascending:true}),
     supabase.from("subjects").select("*").order("name")
   ]);
   state.questions=q.data||[]; state.answers=a.data||[]; state.subjects=s.data||[];
   return;
 }
 if(r==="/courses"){
   const [s,c]=await Promise.all([
     supabase.from("subjects").select("*").order("name"),
     supabase.from("courses").select("*,subjects(name),profiles(username)").order("created_at",{ascending:false})
   ]);
   state.subjects=s.data||[]; state.courses=c.data||[];
   // IMPORTANT: course_lessons are NOT loaded here.
   return;
 }
 if(r.startsWith("/course/")){
   const id=r.split("/")[2];
   const [c,l]=await Promise.all([
     supabase.from("courses").select("*,subjects(name),profiles(username)").eq("id",id).maybeSingle(),
     supabase.from("course_lessons").select("*").eq("course_id",id).order("lesson_order")
   ]);
   state.courses=state.courses.filter(x=>x.id!==id);
   if(c.data)state.courses.push(c.data);
   state.lessons=state.lessons.filter(x=>x.course_id!==id).concat(l.data||[]);
   return;
 }
 if(r==="/library"){
   const [s,res]=await Promise.all([
     supabase.from("subjects").select("*").order("name"),
     supabase.from("resources").select("*,subjects(name),profiles(username)").order("created_at",{ascending:false})
   ]);
   state.subjects=s.data||[]; state.resources=res.data||[];
   return;
 }
}

function subscribeRealtime(){
 if(!supabase)return;
 supabase.channel("episteme-live")
 .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
   if(payload.new.channel==="general"){
     state.messages.push(payload.new);
     if(route()==="/community")renderChat();
   }
 })
 .subscribe();
}

function navActive(){document.querySelectorAll("#nav a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#"+route()))}
function hero(k,t,d){return `<section class="page-hero"><div class="eyebrow">${k}</div><h1>${t}</h1><p>${d}</p></section>`}
function home(){return `<section class="hero container"><div><div class="eyebrow">STUDENT-LED LEARNING COMMUNITY</div><h1>一起学习，<br>互相帮助，<br>让知识<strong>留下来。</strong></h1><p>Episteme 知屿是一个由高中生发起并主导的线上学习共同体。通过同伴授课、资源共享、答疑互助与 AI 辅助，我们希望让每一届学生都能给下一届留下更多知识。</p><div class="actions"><button class="primary" onclick="location.hash='#/community'">进入讨论群 →</button><button class="secondary" onclick="location.hash='#/library'">浏览资源库</button></div></div><div class="hero-art"><div class="sun"></div><div class="m1"></div><div class="m2"></div><div class="water"></div><div class="hero-logo"><img src="assets/logo.png"><b>Episteme 知屿</b><span>TRUE KNOWLEDGE BELONGS TO NO ONE.</span></div></div></section>
<section class="loop"><div class="container"><div class="section-head"><div class="eyebrow">THE KNOWLEDGE LOOP</div><h2>Ask → Discuss → Understand → Preserve → Share</h2></div><div class="loop-grid">${[["01","Ask","提出真实遇到的问题。"],["02","Discuss","进入对应学科共同思考。"],["03","Understand","关注逻辑，而不只是答案。"],["04","Preserve","高价值问答整理为长期知识。"],["05","Share","让下一位学习者继续使用。"]].map(x=>`<div><i>${x[0]}</i><h3>${x[1]}</h3><p>${x[2]}</p></div>`).join("")}</div></div></section>
<section class="container spaces"><div class="section-head"><div class="eyebrow">EXPLORE</div><h2>知屿里的三个空间</h2></div><div class="space-grid"><a class="space sage" href="#/community"><small>COMMUNITY</small><h3>讨论群</h3><p>提问、回答、实时讨论，以及 Question Card。</p><span>进入讨论 →</span></a><a class="space blue" href="#/courses"><small>COURSES</small><h3>录课</h3><p>同伴授课，帮助理解概念、原理和知识之间的联系。</p><span>观看录课 →</span></a><a class="space lav" href="#/library"><small>LIBRARY</small><h3>资源库</h3><p>笔记、讲义、真题、工具和高价值知识长期保存。</p><span>浏览资源 →</span></a></div></section>
<section class="quote"><blockquote>“我们希望每一届学生离开时，都能给下一届留下比自己刚加入时更多的知识。”<cite>— EPISTEME 知屿</cite></blockquote></section>`}

function community(){
 if(!supabase)return setupNotice("COMMUNITY","讨论群","配置 Supabase 后，这里会自动变成真正的多人讨论区。");
 return hero("COMMUNITY","讨论群","Question Card + 实时讨论。高价值讨论可以进一步进入 Knowledge Base。")+`<section class="container content"><div class="community-grid"><aside class="panel"><div class="eyebrow">CHANNELS</div>${["全部","Mathematics","Physics","Chemistry","Biology","English","Economics","History","Geography","Theatre & Arts","Music"].map((s,i)=>`<button class="channel ${i===0?"active":""}" data-sub="${s}"># ${s}</button>`).join("")}</aside><div class="panel"><div class="toolbar"><div><div class="eyebrow">QUESTION CARDS</div><h2>${state.questions.length} 个问题</h2></div><button class="primary" onclick="ask()">＋ 提问</button></div><div class="filters">${["全部","unanswered","discussing","answered","archived"].map((s,i)=>`<button class="filter ${i===0?"active":""}" data-status="${s}">${i?statusText[s]:"全部"}</button>`).join("")}</div><div id="questions">${questionList()}</div></div></div><div class="panel chat-panel"><div class="toolbar"><div><div class="eyebrow">GENERAL CHAT</div><h2>开放讨论</h2></div>${state.user?`<span class="online">● 已登录</span>`:`<button class="secondary" onclick="auth()">登录后参与讨论</button>`}</div><div id="chat">${chatHtml()}</div>${state.user?`<form id="chatForm" class="chat-form"><input name="content" placeholder="说点什么……"><button class="primary">发送</button></form>`:`<div class="empty">登录后可以发送消息。</div>`}</div></section>`;
}
function questionList(sub="全部",st="全部",query=""){let list=state.questions.filter(q=>(sub==="全部"||subjectName(q.subject_id)===sub)&&(st==="全部"||q.status===st));if(query)list=list.filter(q=>(q.title+" "+q.content+" "+subjectName(q.subject_id)).toLowerCase().includes(query.toLowerCase()));return list.length?list.map(q=>`<article class="question" onclick="location.hash='#/question/${q.id}'"><div class="meta">${esc(q.profiles?.username||"成员")} · ${fmtDate(q.created_at)} <span class="badge">${esc(subjectName(q.subject_id))}</span><span class="status">${esc(statusText[q.status])}</span></div><h3>${esc(q.title)}</h3><p>${esc(q.content)}</p><div class="qfoot">${state.answers.filter(a=>a.question_id===q.id).length} 条回答 · 点击查看</div></article>`).join(""):`<div class="empty">没有找到符合条件的问题。</div>`}
function chatHtml(){return state.messages.length?state.messages.map(m=>`<div class="msg"><b>${esc(m.author_name||"成员")}</b><span>${fmtDate(m.created_at)}</span><p>${esc(m.content)}</p></div>`).join(""):`<div class="empty">还没有消息。登录后开始第一条讨论。</div>`}
function renderChat(){const el=document.getElementById("chat");if(el)el.innerHTML=chatHtml()}
async function loadChat(){if(!supabase||!state.user)return;const {data}=await supabase.from("messages").select("*,profiles(username)").eq("channel","general").order("created_at",{ascending:true}).limit(100);state.messages=(data||[]).map(m=>({...m,author_name:m.profiles?.username||"成员"}));renderChat()}
async function ask(){if(!state.user){auth();return}modal("提出一个问题",`<form class="form" id="askForm"><label>问题标题<input name="title" required placeholder="例如：为什么这道题答案是 C？"></label><label>学科<select name="subject">${state.subjects.map(s=>`<option value="${s.id}">${esc(s.name)} ${s.code?`· ${esc(s.code)}`:""}</option>`).join("")}</select></label><label>Topic<input name="topic" placeholder="例如：Trigonometry / Forces / Symbolism"></label><label>具体问题<textarea name="content" required placeholder="写下你的思路、卡住的地方，以及已经尝试过什么。"></textarea></label><p class="help">提交后会生成 Question Card。后续可以由 AI 做学科 / Topic 初步分类，再由学科负责人确认。</p><button class="submit">发布问题</button></form>`);document.getElementById("askForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await supabase.from("questions").insert({author_id:state.user.id,title:f.get("title"),content:f.get("content"),topic:f.get("topic"),subject_id:f.get("subject")});if(error)toast(error.message);else{closeModal();toast("Question Card 已创建");}}}
function questionDetail(id){const q=state.questions.find(x=>x.id===id);if(!q)return `<div class="empty">问题不存在。</div>`;const ans=state.answers.filter(a=>a.question_id===id);return hero("QUESTION CARD",q.title,`${subjectName(q.subject_id)} · ${statusText[q.status]} · ${fmtDate(q.created_at)}`)+`<section class="container content"><div class="panel detail"><a class="back" href="#/community">← 返回讨论</a><p class="detail-body">${esc(q.content)}</p><div class="divider"></div><h2>回答 · ${ans.length}</h2><div>${ans.length?ans.map(a=>`<div class="answer"><div class="meta">${esc(a.profiles?.username||"成员")} · ${fmtDate(a.created_at)} ${a.is_verified?`<span class="verified">✓ 已确认</span>`:""}</div><p>${esc(a.content)}</p></div>`).join(""):`<div class="empty">还没有回答，成为第一个帮助他人的人。</div>`}</div>${state.user?`<form id="answerForm" class="form"><textarea name="content" required placeholder="写下你的解释……"></textarea><button class="submit">提交回答</button></form>`:`<div class="admin-note">登录后可以回答问题。</div>`}</div></section>`}
function courses(){return hero("COURSES","录课","由学科负责人和成员提供课程，重点帮助学习者理解概念、原理和知识之间的逻辑。")+`<section class="container content"><div class="cards">${state.courses.length?state.courses.map(c=>`<article class="card" onclick="location.hash='#/course/${c.id}'"><div class="thumb ${c.subject_id%3===0?"lav":c.subject_id%2?"sage":"blue"}">${esc(c.title)}</div><div class="card-body"><span class="badge">${esc(subjectName(c.subject_id))}</span><h3>${esc(c.title)}</h3><p>${esc(c.description||"暂无简介")}</p><div class="card-meta">${esc(c.profiles?.username||"Episteme")}</div></div></article>`).join(""):`<div class="empty" style="grid-column:1/-1">暂时还没有公开课程。学科负责人登录后可以在后台添加。</div>`}</div></section>`}
function courseDetail(id){const c=state.courses.find(x=>x.id===id);if(!c)return `<div class="container content"><div class="empty">课程不存在。</div></div>`;const ls=state.lessons.filter(x=>x.course_id===id);return hero("COURSE",c.title,`${subjectName(c.subject_id)} · ${c.profiles?.username||"Episteme"}`)+`<section class="container content"><div class="panel"><a class="back" href="#/courses">← 返回课程</a><div class="viewer"><div><video id="player" class="video" controls ${ls[0]?.video_url?`src="${esc(ls[0].video_url)}"`:""}></video>${!ls[0]?.video_url?`<div class="video-empty">课程视频链接尚未添加</div>`:""}<div class="course-info"><b>课程简介</b><p>${esc(c.description||"暂无简介")}</p></div></div><div class="lessons"><div class="eyebrow">LESSONS</div>${ls.length?ls.map((l,i)=>`<button class="lesson ${i===0?"active":""}" onclick="playLesson('${l.id}',this)"><span>${String(i+1).padStart(2,"0")} · ${esc(l.title)}</span><small>${l.duration_seconds?Math.round(l.duration_seconds/60)+" min":"○"}</small></button>`).join(""):`<div class="empty">还没有章节。</div>`}</div></div></div></section>`}
window.playLesson=(id,btn)=>{const l=state.lessons.find(x=>x.id===id);document.querySelectorAll(".lesson").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const v=document.getElementById("player");if(l?.video_url){v.src=l.video_url;v.play().catch(()=>{})}else toast("这一章节还没有视频链接")}
function library(){return hero("RESOURCE LIBRARY","资源库","资源由社区共同建设，并经过对应学科负责人审核后进入正式共享资源库。")+`<section class="container content"><div class="toolbar"><div class="filters"><button class="filter active">全部</button><button class="filter">笔记</button><button class="filter">真题</button><button class="filter">讲义</button><button class="filter">工具</button></div><input class="searchbox" id="resSearch" placeholder="搜索资源……"></div><div class="cards" id="resources">${resourceList()}</div>${state.user&&["subject_manager","admin"].includes(state.profile?.role)?`<div style="margin-top:18px"><button class="primary" onclick="uploadResource()">＋ 上传资源</button></div>`:""}</section>`}
function resourceList(q=""){
 let list=state.resources.filter(r=>(r.status==="approved"||r.uploader_id===state.user?.id||["subject_manager","admin"].includes(state.profile?.role))&&(!q||(r.title+" "+(r.description||"")+" "+subjectName(r.subject_id)+" "+(r.topic||"")).toLowerCase().includes(q.toLowerCase())));
 return list.length?list.map(r=>`<article class="card resource">
 <div class="res-icon">${esc((r.resource_type||"FILE").slice(0,1).toUpperCase())}</div>
 <div class="file-type">${esc(r.resource_type)} · ${esc(subjectName(r.subject_id))}${r.topic?` · ${esc(r.topic)}`:""}</div>
 <h3>${esc(r.title)}</h3><p>${esc(r.description||"")}</p>
 <small>${r.status==="approved"?"✓ 已审核":r.status==="pending"?"等待审核":"未通过审核"}</small>
 ${r.external_url?`<div class="baidu-note">百度网盘资源${r.external_code?` · 提取码 ${esc(r.external_code)}`:""}</div>`:""}
 <button class="resource-open" onclick="openResource('${r.id}')">${r.external_url?"阅读 →":"资源未绑定"}</button>
 </article>`).join(""):`<div class="empty" style="grid-column:1/-1">没有找到相关资源。</div>`;
}
function openResource(id){
 const r=state.resources.find(x=>x.id===id);if(!r)return;
 const url=r.external_url;
 if(!url){toast("这个资源还没有绑定百度网盘链接");return}
 window.open(url,"_blank","noopener,noreferrer");
}
function uploadResource(){
 if(!state.user)return auth();
 modal("添加资源",`<form class="form" id="resForm">
 <label>标题<input name="title" required placeholder="例如：Chemical Equilibrium Notes"></label>
 <label>学科<select name="subject">${state.subjects.map(s=>`<option value="${s.id}">${esc(s.name)}${s.code?` · ${esc(s.code)}`:""}</option>`).join("")}</select></label>
 <label>Topic<input name="topic" placeholder="例如：Equilibrium / Forces / Algebra"></label>
 <label>类型<select name="type"><option value="note">笔记</option><option value="paper">真题</option><option value="handout">讲义</option><option value="tool">工具</option><option value="other">其他</option></select></label>
 <label>百度网盘分享链接<input name="url" type="url" required placeholder="粘贴百度网盘分享链接"></label>
 <label>提取码（如有）<input name="code" maxlength="20" placeholder="例如：a1b2"></label>
 <label>说明<textarea name="description" placeholder="简要说明这个资源适合谁、包含什么内容。"></textarea></label>
 <p class="help">文件本体不会上传到 Episteme。百度网盘负责存储和预览，Episteme 只保存资源信息与链接，因此页面更轻。</p>
 <button class="submit">提交审核</button></form>`);
 document.getElementById("resForm").onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);
  const url=String(f.get("url")||"").trim();
  if(!/^https?:\/\//i.test(url))return toast("请输入有效的百度网盘链接");
  const ins=await supabase.from("resources").insert({
   title:f.get("title"),description:f.get("description"),subject_id:f.get("subject"),
   topic:f.get("topic"),resource_type:f.get("type"),external_url:url,external_code:f.get("code")||null,
   file_path:null,uploader_id:state.user.id,status:"pending"
  });
  if(ins.error)toast(ins.error.message);else{closeModal();toast("资源已提交，等待审核");await loadAll();render()}
 }
}
function about(){return hero("ABOUT EPISTEME","关于知屿","True knowledge belongs to no one.")+`<section class="container content"><div class="about-grid"><article class="about-card"><h3>我们是谁</h3><p>Episteme 知屿是一个由高中生发起并主导的线上学习共同体。通过同伴授课、资源共享、答疑互助，并结合 AI 工具辅助学习，致力于打破信息壁垒、缩小教育资源差距。</p></article><article class="about-card"><h3>为什么需要知屿</h3><p>有效信息容易在群聊中被淹没，优质资源也难以整合共享。我们希望把一次性的帮助变成可以长期保存、跨年级传承的知识。</p></article><article class="about-card"><h3>Mission</h3><p>让更多学生能够获得可靠、可及的学习资源，并通过同伴互助共同成长。</p></article><article class="about-card"><h3>Vision</h3><p>建立一个可以不断积累知识、跨年级传承，并由学生自己持续维护的学习共同体。</p></article></div><div class="panel values-panel"><div class="eyebrow">CORE VALUES</div><h2>Share · Collaborate · Understand · Preserve</h2><div class="values">${[["Share","知识不应该因为拥有者不同而产生壁垒。"],["Collaborate","学习不应该只有竞争，也可以通过合作共同进步。"],["Understand","我们不仅关注答案，更关注问题背后的逻辑。"],["Preserve","有价值的讨论不应该随着聊天记录被刷掉。"]].map(x=>`<div><b>${x[0]}</b><p>${x[1]}</p></div>`).join("")}</div></div></section>`}
function setupNotice(k,t){return hero(k,t,"当前前端已经完成。只需在 config.js 填入 Supabase URL + Publishable Key，再运行 SQL，即可开启真正的动态功能。")+`<section class="container content"><div class="panel setup"><h2>还差最后一步配置</h2><ol><li>创建 Supabase 项目</li><li>在 SQL Editor 运行项目里的 <code>supabase/schema.sql</code></li><li>打开 <code>config.js</code>，填写 Project URL 和 Publishable Key</li><li>把整个文件夹上传 GitHub Pages</li></ol><p>不需要服务器，不需要 Node.js。GitHub Pages 继续负责网站，Supabase 负责数据库、登录、实时消息和资源存储。</p></div></section>`}
function auth(){modal(state.user?"我的账号":"登录 / 注册",state.user?`<div class="account"><div class="avatar">${esc((state.profile?.username||"U")[0].toUpperCase())}</div><h3>${esc(state.profile?.username||"Member")}</h3><p>${esc(state.user.email||"")}</p><p class="help">角色：${esc(state.profile?.role||"student")}</p><button class="submit" id="logout">退出登录</button></div>`:`<div class="auth-tabs"><button class="filter active" id="loginTab">登录</button><button class="filter" id="signupTab">注册</button></div><form class="form" id="authForm"><label>昵称<input name="username" placeholder="注册时填写"></label><label>邮箱<input type="email" name="email" required></label><label>密码<input type="password" name="password" minlength="6" required></label><p class="help">第一版使用 Supabase Auth。密码不会存进 Episteme 自己的数据库。</p><button class="submit">继续</button></form>`);if(state.user){document.getElementById("logout").onclick=async()=>{await supabase.auth.signOut();closeModal();toast("已退出");location.hash="#/"};return}let mode="login";document.getElementById("loginTab").onclick=()=>{mode="login";document.getElementById("signupTab").classList.remove("active");document.getElementById("loginTab").classList.add("active")};document.getElementById("signupTab").onclick=()=>{mode="signup";document.getElementById("loginTab").classList.remove("active");document.getElementById("signupTab").classList.add("active")};document.getElementById("authForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);let res;if(mode==="signup")res=await supabase.auth.signUp({email:f.get("email"),password:f.get("password"),options:{data:{username:f.get("username")||f.get("email").split("@")[0]}}});else res=await supabase.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});if(res.error)toast(res.error.message);else{closeModal();toast(mode==="signup"?"注册成功，请检查邮箱（如开启邮箱确认）":"登录成功")}}}
async function render(){
 navActive();
 const r=route();
 const main=document.getElementById("main");
 // Home/About are static: do not query the database just to render the first screen.
 if(!supabase){
   if(r==="/")main.innerHTML=home();
   else if(r==="/about")main.innerHTML=about();
   else main.innerHTML=setupNotice("SETUP","Episteme 知屿","配置 Supabase 后，这里会自动变成真正的动态功能。");
   bind();
   return;
 }
 // Render a lightweight shell first, then fetch only this route's data.
 if(r==="/")main.innerHTML=home();
 else if(r==="/about")main.innerHTML=about();
 else main.innerHTML='<section class="container content"><div class="panel"><div class="empty">正在加载……</div></div></section>';
 bind();
 await loadPageData(r);
 // Ignore stale results if the user navigated away while data was loading.
 if(route()!==r)return;
 if(r==="/community")main.innerHTML=community();
 else if(r.startsWith("/question/"))main.innerHTML=questionDetail(r.split("/")[2]);
 else if(r==="/courses")main.innerHTML=courses();
 else if(r.startsWith("/course/"))main.innerHTML=courseDetail(r.split("/")[2]);
 else if(r==="/library")main.innerHTML=library();
 else if(r==="/")main.innerHTML=home();
 else if(r==="/about")main.innerHTML=about();
 bind();
 if(r==="/community")await loadChat();
 if(r.startsWith("/question/"))bindAnswer(r.split("/")[2]);
}
function bind(){document.querySelectorAll(".channel").forEach(b=>b.onclick=()=>{document.querySelectorAll(".channel").forEach(x=>x.classList.remove("active"));b.classList.add("active");const st=document.querySelector(".filter.active")?.dataset.status||"全部";document.getElementById("questions").innerHTML=questionList(b.dataset.sub,st,state.query)});document.querySelectorAll(".filter[data-status]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".filter[data-status]").forEach(x=>x.classList.remove("active"));b.classList.add("active");const sub=document.querySelector(".channel.active")?.dataset.sub||"全部";document.getElementById("questions").innerHTML=questionList(sub,b.dataset.status,state.query)});const cf=document.getElementById("chatForm");if(cf)cf.onsubmit=async e=>{e.preventDefault();const content=new FormData(cf).get("content");if(!content?.trim())return;const {error}=await supabase.from("messages").insert({channel:"general",author_id:state.user.id,content:content.trim()});if(error)toast(error.message);else cf.reset()};const rs=document.getElementById("resSearch");if(rs)rs.oninput=e=>document.getElementById("resources").innerHTML=resourceList(e.target.value);const search=document.getElementById("globalSearch");if(search)search.oninput=globalSearch}
function bindAnswer(id){const f=document.getElementById("answerForm");if(f)f.onsubmit=async e=>{e.preventDefault();const content=new FormData(f).get("content");const {error}=await supabase.from("answers").insert({question_id:id,author_id:state.user.id,content});if(error)toast(error.message);else{await supabase.from("questions").update({status:"discussing"}).eq("id",id);f.reset();toast("回答已提交")}}}
function globalSearch(e){const q=e.target.value.trim().toLowerCase();const box=document.getElementById("searchResults");if(!q){box.innerHTML="";return}const arr=[...state.questions.map(x=>({t:x.title,k:"Question Card",h:"#/question/"+x.id})),...state.courses.map(x=>({t:x.title,k:"Course",h:"#/course/"+x.id})),...state.resources.map(x=>({t:x.title,k:"Resource",h:"#/library"}))].filter(x=>x.t.toLowerCase().includes(q)).slice(0,10);box.innerHTML=arr.length?arr.map(x=>`<a href="${x.h}"><b>${esc(x.t)}</b><small>${x.k}</small></a>`).join(""):`<div class="empty">没有找到结果。</div>`}
document.getElementById("authBtn").onclick=auth;
document.getElementById("searchBtn").onclick=()=>document.getElementById("searchPanel").classList.add("open");
document.getElementById("closeSearch").onclick=()=>document.getElementById("searchPanel").classList.remove("open");
document.getElementById("menuBtn").onclick=()=>document.getElementById("mobileNav").classList.toggle("open");
document.querySelectorAll("#mobileNav a").forEach(a=>a.onclick=()=>document.getElementById("mobileNav").classList.remove("open"));
window.addEventListener("hashchange",render);
boot();

// ===== Bilibili external embed =====
function bilibiliEmbedUrl(raw){
  try{
    const u=new URL(String(raw).trim());
    const text=u.pathname+" "+u.search+" "+u.hash;
    const bv=text.match(/BV[0-9A-Za-z]+/i)?.[0];
    if(bv)return "https://player.bilibili.com/player.html?bvid="+encodeURIComponent(bv)+"&page=1&high_quality=1&danmaku=0";
    const av=text.match(/(?:av|AV)(\\d+)/)?.[1];
    if(av)return "https://player.bilibili.com/player.html?aid="+encodeURIComponent(av)+"&page=1&high_quality=1&danmaku=0";
    return null;
  }catch{return null}
}
function isBilibiliUrl(raw){
  try{const u=new URL(String(raw).trim());return /(^|\\.)bilibili\\.com$/i.test(u.hostname)||/(^|\\.)b23\\.tv$/i.test(u.hostname)}catch{return false}
}
function lessonPlayerHtml(l){
  if(l?.video_url&&isBilibiliUrl(l.video_url)){
    const src=bilibiliEmbedUrl(l.video_url);
    if(src)return '<iframe id="biliPlayer" class="bili-player" src="'+src+'" title="'+esc(l.title||"Bilibili video")+'" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  }
  return '<video id="player" class="video" controls '+(l?.video_url?'src="'+esc(l.video_url)+'"':'')+'></video>'+(l?.video_url?'':'<div class="video-empty">课程视频链接尚未添加</div>');
}
function courseDetail(id){
  const c=state.courses.find(x=>x.id===id);
  if(!c)return '<div class="container content"><div class="empty">课程不存在。</div></div>';
  const ls=state.lessons.filter(x=>x.course_id===id);
  const canEdit=["subject_manager","admin","coordinator"].includes(state.profile?.role);
  const first=ls[0];
  const edit=canEdit?'<div class="video-source-actions"><button class="secondary" onclick="addBilibiliVideo(\''+c.id+'\',\''+(first?.id||'')+'\')">＋ 嵌入哔哩哔哩视频</button><span>视频仍存放在哔哩哔哩，网站只保存链接。</span></div>':'';
  return hero("COURSE",c.title,subjectName(c.subject_id)+" · "+(c.profiles?.username||"Episteme"))+
    '<section class="container content"><div class="panel"><a class="back" href="#/courses">← 返回课程</a><div class="viewer"><div><div id="lessonPlayer">'+lessonPlayerHtml(first)+'</div>'+edit+'<div class="course-info"><b>课程简介</b><p>'+esc(c.description||"暂无简介")+'</p></div></div><div class="lessons"><div class="eyebrow">LESSONS</div>'+
    (ls.length?ls.map((l,i)=>'<button class="lesson '+(i===0?'active':'')+'" onclick="playLesson(\''+l.id+'\',this)"><span>'+String(i+1).padStart(2,"0")+' · '+esc(l.title)+'</span><small>'+(l.duration_seconds?Math.round(l.duration_seconds/60)+" min":"○")+'</small></button>').join(''):'<div class="empty">还没有章节。</div>')+
    '</div></div></div></section>';
}
window.playLesson=function(id,btn){
  const l=state.lessons.find(x=>x.id===id);
  document.querySelectorAll('.lesson').forEach(x=>x.classList.remove('active'));
  if(btn)btn.classList.add('active');
  const box=document.getElementById('lessonPlayer');
  if(box)box.innerHTML=lessonPlayerHtml(l);
  const edit=document.querySelector('.video-source-actions button');
  if(edit)edit.setAttribute('onclick',"addBilibiliVideo('"+(l?.course_id||'')+"','"+(l?.id||'')+"')");
};
window.addBilibiliVideo=async function(courseId,lessonId){
  if(!state.user)return auth();
  if(!["subject_manager","admin","coordinator"].includes(state.profile?.role))return toast("只有学科负责人或管理员可以添加课程视频");
  if(!lessonId)return toast("请先创建一个章节，再嵌入视频");
  modal("嵌入哔哩哔哩视频",'<form class="form" id="biliForm"><label>哔哩哔哩视频链接<input name="url" type="url" required placeholder="粘贴 BV 视频链接，例如 https://www.bilibili.com/video/BV..."></label><p class="help">视频不会上传到 Episteme，也不会占用网站存储空间。这里只保存 Bilibili 链接，并在课程页面调用播放器。</p><button class="submit">保存并嵌入</button></form>');
  document.getElementById('biliForm').onsubmit=async function(e){
    e.preventDefault();
    const url=String(new FormData(e.target).get('url')||'').trim();
    if(!isBilibiliUrl(url)||!bilibiliEmbedUrl(url))return toast('请输入有效的哔哩哔哩视频链接');
    const res=await supabase.from('course_lessons').update({video_url:url}).eq('id',lessonId);
    if(res.error)toast(res.error.message);
    else{const i=state.lessons.findIndex(x=>x.id===lessonId);if(i>=0)state.lessons[i]={...state.lessons[i],video_url:url};closeModal();render();toast('Bilibili 视频已嵌入');}
  };
};
