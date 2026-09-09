(function(){
  function fix(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{if(n.nodeValue&&n.nodeValue.includes('录课'))n.nodeValue=n.nodeValue.replaceAll('录课','视频课');});
  }
  document.addEventListener('DOMContentLoaded',()=>fix(document.body));
  new MutationObserver(muts=>muts.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)fix(n);else if(n.nodeType===3&&n.nodeValue.includes('录课'))n.nodeValue=n.nodeValue.replaceAll('录课','视频课');}))).observe(document.documentElement,{childList:true,subtree:true});
})();