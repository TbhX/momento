import * as THREE from 'three';
// Render on demand: no perpetual loop, textures, remote assets or member data.
window.MomentoBistro3D={mount(host,capacity=20){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0x322329);renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);
 const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x322329,24,65);const camera=new THREE.PerspectiveCamera(48,1,.1,100);let disposed=false,mode='wide',angle=0;
 const materials=[],geometries=[];const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.7,...extra});materials.push(m);return m};
 const wood=mat(0x9b6648),floor=mat(0x604735),rose=mat(0xbd7b91),cream=mat(0xf4dec4),brass=mat(0xb99557,{metalness:.6}),dark=mat(0x382b31),green=mat(0x49614c),glow=mat(0xffd198,{emissive:0xffb45e,emissiveIntensity:1.5});
 function mesh(geometry,material,x,y,z){geometries.push(geometry);const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);scene.add(m);return m}
 const box=(w,h,d,m,x,y,z)=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z);
 const cylinder=(r,h,m,x,y,z)=>mesh(new THREE.CylinderGeometry(r,r,h,20),m,x,y,z);
 const count=([20,50,100].includes(capacity)?capacity:20)/2,cols=count===10?5:count===25?5:10,rows=Math.ceil(count/cols),width=cols*3.2+4,depth=rows*3.8+9;
 box(width,.2,depth,floor,0,-.1,0);for(let x=-width/2;x<width/2;x+=.65)box(.015,.012,depth,dark,x,.01,0);
 box(width,6,.25,dark,0,3,-depth/2);box(.25,6,depth,dark,-width/2,3,0);box(.25,6,depth,dark,width/2,3,0);
 box(width*.65,1.3,1.2,rose,0,.65,-depth/2+2);box(width*.68,.15,1.5,wood,0,1.4,-depth/2+2);
 for(let y=2;y<=4;y++){box(width*.6,.12,.6,wood,0,y,-depth/2+.45);for(let x=-width*.25;x<width*.25;x+=.8){cylinder(.11,.42,green,x,y+.26,-depth/2+.5);cylinder(.045,.14,brass,x,y+.54,-depth/2+.5)}}
 for(let i=0;i<count;i++){const x=(i%cols-(cols-1)/2)*3.2,z=Math.floor(i/cols)*3.8-depth/2+6;
 cylinder(.85,.13,wood,x,1.05,z);cylinder(.09,1,brass,x,.5,z);cylinder(.4,.08,dark,x,.04,z);
 cylinder(.09,.22,cream,x,1.23,z);mesh(new THREE.SphereGeometry(.065,8,8),glow,x,1.4,z);
 for(const side of [-1,1]){box(.85,.18,.75,rose,x,.55,z+side*1.25);box(.85,.8,.16,rose,x,.9,z+side*1.6);for(const dx of [-.3,.3])for(const dz of [-.25,.25])box(.055,.5,.055,brass,x+dx,.25,z+side*1.25+dz)}
 }
 for(const x of [-width/2+1,width/2-1]){cylinder(.45,.7,cream,x,.35,-depth/2+3);mesh(new THREE.SphereGeometry(.8,12,10),green,x,1.4,-depth/2+3)}
 for(const x of [-width*.3,0,width*.3]){cylinder(.025,1.1,brass,x,4.6,-depth/2+2);mesh(new THREE.SphereGeometry(.3,16,12),glow,x,4,-depth/2+2)}
 scene.add(new THREE.HemisphereLight(0xffe2c1,0x625276,2.4));const light=new THREE.DirectionalLight(0xffd9a2,3);light.position.set(3,8,6);scene.add(light);
 function draw(){if(!disposed&&!document.hidden&&host.getBoundingClientRect().width)renderer.render(scene,camera)}
 function position(){if(mode==='table'){camera.position.set(Math.sin(angle)*3,2.3,depth/2-1);camera.lookAt(0,1,-depth/2+4)}else{const distance=Math.max(width*.82,depth*.78);camera.position.set(Math.sin(angle)*distance,distance*.65,Math.cos(angle)*distance);camera.lookAt(0,.4,-1)}draw()}
 function resize(){if(disposed)return;const r=host.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();position()}
 const observer=new ResizeObserver(resize);observer.observe(host);const visibility=()=>{if(!document.hidden)draw()};document.addEventListener('visibilitychange',visibility);
 let start=null;const down=e=>{start=e.clientX;renderer.domElement.setPointerCapture(e.pointerId)},move=e=>{if(start===null)return;angle=Math.max(-.65,Math.min(.65,angle+(e.clientX-start)*.003));start=e.clientX;position()},up=()=>{start=null};renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
 const lost=e=>{e.preventDefault();host.closest('.immersive-bistro')?.classList.add('bistro-simple')};renderer.domElement.addEventListener('webglcontextlost',lost);resize();
 return{resize,view(value){mode=value;angle=0;position()},dispose(){if(disposed)return;disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',up);renderer.domElement.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()}};
}};
