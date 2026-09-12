/* Episteme 知屿 — lightweight route loader
 * Keep the public shell cheap. Load the SPA and page features only when a route needs them.
 * No framework and no deferred Promise.all boot.
 */
(function(){
  const loaded=new Set();
  const loading=new Map();
  const core=['./access.js','./recovery.js'];
  const pageModules={
    app:['./app.js'],
    community:['./question-reference.js','./course-discussion.js'],
    courses:['./courses-ui.js','./media-player.js','./course-discussion.js'],
    library:['./library.js','./library-upload-entry.js','./question-reference.js'],
    dashboard:['./dashboard.js'],
    admin:[]
  };

  function load(src){
    if(loaded.has(src))return Promise.resolve();
    if(loading.has(src))return loading.get(src);
    const p=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.type='module'; s.src=src;
      s.onload=()=>{loaded.add(src);loading.delete(src);resolve()};
      s.onerror=()=>{loading.delete(src);reject(new Error('Failed to load '+src))};
      document.body.appendChild(s);
    });
    loading.set(src,p); return p;
  }

  async function loadCore(){
    for(const src of core)await load(src);
  }

  async function loadRoute(){
    await loadCore();
    const path=location.hash.slice(1)||'/';
    if(path==='/')return;
    const key=path.startsWith('/question/')?'community':path.split('/')[1]||'home';
    if(key==='home')return;
    const modules=[...(pageModules.app||[]),...(pageModules[key]||[])];
    for(const src of [...new Set(modules)]){
      try{await load(src)}catch(error){console.error('[Episteme] module load failed',error)}
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadRoute,{once:true});
  else loadRoute();
  window.addEventListener('hashchange',()=>{loadRoute()});
})();
