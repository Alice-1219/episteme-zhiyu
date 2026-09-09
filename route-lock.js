/* Specialized pages own #main. Prevent the legacy SPA renderer from replacing them. */
(function(){
  const isSpecialized=()=>/^#\/(library|courses|course\/)/.test(location.hash||'#/');
  const proto=Element.prototype;
  const desc=Object.getOwnPropertyDescriptor(proto,'innerHTML');
  if(!desc?.set)return;
  Object.defineProperty(proto,'innerHTML',{
    get:desc.get,
    set(value){
      if(this.id==='main'&&isSpecialized()){
        const stack=new Error().stack||'';
        if(stack.includes('/app.js'))return;
      }
      return desc.set.call(this,value);
    },
    configurable:true,
    enumerable:desc.enumerable
  });
})();
