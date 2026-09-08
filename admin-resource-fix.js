import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const C=window.EPISTEME_CONFIG||{};const sb=createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
let busy=false;
async function identity(){const {data:{session}}=await sb.auth.getSession();if(!session)return null;const {data:profile}=await sb.from('profiles').select('id,username,role').eq('id',session.user.id).maybeSingle();return profile}
async function renderResources(){
 if(busy)return;const view=document.querySelector('#view');if(!view)return;
 const active=document.querySelector('.admin-tab.active')?.dataset?.tab;if(active&&active!=='resources')return;
 const profile=await identity();if(!profile||profile.role!=='coordinator')return;
 busy=true;
 const [{data:rs,error:re},{data:subs,error:se}]=await Promise.all([
  sb.from('resources').select('id,title,description,subject_id,topic,resource_type,status,file_path,external_url,uploader_id,file_size,mime_type,is_hidden,created_at').order('created_at',{ascending:false}),
  sb.from('subjects').select('id,name,code').order('name')
 ]);
 if(re){busy=false;view.innerHTML='<div class="admin-card"><h2>资料审核</h2><p>资料读取失败：'+esc(re.message)+'</p></div>';return}
 const subjectMap=new Map((subs||[]).map(s=>[Number(s.id),s]));
 const uploaderIds=[...new Set((rs||[]).map(r=>r.uploader_id).filter(Boolean))];
 let users=[];if(uploaderIds.length){const q=await sb.from('profiles').select('id,username').in('id',uploaderIds);users=q.data||[]}
 const userMap=new Map(users.map(u=>[u.id,u.username]));
 const pending=(rs||[]).filter(r=>r.status==='pending').length,approved=(rs||[]).filter(r=>r.status==='approved').length;
 view.innerHTML=`<div class="stat-grid"><div class="stat"><b>${rs?.length||0}</b><span class="muted">可管理资料</span></div><div class="stat"><b>${pending}</b><span class="muted">待审核</span></div><div class="stat"><b>${approved}</b><span class="muted">已通过</span></div></div><div class="admin-grid"><div class="admin-card" style="grid-column:1/-1"><h2>资料审核</h2><div class="section-note">这里显示所有已上传资料。Coordinator 可以直接审核、查看和删除，不受学科关注状态影响。</div><table class="admin-table"><thead><tr><th>资料</th><th>学科</th><th>上传者</th><th>状态</th><th>操作</th></tr></thead><tbody>${(rs||[]).length?(rs||[]).map(r=>{const s=subjectMap.get(Number(r.subject_id));return `<tr><td><b>${esc(r.title)}</b><br><span class="muted">${esc(r.resource_type||'资料')}</span></td><td>${esc(s?.name||'未分类')}${s?.code?' · '+esc(s.code):''}</td><td>${esc(userMap.get(r.uploader_id)||'成员')}</td><td><span class="mini">${r.status==='approved'?'已通过':r.status==='rejected'?'已拒绝':'待审核'}</span></td><td><div class="admin-actions">${r.file_path?`<button class="mini" data-rv="${r.id}">查看</button>`:''}${r.status!=='approved'?`<button class="mini ok" data-ra="${r.id}">通过</button>`:''}${r.status!=='rejected'?`<button class="mini no" data-rr="${r.id}">拒绝</button>`:''}<button class="mini danger" data-rd="${r.id}">删除</button></div></td></tr>`}).join(''):`<tr><td colspan="5">暂无资料</td></tr>`}</tbody></table></div><div class="admin-card"><h2>上传资料</h2><p class="muted">右侧原有上传表单仍可继续使用。</p></div></div>`;
 view.querySelectorAll('[data-ra]').forEach(b=>b.onclick=()=>review(b.dataset.ra,'approved'));
 view.querySelectorAll('[data-rr]').forEach(b=>b.onclick=()=>review(b.dataset.rr,'rejected'));
 view.querySelectorAll('[data-rd]').forEach(b=>b.onclick=()=>removeResource(b.dataset.rd));
 view.querySelectorAll('[data-rv]').forEach(b=>b.onclick=()=>viewResource(b.dataset.rv));
 busy=false;
}
async function review(id,status){const update={status};if(status==='rejected'){const reason=prompt('请输入拒绝原因（可选）：');if(reason)update.rejection_reason=reason}const {error}=await sb.from('resources').update(update).eq('id',id);if(error)return alert('审核失败：'+error.message);await renderResources()}
async function removeResource(id){if(!confirm('确定删除这份资料？'))return;const {data:r}=await sb.from('resources').select('file_path').eq('id',id).maybeSingle();if(r?.file_path)await sb.storage.from('episteme-resources').remove([r.file_path]);const {error}=await sb.from('resources').delete().eq('id',id);if(error)return alert('删除失败：'+error.message);await renderResources()}
async function viewResource(id){const {data:r,error}=await sb.from('resources').select('*').eq('id',id).maybeSingle();if(error||!r)return alert('找不到这份资料。');let url=r.external_url||'';if(r.file_path){const x=await sb.storage.from('episteme-resources').createSignedUrl(r.file_path,600);if(x.error)return alert('无法打开：'+x.error.message);url=x.data?.signedUrl}if(url)window.open(url,'_blank');else alert('这份资料没有可访问文件。')}
let observer=new MutationObserver(()=>{clearTimeout(window.__epAdminFixTimer);window.__epAdminFixTimer=setTimeout(renderResources,80)});
observer.observe(document.body,{childList:true,subtree:true});setTimeout(renderResources,300);
