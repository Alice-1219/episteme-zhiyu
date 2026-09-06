import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG = window.EPISTEME_CONFIG || {};
const sb = CFG.SUPABASE_URL && CFG.SUPABASE_PUBLISHABLE_KEY
  ? createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY)
  : null;

const ADMIN_PATH = "admin.html";

function injectStyles(){
  if(document.getElementById("accessStyles")) return;
  const s=document.createElement("style");
  s.id="accessStyles";
  s.textContent=`
    .access-modal{position:fixed;inset:0;background:rgba(25,32,28,.32);backdrop-filter:blur(7px);display:grid;place-items:center;z-index:9999;padding:20px}
    .access-card{width:min(520px,94vw);background:#fff;border:1px solid #e1e5df;border-radius:24px;padding:30px;box-shadow:0 25px 80px rgba(30,40,32,.18)}
    .access-card h3{font-size:27px;margin:0 0 8px}.access-card p{color:#68716b;line-height:1.7;margin:0 0 18px}.access-card label{display:grid;gap:7px;font-size:13px;font-weight:600}.access-card input{border:1px solid #d8ddd5;border-radius:11px;padding:12px 13px;font:inherit;box-sizing:border-box;width:100%}.access-actions{display:flex;gap:9px;margin-top:16px}.access-actions button{border-radius:11px;padding:11px 15px;border:1px solid #d8ddd5;background:#fff;cursor:pointer}.access-actions .primary{background:#1f2923;color:#fff;border-color:#1f2923}.access-error{color:#9b4444;font-size:13px;min-height:20px;margin-top:9px}
  `;
  document.head.appendChild(s);
}

function adminLinks(){return [...document.querySelectorAll(`a[href="${ADMIN_PATH}"]`)];}
function setAdminVisible(show){adminLinks().forEach(a=>{a.style.display=show?"":"none";});}

async function getAccess(user){
  if(!sb||!user) return {role:null,subjects:[]};
  const {data:profile}=await sb.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profile?.role === "coordinator") return {role:"coordinator",subjects:[]};
  const {data:rows}=await sb.from("subject_managers").select("subject_id,subjects(name,code)").eq("user_id",user.id);
  return {role:profile?.role||"member",subjects:rows||[]};
}

function inviteModal({onDone}={}){
  injectStyles();
  const old=document.getElementById("accessModal"); if(old) old.remove();
  const el=document.createElement("div");
  el.id="accessModal"; el.className="access-modal";
  el.innerHTML=`<div class="access-card">
    <div class="eyebrow">SUBJECT MANAGER ACCESS</div>
    <h3>进入学科负责人后台</h3>
    <p>如果你是学科负责人，请输入对应的<strong>学科邀请码</strong>。验证成功后，只会开放你负责的学科后台；coordinator 则拥有全部学科的管理权限。</p>
    <label>学科负责人邀请码<input id="inviteCode" autocomplete="off" placeholder="请输入邀请码"></label>
    <div class="access-error" id="inviteError"></div>
    <div class="access-actions"><button id="inviteSkip">暂时跳过</button><button class="primary" id="inviteSubmit">验证并进入后台</button></div>
  </div>`;
  document.body.appendChild(el);
  document.getElementById("inviteSkip").onclick=()=>{el.remove();onDone?.(false)};
  document.getElementById("inviteSubmit").onclick=async()=>{
    const code=document.getElementById("inviteCode").value.trim();
    const err=document.getElementById("inviteError");
    if(!code){err.textContent="请输入邀请码。";return;}
    const btn=document.getElementById("inviteSubmit");btn.disabled=true;btn.textContent="验证中……";err.textContent="";
    const {data,error}=await sb.rpc("claim_subject_manager_invite",{p_code:code});
    if(error){err.textContent="邀请码无效、已失效，或暂未开放。";btn.disabled=false;btn.textContent="验证并进入后台";return;}
    el.remove();
    onDone?.(true,data);
  };
}

async function enforceAdminPage(){
  if(!sb) return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){location.replace("./");return;}
  const access=await getAccess(session.user);
  if(access.role === "coordinator" || (access.role === "subject_manager" && access.subjects.length)) return;
  if(access.role === "subject_manager" || access.role === "member"){
    inviteModal({onDone:(ok)=>{if(ok) location.reload(); else location.replace("./");}});
    return;
  }
  location.replace("./");
}

async function initSite(){
  if(!sb) return;
  const {data:{session}}=await sb.auth.getSession();
  const refresh=async(user)=>{
    if(!user){setAdminVisible(false);return;}
    const access=await getAccess(user);
    const allowed=access.role === "coordinator" || (access.role === "subject_manager" && access.subjects.length>0);
    setAdminVisible(allowed);
    if(access.role === "member" && !sessionStorage.getItem("episteme_invite_seen")){
      sessionStorage.setItem("episteme_invite_seen","1");
      setTimeout(()=>inviteModal({onDone:()=>{}}),650);
    }
  };
  await refresh(session?.user||null);
  sb.auth.onAuthStateChange(async(_event,newSession)=>{await refresh(newSession?.user||null);});
}

if(location.pathname.endsWith("/admin.html") || location.pathname.endsWith("admin.html")) enforceAdminPage();
else initSite();
