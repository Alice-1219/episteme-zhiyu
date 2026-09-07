import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const C=window.EPISTEME_CONFIG||{};const sb=C.SUPABASE_URL&&C.SUPABASE_PUBLISHABLE_KEY?createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY):null;
(async()=>{if(!sb)return;window.auth=()=>location.href="./auth.html";const btn=document.getElementById("authBtn");if(!btn)return;const apply=s=>{btn.textContent=s?"我的账号":"登录 / 注册";btn.onclick=()=>location.href=s?"./account.html":"./auth.html"};const {data:{session}}=await sb.auth.getSession();apply(session);sb.auth.onAuthStateChange((_e,s)=>apply(s))})();
