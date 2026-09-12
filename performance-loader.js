/* Episteme 知屿 — performance loader
 * Paint the shell first, then load the SPA/features after the first frame.
 * No framework, no behavior changes.
 */
(function(){
  const modules=[
    './app.js',
    './access.js',
    './recovery.js',
    './media-player.js',
    './library.js',
    './library-upload-entry.js',
    './notifications-ui.js',
    './account-link.js',
    './courses-ui.js',
    './question-reference.js',
    './course-discussion.js',
    './dashboard.js'
  ];

  function start(){
    const run=async()=>{
      try{
        for(const src of modules) await import(src);
      }catch(error){
        console.error('[Episteme] frontend module failed to load',error);
        const main=document.getElementById('main');
        if(main && !main.innerHTML.trim()){
          main.innerHTML='<section class="container content"><div class="panel empty">页面加载遇到问题，请刷新后重试。</div></section>';
        }
      }
    };

    if('requestIdleCallback' in window){
      requestIdleCallback(run,{timeout:1200});
    }else{
      setTimeout(run,0);
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      requestAnimationFrame(()=>requestAnimationFrame(start));
    },{once:true});
  }else{
    requestAnimationFrame(()=>requestAnimationFrame(start));
  }
})();
