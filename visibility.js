import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C = window.EPISTEME_CONFIG || {};
const sb = createClient(C.SUPABASE_URL, C.SUPABASE_PUBLISHABLE_KEY);
let profile = null;
let user = null;
let lastPanel = null;

const esc = (s) => String(s ?? "").replace(/[&<>\"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));

async function loadIdentity(){
  const { data:{session} } = await sb.auth.getSession();
  if(!session) return false;
  user=session.user;
  const {data}=await sb.from("profiles").select("id,role").eq("id",user.id).maybeSingle();
  profile=data;
  return !!profile && ["coordinator","subject_manager"].includes(profile.role);
}

function managerScope(subjectId){
  return profile?.role === "coordinator" || Number(subjectId) === -1;
}

async function getManagedIds(){
  if(profile?.role === "coordinator") return null;
  const {data}=await sb.from("subject_managers").select("subject_id").eq("user_id",user.id);
  return new Set((data||[]).map(x=>Number(x.subject_id)));
}

async function toggleResource(id, hidden){
  const {error}=await sb.from("resources").update({is_hidden:hidden}).eq("id",id);
  if(error) return alert(`资料状态更新失败：${error.message}`);
  location.reload();
}

async function toggleCourse(id, hidden){
  const {error}=await sb.from("courses").update({is_hidden:hidden}).eq("id",id);
  if(error) return alert(`课程状态更新失败：${error.message}`);
  location.reload();
}

async function enhance(){
  if(!document.querySelector("#view")) return;
  if(!(await loadIdentity())) return;
  const managedIds=await getManagedIds();
  document.querySelectorAll("#view .admin-table tbody tr").forEach(async row=>{
    if(row.dataset.visibilityReady) return;
    const cells=row.querySelectorAll("td");
    const buttons=row.querySelectorAll("button");
    if(cells.length<4) return;
    const title=(cells[0]?.innerText||"").trim();
    if(!title) return;
    row.dataset.visibilityReady="1";
    const actionCell=cells[cells.length-1];
    const source=window.__epistemeVisibilityCache;
    if(!source) return;
    const item=source.find(x=>x.title===title);
    if(!item) return;
    if(managedIds && !managedIds.has(Number(item.subject_id))) return;
    const b=document.createElement("button");
    b.className="mini";
    b.textContent=item.is_hidden?"显示":"隐藏";
    b.title=item.is_hidden?"重新让成员看到":"从成员视角隐藏，但文件仍保持公开可访问";
    b.onclick=()=> item.kind==="course" ? toggleCourse(item.id,!item.is_hidden) : toggleResource(item.id,!item.is_hidden);
    actionCell.querySelector(".admin-actions")?.appendChild(b);
  });
}

async function loadCache(){
  if(!await loadIdentity()) return;
  const [r,c]=await Promise.all([
    sb.from("resources").select("id,title,subject_id,is_hidden"),
    sb.from("courses").select("id,title,subject_id,is_hidden")
  ]);
  window.__epistemeVisibilityCache=[...(r.data||[]).map(x=>({...x,kind:"resource"})),...(c.data||[]).map(x=>({...x,kind:"course"}))];
}

const observer=new MutationObserver(()=>enhance());
(async()=>{await loadCache();observer.observe(document.body,{childList:true,subtree:true});setTimeout(enhance,500);})();
