/* A location estimate is not an address. Include both reported uncertainties. */
(function(root){
 function valid(p){return p && Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90 &&
  Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180 && Number.isFinite(p.accuracy)&&p.accuracy>=0}
 function within(a,b,radiusKm){
  if(!valid(a)||!valid(b)||!Number.isInteger(radiusKm)||radiusKm<1||radiusKm>20)return false;
  const rad=Math.PI/180,h=Math.sin((a.latitude-b.latitude)*rad/2)**2+
   Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((a.longitude-b.longitude)*rad/2)**2;
  // Conservative upper bound on WGS84 surface distance, including near the poles.
  const meters=12800000*Math.asin(Math.sqrt(Math.min(1,h)));
  return meters+a.accuracy+b.accuracy<=radiusKm*1000;
 }
 const api={within};if(typeof module!=='undefined')module.exports=api;else root.MomentoProximity=api;
})(globalThis);
