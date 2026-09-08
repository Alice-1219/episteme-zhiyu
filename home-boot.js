/* Make the landing route explicit and prevent a blank first paint. */
(function(){
  const main=document.getElementById('main');
  if(!main) return;

  if(!location.hash || location.hash === '#'){
    history.replaceState(null,'',location.pathname + location.search + '#/');
  }

  if(!main.children.length){
    main.innerHTML=`<section class="home-boot-fallback">
      <div>
        <div class="eyebrow">STUDENT-LED LEARNING COMMUNITY</div>
        <h1>一起学习，<br>互相帮助，<br>让知识<strong>留下来。</strong></h1>
        <p>Episteme 知屿是一个由高中生发起并主导的线上学习共同体。通过同伴授课、资源共享、答疑互助与 AI 辅助，让每一届学生都能给下一届留下更多知识。</p>
        <div class="actions">
          <button class="primary" onclick="location.hash='#/community'">进入讨论群 →</button>
          <button class="secondary" onclick="location.hash='#/library'">浏览资源库</button>
        </div>
      </div>
      <div class="boot-art" aria-hidden="true"></div>
    </section>`;
  }
})();
