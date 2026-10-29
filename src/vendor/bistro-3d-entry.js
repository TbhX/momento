import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {roomLayout,overviewBounds} from './bistro-layout.js';
// Render on demand. No textures, remote assets, profile data or media permissions.
window.MomentoBistro3D={mount(host,capacity=20,onSeat=()=>{}){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0xeee7f5);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-20,20,20,-20,.1,200),layout=roomLayout(capacity),{width,depth,centers}=layout;
 let disposed=false,mode='wide',yaw=.52,selectedTable=0,seatStates=[];
 const materials=[],geometries=new Map(),chairs=[],tableTops=[],labels=[];
 const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.72,...extra});materials.push(m);return m};
 const wood=mat(0xe0b7a6,{roughness:.48}),edge=mat(0xb69bc6),floor=mat(0xf6e5dc),rose=mat(0xe8a6c2),cream=mat(0xf7e1bd),brass=mat(0xe8c790,{metalness:.5}),dark=mat(0x9b85b4),green=mat(0x8bb6a0),occupied=mat(0x9f92c3),mine=mat(0x92c6b6),free=mat(0xb9cdec),glow=mat(0xffd69b,{emissive:0xffbb6a,emissiveIntensity:1});
 for(const upholstery of [free,rose,mine])upholstery.side=THREE.DoubleSide;
 const stone=mat(0xfff2df,{roughness:.38}),rug=mat(0xe4d4ec),wall=mat(0xcdb5dc),sage=mat(0x819986),trim=mat(0xf3d49c,{metalness:.65,roughness:.35});
 const contact=new THREE.MeshBasicMaterial({color:0x43312e,transparent:true,opacity:.12,depthWrite:false});materials.push(contact);
 function geometry(type,args){const key=type+args.join(',');if(!geometries.has(key))geometries.set(key,new THREE[type](...args));return geometries.get(key)}
 function mesh(type,args,material,x,y,z,parent=scene){const m=new THREE.Mesh(geometry(type,args),material);m.position.set(x,y,z);parent.add(m);return m}
 const box=(w,h,d,m,x,y,z,p=scene)=>{const radius=Math.min(w,h,d)*.22,key='rounded'+[w,h,d,radius].join(',');if(!geometries.has(key))geometries.set(key,new RoundedBoxGeometry(w,h,d,2,radius));const o=new THREE.Mesh(geometries.get(key),m);o.position.set(x,y,z);p.add(o);return o};
 const cylinder=(r,h,m,x,y,z,p)=>mesh('CylinderGeometry',[r,r,h,16],m,x,y,z,p);
 // Raised toy-like diorama with a quiet tiled floor, not a realistic room scan.
 box(width,.45,depth,edge,0,-.32,0);box(width-.12,.16,depth-.12,floor,0,-.1,0);
 const tile=mat(0xf0dce7);for(let x=-width/2+1;x<width/2-1;x+=2)for(let z=-depth/2+1;z<depth/2-1;z+=2){if((Math.round((x+width/2-1)/2)+Math.round((z+depth/2-1)/2))%2===0)box(1.94,.012,1.94,tile,x,0,z)}
 // Flat contact shadows keep the scene grounded without a costly shadow pass.
 function shadow(x,z,r,sx=1,sz=1){const m=mesh('CircleGeometry',[r,24],contact,x,.018,z);m.rotation.x=-Math.PI/2;m.scale.set(sx,sz,1);return m}
 // Open front and low side walls keep every seat visible in the overview.
 box(width,3.6,.2,wall,0,1.8,-depth/2);
 box(width,.08,.3,trim,0,.65,-depth/2+.12);
 for(let x=-width/2+.35;x<width/2;x+=.55)box(.055,.58,.12,wood,x,.3,-depth/2+.16);
 // Recessed brass arches, softly coloured panels and a ribbed cocktail counter.
 for(const x of [-width*.28,0,width*.28]){box(1.75,1.3,.08,rose,x,2,-depth/2+.14);mesh('TorusGeometry',[.88,.035,6,32,Math.PI],trim,x,2.65,-depth/2+.2);box(.065,1.3,.08,trim,x-.88,2,-depth/2+.2);box(.065,1.3,.08,trim,x+.88,2,-depth/2+.2)}box(.18,.55,depth,edge,-width/2,.25,0);box(.18,.55,depth,edge,width/2,.25,0);
 box(width*.68,1.25,1.05,rose,0,.63,-depth/2+1.6);box(width*.71,.14,1.3,stone,0,1.32,-depth/2+1.6);
 for(let x=-width*.33;x<width*.34;x+=.55)box(.045,1.12,.06,wood,x,.63,-depth/2+2.15);
 box(width*.7,.035,.035,trim,0,1.23,-depth/2+2.25);shadow(0,-depth/2+1.6,1,width*.36,1.1);
 for(const y of [1.9,2.8]){box(width*.64,.1,.48,wood,0,y,-depth/2+.35);for(let x=-width*.29;x<width*.29;x+=1){cylinder(.09,.32,green,x,y+.21,-depth/2+.37);cylinder(.04,.12,brass,x,y+.43,-depth/2+.37)}}
 centers.forEach(({x,z},i)=>{
 const label=document.createElement('span');label.className='bistro-table-number';label.setAttribute('aria-hidden','true');label.textContent=String(i+1).padStart(2,'0');host.append(label);labels.push(label);
 cylinder(1.53,.018,rug,x,.008,z);shadow(x,z,1.4,.95,1.25);
 tableTops.push(cylinder(.82,.22,stone,x,1.03,z));cylinder(.83,.05,trim,x,.915,z);cylinder(.09,.96,brass,x,.5,z);cylinder(.37,.07,dark,x,.04,z);
 cylinder(.105,.17,brass,x,1.18,z);
 for(const dz of [-.42,.42]){cylinder(.16,.018,cream,x+.15,1.105,z+dz);cylinder(.055,.13,stone,x-.25,1.16,z+dz)}mesh('SphereGeometry',[.065,8,6],glow,x,1.32,z);
 for(const side of [-1,1]){const index=i*2+(side===1?1:0),group=new THREE.Group();scene.add(group);group.position.set(x,0,z+side*1.26);group.userData.seatIndex=index;
 shadow(x,z+side*1.26,.6);
 const cushion=box(.96,.26,.83,free,0,.55,0,group),back=box(.96,.78,.23,free,0,.95,side*.36,group);
 for(const dx of [-.4,.4]){box(.2,.22,.72,free,dx,.78,0,group);box(.045,.22,.045,trim,dx,.65,-side*.22,group)}for(const dx of [-.32,.32])for(const dz of [-.25,.25])box(.055,.48,.055,brass,dx,.25,dz,group);
 const person=new THREE.Group();group.add(person);person.visible=false;const body=mesh('SphereGeometry',[.31,12,8],occupied,0,.94,0,person);body.scale.set(1,.95,.75);mesh('SphereGeometry',[.25,16,12],cream,0,1.43,0,person);
 // Neutral illustrated guests; no identity or preference inferred from appearance.
 for(const dx of [-.075,.075])mesh('SphereGeometry',[.025,8,6],dark,dx,1.46,-side*.23,person);
 const hair=mesh('SphereGeometry',[.255,12,8],i%2?wood:occupied,0,1.57,.035*side,person);hair.scale.set(1,.5,1);
 const ring=mesh('TorusGeometry',[.64,.075,8,32],mine,0,.04,0,group);ring.rotation.x=-Math.PI/2;ring.visible=false;chairs.push({group,cushion,back,person,ring});
 }
 });
 for(const x of [-width/2+1,width/2-1]){const z=-depth/2+2;shadow(x,z,.7);cylinder(.35,.6,stone,x,.3,z);cylinder(.05,1.4,wood,x,1.1,z);for(let n=0;n<7;n++){const a=n*2.4,leaf=mesh('SphereGeometry',[.38,10,8],n%2?sage:green,x+Math.sin(a)*.32,1.2+n*.13,z+Math.cos(a)*.32);leaf.scale.set(.7,1.35,.5);leaf.rotation.z=Math.sin(a)*.55}}

 for(const x of [-width*.25,0,width*.25]){cylinder(.02,.75,brass,x,4,-depth/2+1.6);mesh('SphereGeometry',[.24,12,8],glow,x,3.5,-depth/2+1.6);mesh('CylinderGeometry',[.15,.43,.27,24],brass,x,3.68,-depth/2+1.6)}
 scene.add(new THREE.HemisphereLight(0xffe9ce,0x887c91,2.1));const key=new THREE.DirectionalLight(0xffe4c3,2.5);key.position.set(-4,12,8);scene.add(key);const fill=new THREE.DirectionalLight(0xf2c0d2,.7);fill.position.set(width/2,6,-depth/2);scene.add(fill);
 function draw(){if(disposed||document.hidden||!host.getBoundingClientRect().width)return;renderer.render(scene,camera);labels.forEach((label,i)=>{const c=centers[i],p=new THREE.Vector3(c.x,1.4,c.z).project(camera);label.hidden=Math.abs(p.x)>1||Math.abs(p.y)>1||p.z< -1||p.z>1;label.style.left=((p.x+1)*50)+'%';label.style.top=((1-p.y)*50)+'%';label.classList.toggle('is-selected',i===selectedTable)})}
 function position(){const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;const aspect=rect.width/rect.height,elevation=mode==='table'?.78:1.02,target=mode==='table'?centers[selectedTable]||centers[0]:{x:0,z:0},bounds=overviewBounds(mode==='table'?7.5:width,mode==='table'?7.5:depth,aspect,yaw,elevation),distance=Math.max(width,depth)*2;
 camera.position.set(target.x+Math.sin(yaw)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,target.z+Math.cos(yaw)*Math.cos(elevation)*distance);camera.lookAt(target.x,0,target.z);camera.left=-bounds.halfWidth;camera.right=bounds.halfWidth;camera.top=bounds.centerY+bounds.halfHeight;camera.bottom=bounds.centerY-bounds.halfHeight;camera.updateProjectionMatrix();draw();}
 function resize(){if(disposed)return;const r=host.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);position()}
 const observer=new ResizeObserver(resize);observer.observe(host);const visibility=()=>{if(!document.hidden)draw()};document.addEventListener('visibilitychange',visibility);
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let start=null,moved=false;
 const down=e=>{start={x:e.clientX,y:e.clientY};moved=false},move=e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)moved=true},up=e=>{if(!start||moved){start=null;return}start=null;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);for(const hit of raycaster.intersectObjects(chairs.map(c=>c.group),true)){let node=hit.object;while(node&&node.userData.seatIndex===undefined)node=node.parent;if(node){onSeat(node.userData.seatIndex);break}}},cancel=()=>{start=null};
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
 const lost=e=>{e.preventDefault();host.dispatchEvent(new CustomEvent('bistro-context-lost',{bubbles:true}))};renderer.domElement.addEventListener('webglcontextlost',lost);resize();
 return{resize,setSeats(states,table=1){seatStates=states;selectedTable=Math.max(0,Math.min(centers.length-1,table-1));chairs.forEach((chair,i)=>{const state=seatStates[i]||'free';chair.cushion.material=chair.back.material=state==='mine'?mine:state==='occupied'?rose:free;chair.person.visible=state==='occupied';chair.ring.visible=state==='mine'});tableTops.forEach((top,i)=>top.material=i===selectedTable?cream:stone);if(mode==='table')position();else draw()},view(value){mode=value==='table'?'table':'wide';yaw=.52;position()},dispose(){if(disposed)return;disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',cancel);renderer.domElement.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();labels.forEach(label=>label.remove())}};
}};
