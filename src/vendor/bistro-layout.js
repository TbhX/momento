// Shared deterministic room geometry and camera bounds. No member data.
export function roomLayout(capacity=20){
 const seats=[20,50,100].includes(capacity)?capacity:20,tables=seats/2,columns=tables===50?10:5,rows=Math.ceil(tables/columns);
 const width=columns*3.2+3,depth=rows*3.8+7;
 const centers=Array.from({length:tables},(_,i)=>({x:(i%columns-(columns-1)/2)*3.2,z:Math.floor(i/columns)*3.8-depth/2+5.5}));
 return{capacity:seats,tables,columns,rows,width,depth,centers};
}
export function overviewBounds(width,depth,aspect,yaw=0,elevation=1.02){
 // Project every corner of the room, including the 4.6m pendants, onto camera axes.
 const points=[];
 for(const x of [-width/2,width/2])for(const y of [0,4.6])for(const z of [-depth/2,depth/2])points.push({x:Math.cos(yaw)*x-Math.sin(yaw)*z,y:-Math.sin(elevation)*(Math.sin(yaw)*x+Math.cos(yaw)*z)+Math.cos(elevation)*y});
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys),safeAspect=Math.max(.1,aspect||1);
 const halfHeight=Math.max((top-bottom)/2,(right-left)/2/safeAspect)*1.12;
 return{halfHeight,halfWidth:halfHeight*safeAspect,centerY:(top+bottom)/2,points};
}
