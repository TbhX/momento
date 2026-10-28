import * as THREE from 'three';
import {roomLayout,overviewBounds} from './bistro-layout.js';
// Render on demand. No textures, remote assets, profile data or media permissions.
window.MomentoBistro3D={mount(host,capacity=20,onSeat=()=>{}){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0x36292e);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
 renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-20,20,20,-20,.1,200),layout=roomLayout(capacity),{width,depth,centers}=layout;
 let disposed=false,mode='wide',yaw=.12,selectedTable=0,seatStates=[];
 const materials=[],geometries=new Map(),chairs=[],tableTops=[],labels=[];
 const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.72,...extra});materials.push(m);return m};
 const wood=mat(0xb67b50),edge=mat(0x745039),floor=mat(0x84664f),rose=mat(0xd6a0ac),cream=mat(0xf7e1bd),brass=mat(0xb9975c,{metalness:.5}),dark=mat(0x413139),green=mat(0x627451),occupied=mat(0x69535f),mine=mat(0x92c6b6),free=mat(0xe0c3a1),glow=mat(0xffd69b,{emissive:0xffbb6a,emissiveIntensity:1});
 function geometry(type,args){const key=type+args.join(',');if(!geometries.has(key))geometries.set(key,new THREE[type](...args));return geometries.get(key)}
 function mesh(type,args,material,x,y,z,parent=scene){const m=new THREE.Mesh(geometry(type,args),material);m.position.set(x,y,z);parent.add(m);return m}
 const box=(w,h,d,m,x,y,z,p)=>mesh('BoxGeometry',[w,h,d],m,x,y,z,p);
 const cylinder=(r,h,m,x,y,z,p)=>mesh('CylinderGeometry',[r,r,h,16],m,x,y,z,p);
 box(width,.2,depth,floor,0,-.12,0);for(let x=-width/2;x<width/2;x+=.7)box(.018,.012,depth,edge,x,0,0);
 // Open front and low side walls keep every seat visible in the overview.
 box(width,3.6,.2,dark,0,1.8,-depth/2);box(.18,.55,depth,edge,-width/2,.25,0);box(.18,.55,depth,edge,width/2,.25,0);
 box(width*.68,1.25,1.05,rose,0,.63,-depth/2+1.6);box(width*.71,.14,1.3,wood,0,1.32,-depth/2+1.6);
 for(const y of [1.9,2.8]){box(width*.64,.1,.48,wood,0,y,-depth/2+.35);for(let x=-width*.29;x<width*.29;x+=1){cylinder(.09,.32,green,x,y+.21,-depth/2+.37);cylinder(.04,.12,brass,x,y+.43,-depth/2+.37)}}
 centers.forEach(({x,z},i)=>{
 const label=document.createElement('span');label.className='bistro-table-number';label.setAttribute('aria-hidden','true');label.textContent=String(i+1).padStart(2,'0');host.append(label);labels.push(label);
 tableTops.push(cylinder(.82,.14,wood,x,1.03,z));cylinder(.09,.96,brass,x,.5,z);cylinder(.37,.07,dark,x,.04,z);
 cylinder(.1,.15,cream,x,1.18,z);mesh('SphereGeometry',[.065,8,6],glow,x,1.32,z);
 for(const side of [-1,1]){const index=i*2+(side===1?1:0),group=new THREE.Group();scene.add(group);group.position.set(x,0,z+side*1.26);group.userData.seatIndex=index;
 const cushion=box(.9,.16,.75,free,0,.55,0,group),back=box(.9,.7,.15,free,0,.9,side*.37,group);for(const dx of [-.32,.32])for(const dz of [-.25,.25])box(.055,.48,.055,brass,dx,.25,dz,group);
 const person=new THREE.Group();group.add(person);person.visible=false;const body=mesh('SphereGeometry',[.31,12,8],occupied,0,.94,0,person);body.scale.set(1,.95,.75);mesh('SphereGeometry',[.21,12,8],cream,0,1.43,0,person);
 const ring=mesh('TorusGeometry',[.64,.045,8,32],mine,0,.04,0,group);ring.rotation.x=-Math.PI/2;ring.visible=false;chairs.push({group,cushion,back,person,ring});
 }
 });
 for(const x of [-width/2+1,width/2-1]){cylinder(.4,.55,cream,x,.28,-depth/2+2);mesh('SphereGeometry',[.66,12,8],green,x,1.15,-depth/2+2)}
 for(const x of [-width*.25,0,width*.25]){cylinder(.02,.75,brass,x,4,-depth/2+1.6);mesh('SphereGeometry',[.24,12,8],glow,x,3.5,-depth/2+1.6)}
 scene.add(new THREE.HemisphereLight(0xffe9ce,0x76697e,2.8));const key=new THREE.DirectionalLight(0xffdfa8,3);key.position.set(-4,12,8);scene.add(key);const fill=new THREE.DirectionalLight(0xf2c0d2,.7);fill.position.set(width/2,6,-depth/2);scene.add(fill);
 function draw(){if(disposed||document.hidden||!host.getBoundingClientRect().width)return;renderer.render(scene,camera);labels.forEach((label,i)=>{const c=centers[i],p=new THREE.Vector3(c.x,1.4,c.z).project(camera);label.hidden=Math.abs(p.x)>1||Math.abs(p.y)>1||p.z< -1||p.z>1;label.style.left=((p.x+1)*50)+'%';label.style.top=((1-p.y)*50)+'%';label.classList.toggle('is-selected',i===selectedTable)})}
 function position(){const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;const aspect=rect.width/rect.height,elevation=mode==='table'?.78:1.02,target=mode==='table'?centers[selectedTable]||centers[0]:{x:0,z:0},bounds=overviewBounds(mode==='table'?7.5:width,mode==='table'?7.5:depth,aspect,yaw,elevation),distance=Math.max(width,depth)*2;
 camera.position.set(target.x+Math.sin(yaw)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,target.z+Math.cos(yaw)*Math.cos(elevation)*distance);camera.lookAt(target.x,0,target.z);camera.left=-bounds.halfWidth;camera.right=bounds.halfWidth;camera.top=bounds.centerY+bounds.halfHeight;camera.bottom=bounds.centerY-bounds.halfHeight;camera.updateProjectionMatrix();draw();}
 function resize(){if(disposed)return;const r=host.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);position()}
 const observer=new ResizeObserver(resize);observer.observe(host);const visibility=()=>{if(!document.hidden)draw()};document.addEventListener('visibilitychange',visibility);
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let start=null,moved=false;
 const down=e=>{start={x:e.clientX,y:e.clientY};moved=false},move=e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)moved=true},up=e=>{if(!start||moved){start=null;return}start=null;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);for(const hit of raycaster.intersectObjects(chairs.map(c=>c.group),true)){let node=hit.object;while(node&&node.userData.seatIndex===undefined)node=node.parent;if(node){onSeat(node.userData.seatIndex);break}}},cancel=()=>{start=null};
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
 const lost=e=>{e.preventDefault();host.dispatchEvent(new CustomEvent('bistro-context-lost',{bubbles:true}))};renderer.domElement.addEventListener('webglcontextlost',lost);resize();
 return{resize,setSeats(states,table=1){seatStates=states;selectedTable=Math.max(0,Math.min(centers.length-1,table-1));chairs.forEach((chair,i)=>{const state=seatStates[i]||'free';chair.cushion.material=chair.back.material=state==='mine'?mine:state==='occupied'?rose:free;chair.person.visible=state==='occupied';chair.ring.visible=state==='mine'});tableTops.forEach((top,i)=>top.material=i===selectedTable?cream:wood);if(mode==='table')position();else draw()},view(value){mode=value==='table'?'table':'wide';yaw=.12;position()},dispose(){if(disposed)return;disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',cancel);renderer.domElement.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();labels.forEach(label=>label.remove())}};
}};
