import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C = window.EPISTEME_CONFIG || {};
const sb = createClient(C.SUPABASE_URL, C.SUPABASE_PUBLISHABLE_KEY);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
let subjects = [];
let busy = false;

async function loadSubjects(){
  const { data, error } = await sb.from('subjects').select('id,name,code').order('name');
  if(!error) subjects = data || [];
}

async function loadInvites(){
  const { data: invites, error } = await sb.from('manager_invites').select('id,code,active,created_at,label,role').eq('active',true).order('created_at',{ascending:false});
  if(error) throw error;
  const ids = (invites || []).map(x => x.id);
  if(!ids.length) return [];
  const { data: links, error: linkError } = await sb.from('manager_invite_subjects').select('invite_id,subject_id,subjects(id,name,code)').in('invite_id',ids);
  if(linkError) throw linkError;
  return (invites || []).map(i => ({...i, subjects:(links || []).filter(x => x.invite_id === i.id).map(x => x.subjects).filter(Boolean)}));
}

function subjectPicker(){
  return `<div class="invite-subject-picker">${subjects.map(s => `<label class="invite-subject-option"><input type="checkbox" name="subject_ids" value="${s.id}"><span><b>${esc(s.name)}</b>${s.code ? `<small>${esc(s.code)}</small>` : ''}</span></label>`).join('')}</div>`;
}

function cardShell(){
  const old = [...document.querySelectorAll('.admin-card')].find(x => x.querySelector('h2')?.textContent.includes('生成管理人邀请码'));
  return old;
}

function styles(){
  if(document.getElementById('inviteV2Styles')) return;
  const style=document.createElement('style');
  style.id='inviteV2Styles';
  style.textContent=`
    .invite-subject-picker{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:4px}
    .invite-subject-option{display:flex!important;grid-template-columns:none!important;flex-direction:row;align-items:center;gap:10px;padding:11px 12px;border:1px solid #dfe4dd;border-radius:12px;background:#fff;cursor:pointer}
    .invite-subject-option:has(input:checked){background:#edf4e8;border-color:#9eb49a}
    .invite-subject-option input{width:auto!important;margin:0}
    .invite-subject-option span{display:grid;gap:2px}
    .invite-subject-option small{color:#7a837d}
    .invite-generated{padding:15px;border-radius:14px;background:#f4f7f1;border:1px solid #dfe7da;margin-top:14px}
    .invite-generated b{font-size:20px;letter-spacing:3px}
    .invite-generated small{display:block;color:#68736b;margin-top:5px;line-height:1.6}
    .invite-v2-list{display:grid;gap:10px}
    .invite-v2-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px;border:1px solid #e4e8e2;border-radius:14px}
    .invite-v2-row .scope{display:block;color:#737c76;margin-top:4px;line-height:1.5}
    @media(max-width:800px){.invite-subject-picker{grid-template-columns:1fr}.invite-v2-row{align-items:flex-start}}
  `;
  document.head.appendChild(style);
}

async function renderInviteCard(){
  const card=cardShell();
  if(!card) return;
  styles();
  await loadSubjects();
  let invites=[];
  try{ invites=await loadInvites(); }catch(e){ console.warn('invite list load failed',e); }
  card.innerHTML=`
    <h2>生成管理人邀请码</h2>
    <div class="section-note">一个邀请码可以绑定多个学科。先选择负责学科，再填写岗位 / 管理人名称；对方注册后输入一次邀请码，就会一次性获得这些学科的 Subject Manager 权限。</div>
    <form id="inviteV2Form" class="form-grid">
      <label>负责学科（可多选）${subjectPicker()}</label>
      <label>岗位 / 管理人名称<input name="label" maxlength="80" placeholder="例如：张三 — 理科负责人" required></label>
      <button class="primary" type="submit">生成邀请码</button>
    </form>
    <div style="height:22px"></div>
    <h3 style="margin:0 0 12px">有效邀请码</h3>
    <div class="invite-v2-list" id="inviteV2List">
      ${invites.length ? invites.map(i => `<div class="invite-v2-row"><div><b>${esc(i.label || i.name || '未命名管理岗位')}</b><span class="scope">${i.subjects.length ? i.subjects.map(s => esc(s.name + (s.code ? ' · ' + s.code : ''))).join(' / ') : '未绑定学科'}<br>邀请码：<strong style="letter-spacing:2px">${esc(i.code)}</strong> · 创建于 ${new Date(i.created_at).toLocaleString('zh-CN')}</span></div><button class="mini danger" data-v2-revoke="${i.id}">撤销</button></div>`).join('') : '<div class="empty-admin">暂无有效邀请码</div>'}
    </div>`;
  document.getElementById('inviteV2Form')?.addEventListener('submit',createInvite);
  card.querySelectorAll('[data-v2-revoke]').forEach(b=>b.addEventListener('click',()=>revokeInvite(b.dataset.v2Revoke)));
}

async function createInvite(e){
  e.preventDefault();
  if(busy) return;
  busy=true;
  const f=new FormData(e.currentTarget);
  const subjectIds=[...f.getAll('subject_ids')].map(Number).filter(Boolean);
  const label=String(f.get('label')||'').trim();
  if(!subjectIds.length){alert('请至少选择一个负责学科。');busy=false;return;}
  if(!label){alert('请填写岗位 / 管理人名称。');busy=false;return;}
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<5;attempt++){
    const bytes=new Uint32Array(8);crypto.getRandomValues(bytes);
    const code=[...bytes].map(x=>alphabet[x%alphabet.length]).join('');
    const {data:existing,error:checkError}=await sb.from('manager_invites').select('id').eq('code',code).maybeSingle();
    if(checkError){alert(checkError.message);busy=false;return;}
    if(existing) continue;
    const {data:invite,error}=await sb.from('manager_invites').insert({code,label,role:'subject_manager',active:true,subject_id:null}).select('id').single();
    if(error){alert(error.message);busy=false;return;}
    const rows=subjectIds.map(subject_id=>({invite_id:invite.id,subject_id}));
    const {error:linkError}=await sb.from('manager_invite_subjects').insert(rows);
    if(linkError){await sb.from('manager_invites').update({active:false}).eq('id',invite.id);alert(linkError.message);busy=false;return;}
    alert(`邀请码已生成：${code}\n\n${label}\n负责：${subjectIds.map(id=>subjects.find(s=>Number(s.id)===id)?.name||id).join(' / ')}\n\n对方只需要输入一次这个邀请码。`);
    await renderInviteCard();
    busy=false;
    return;
  }
  alert('邀请码生成失败，请重试。');
  busy=false;
}

async function revokeInvite(id){
  if(!confirm('确定撤销这个邀请码？撤销后还未使用的人将无法再用它。')) return;
  const {error}=await sb.from('manager_invites').update({active:false}).eq('id',id);
  if(error){alert(error.message);return;}
  await renderInviteCard();
}

let scheduled=false;
function enhance(){
  if(scheduled)return;
  scheduled=true;
  setTimeout(async()=>{scheduled=false;const title=[...document.querySelectorAll('.admin-card h2')].find(h=>h.textContent.includes('生成管理人邀请码'));if(title) await renderInviteCard();},50);
}

const observer=new MutationObserver(enhance);
observer.observe(document.body,{childList:true,subtree:true});
setTimeout(enhance,400);
setInterval(enhance,1500);
