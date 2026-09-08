import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C=window.EPISTEME_CONFIG||{};
if(!C.SUPABASE_URL||!C.SUPABASE_PUBLISHABLE_KEY) throw new Error("Episteme config missing");
const sb=createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
const BUCKET="episteme-resources";
let resources=[];
let lastKey="";

const esc=s=>String(s??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const size=n=>{n=Number(n||0);if(!n)return "";if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";if(n<1073741824)return (n/1048576).toFixed(1)+" MB";return (n/1073741824).toFixed(2)+" GB"};
const icon=r=>{const m=r.mime_type||"";if(m.includes("pdf"))return "PDF";if(m.startsWith("video/"))return "▶";if(m.startsWith("image/"))return "IMG";if(m.startsWith("audio/"))return "♪";return "DOC"};

function style(){
 if(document.getElementById("resourceBridgeStyle"))return;
 const s=document.createElement("style");s.id="resourceBridgeStyle";s.textContent=`
 .resource-bridge-card{position:relative;background:#fff;border:1px solid #e0e5df;border-radius:14px;padding:14px;min-height:136px;cursor:pointer;transition:.14s;display:flex;flex-direction:column;justify-content:space-between}
 .resource-bridge-card:hover{border-color:#c5d0c4;transform:translateY(-1px);box-shadow:0 8px 22px rgba(45,57,47,.07)}
 .resource-bridge-card .r-top{display:flex;align-items:center;justify-content:space-between;gap:7px}
 .resource-bridge-card .r-icon{width:40px;height:40px;border-radius:10px;background:#eaf0e6;color:#536a57;display:grid;place-items:center;font-size:10px;font-weight:800}
 .resource-bridge-card .r-pill{display:inline-flex;align-items:center;justify-content:center;min-width:38px;padding:4px 7px;border-radius:999px;background:#edf1eb;color:#647067;font-size:10px;line-height:1}
 .resource-bridge-card .r-name{font-weight:700;line-height:1.35;margin-top:11px;overflow-wrap:anywhere}
 .resource-bridge-card .r-meta{font-size:11px;color:#7d867f;margin-top:5px}
 .resource-bridge-modal{position:fixed;inset:0;z-index:10050;background:rgba(22,29,25,.58);display:grid;place-items:center;padding:18px}
 .resource-bridge-dialog{width:min(1120px,96vw);height:min(86vh,900px);background:#fff;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 90px rgba(0,0,0,.24)}
 .resource-bridge-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:1px solid #e5e8e3}
 .resource-bridge-head b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .resource-bridge-close{border:0;background:#f0f2ee;border-radius:8px;padding:7px 10px;cursor:pointer}
 .resource-bridge-view{flex:1;min-height:0;background:#f4f6f3;display:grid;place-items:center}
 .resource-bridge-view iframe{width:100%;height:100%;border:0}
 .resource-bridge-view img{max-width:100%;max-height:100%;object-fit:contain}
 .resource-bridge-view video{max-width:95%;max-height:92%}
 .resource-bridge-view audio{width:min(700px,90%)}
 .resource-bridge-text{width:100%;height:100%;overflow:auto;padding:28px;box-sizing:border-box;white-space:pre-wrap;line-height:1.7}
 `;document.head.appendChild(s);
}

async function load(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session){resources=[];return}
 const {data,error}=await sb.from("resources").select("*,subjects(name,code)").order("created_at",{ascending:false});
 resources=error?[]:(data||[]);
}

function selectedSubjectName(){
 const h=document.querySelector("#main .lib-title h1");
 return h?.textContent?.trim()||"";
}

function currentRoot(){
 const h=document.querySelector("#main .lib-title h1");
 if(!h)return false;
 const subject=selectedSubjectName();
 const current=document.querySelector("#main .lib-crumbs .current");
 return !!subject && !current;
}

function openViewer(r){
 const root=document.getElementById("resourceBridgeModal");
 if(root)root.remove();
 const modal=document.createElement("div");modal.id="resourceBridgeModal";modal.className="resource-bridge-modal";
 modal.innerHTML=`<div class="resource-bridge-dialog"><div class="resource-bridge-head"><b>${esc(r.title)}</b><button class="resource-bridge-close">关闭</button></div><div class="resource-bridge-view"><div>正在打开资料……</div></div></div>`;
 document.body.appendChild(modal);
 const close=()=>modal.remove();
 modal.querySelector(".resource-bridge-close").onclick=close;
 modal.onclick=e=>{if(e.target===modal)close()};
 (async()=>{
   let url=r.external_url||"";
   if(r.file_path){
     const x=await sb.storage.from(BUCKET).createSignedUrl(r.file_path,600);
     if(x.error||!x.data?.signedUrl){modal.querySelector(".resource-bridge-view").innerHTML=`<div style="padding:30px;text-align:center">暂时无法打开这份资料。<br><small>${esc(x.error?.message||"没有可访问链接")}</small></div>`;return}
     url=x.data.signedUrl;
   }
   if(!url){modal.querySelector(".resource-bridge-view").innerHTML=`<div style="padding:30px;text-align:center">这份资料没有可访问文件。</div>`;return}
   const mime=r.mime_type||"";
   let html;
   if(mime.startsWith("image/")) html=`<img src="${esc(url)}" alt="">`;
   else if(mime.startsWith("video/")) html=`<video src="${esc(url)}" controls playsinline></video>`;
   else if(mime.startsWith("audio/")) html=`<audio src="${esc(url)}" controls></audio>`;
   else if(mime.startsWith("text/")){
     try{const t=await fetch(url).then(z=>z.text());html=`<pre class="resource-bridge-text">${esc(t)}</pre>`}catch{html=`<iframe src="${esc(url)}"></iframe>`}
   } else html=`<iframe src="${esc(url)}"></iframe>`;
   modal.querySelector(".resource-bridge-view").innerHTML=html;
 })();
}

function render(){
 if(location.hash.slice(1)!=="/library")return;
 const grid=document.querySelector("#main .lib-grid");
 if(!grid)return;
 const subject=selectedSubjectName();
 if(!subject||!currentRoot())return;
 const rows=resources.filter(r=>r.subjects?.name===subject&&!r.is_hidden);
 const key=subject+"|"+rows.map(r=>r.id).join(",")+"|"+grid.children.length;
 if(key===lastKey)return;
 lastKey=key;
 grid.querySelectorAll(".resource-bridge-card").forEach(x=>x.remove());
 rows.forEach(r=>{
   const card=document.createElement("article");card.className="resource-bridge-card";card.innerHTML=`<div><div class="r-top"><span class="r-icon">${icon(r)}</span><span class="r-pill">资料</span></div><div class="r-name">${esc(r.title)}</div><div class="r-meta">${esc(r.resource_type||"资料")}${r.file_size?" · "+size(r.file_size):""}</div></div>`;
   card.onclick=()=>openViewer(r);grid.appendChild(card);
 });
}

style();
(async()=>{await load();render();const mo=new MutationObserver(()=>render());mo.observe(document.getElementById("main")||document.body,{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(render,120));sb.auth.onAuthStateChange(async()=>{await load();setTimeout(render,120)});})();
