import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG=window.EPISTEME_CONFIG||{};
const configured=CFG.SUPABASE_URL && CFG.SUPABASE_PUBLISHABLE_KEY;
const sb=configured?createClient(CFG.SUPABASE_URL,CFG.SUPABASE_PUBLISHABLE_KEY):null;

function modal(title,body){
 const root=document.getElementById("modalRoot");
 if(!root)return;
 root.innerHTML=`<div class="backdrop" id="backdrop"><div class="modal"><div class="modal-head"><h3>${title}</h3><button id="recoveryClose">×</button></div>${body}</div></div>`;
 document.getElementById("recoveryClose")?.addEventListener("click",()=>root.innerHTML="");
}

function showAuthMessage(message,type="error"){
 const form=document.getElementById("authForm");
 if(!form)return;
 let box=document.getElementById("authFeedback");
 if(!box){
   box=document.createElement("div");
   box.id="authFeedback";
   box.style.cssText="margin:12px 0 0;padding:11px 13px;border-radius:10px;font-size:14px;line-height:1.5;text-align:left;border:1px solid rgba(0,0,0,.08);";
   form.prepend(box);
 }
 box.textContent=message;
 box.style.background=type==="success"?"rgba(104,143,105,.12)":"rgba(180,100,90,.10)";
 box.style.color=type==="success"?"#416244":"#8a4038";
 box.style.borderColor=type==="success"?"rgba(65,98,68,.18)":"rgba(138,64,56,.16)";
}

function getFormInputs(form){
 const inputs=[...form.querySelectorAll("input")];
 const password=inputs.find(i=>i.type==="password");
 const email=inputs.find(i=>i.type==="email");
 const text=inputs.find(i=>i.type==="text");
 return {inputs,password,email,text};
}

function isSignupMode(form){
 const text=(form.innerText||"").toLowerCase();
 return text.includes("注册") && !text.includes("登录后") || [...form.querySelectorAll("button")].some(b=>/注册|创建账号|sign up/i.test(b.textContent||""));
}

async function validateAuthSubmit(e){
 if(!sb)return;
 const form=e.target;
 if(!form||form.id!=="authForm")return;
 const {password,email,text}=getFormInputs(form);
 const identifier=(text?.value||email?.value||"").trim();
 const signup=isSignupMode(form);
 if(!identifier)return;

 // Registration: stop duplicate usernames before Supabase is called.
 if(signup && text?.value.trim()){
   const username=text.value.trim();
   const {data,error}=await sb.from("profiles").select("id").ilike("username",username).limit(1).maybeSingle();
   if(!error&&data){
     e.preventDefault();
     e.stopImmediatePropagation();
     showAuthMessage("这个用户名已被使用，请换一个用户名。","error");
     return;
   }
 }

 // Login with a username: give a useful message before a password check.
 if(!signup && text?.value.trim() && !identifier.includes("@")){
   const {data,error}=await sb.from("profiles").select("id").ilike("username",identifier).limit(1).maybeSingle();
   if(!error&&!data){
     e.preventDefault();
     e.stopImmediatePropagation();
     showAuthMessage("用户名不存在，请检查用户名或先注册。","error");
     return;
   }
 }
}

async function forgotPassword(){
 modal("找回用户名 / 密码",`<form class="form" id="recoveryForm">
   <p class="help" style="margin:0">输入注册邮箱。如果账号存在，我们会发送一封找回邮件。为了保护账号安全，无论邮箱是否存在，页面都会显示相同提示。</p>
   <label>注册邮箱<input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
   <button class="submit">发送找回邮件</button>
   <button type="button" class="secondary" id="recoveryBack">返回登录</button>
 </form>`);
 document.getElementById("recoveryBack")?.addEventListener("click",()=>window.auth?.());
 document.getElementById("recoveryForm")?.addEventListener("submit",async e=>{
   e.preventDefault();
   const email=new FormData(e.target).get("email").trim();
   const redirectTo=new URL("reset-password.html",location.href).href;
   const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
   if(error){
     modal("邮件发送失败",`<div class="account"><h3>暂时无法发送</h3><p>请稍后再试。如果问题持续存在，请检查邮箱设置。</p><button class="submit" id="recoveryRetry">返回</button></div>`);
     document.getElementById("recoveryRetry")?.addEventListener("click",forgotPassword);
     return;
   }
   modal("邮件已发送",`<div class="account"><div class="avatar">✉</div><h3>请检查你的邮箱</h3><p>如果该邮箱对应知屿账号，你会收到一封找回邮件。</p><p class="help">打开邮件后，你可以看到自己的用户名，并设置新的密码。</p><button class="submit" id="recoveryDone">知道了</button></div>`);
   document.getElementById("recoveryDone")?.addEventListener("click",()=>document.getElementById("modalRoot").innerHTML="");
 });
}

function enhanceAuth(){
 if(typeof window.auth!=="function")return false;
 if(window.__epistemeAuthEnhanced)return true;
 const originalAuth=window.auth;
 window.auth=()=>{
   originalAuth();
   setTimeout(()=>{
     const form=document.getElementById("authForm");
     if(!form)return;
     if(!form.dataset.feedbackBound){
       // Capture first so our validation can stop the original submit handler when needed.
       form.addEventListener("submit",validateAuthSubmit,true);
       form.dataset.feedbackBound="1";
     }
     if(document.getElementById("forgotPassword"))return;
     const wrap=document.createElement("div");
     wrap.style.cssText="text-align:center;margin-top:13px";
     const btn=document.createElement("button");
     btn.type="button";
     btn.className="resource-open";
     btn.id="forgotPassword";
     btn.textContent="忘记用户名 / 密码？";
     btn.addEventListener("click",forgotPassword);
     wrap.appendChild(btn);
     form.insertAdjacentElement("afterend",wrap);
   },0);
 };
 window.__epistemeAuthEnhanced=true;
 return true;
}

// Give the user immediate, human-readable feedback when Supabase reports an auth result.
if(sb){
 sb.auth.onAuthStateChange((event,session)=>{
   if(event==="SIGNED_IN"&&session) {
     showAuthMessage("登录成功，欢迎回来。","success");
     setTimeout(()=>document.getElementById("modalRoot")?.replaceChildren(),650);
   }
 });
}

let tries=0;
const timer=setInterval(()=>{if(enhanceAuth()||++tries>80)clearInterval(timer)},100);
