import fs from 'node:fs';

const W = 320;
const H = 240;
const cx = 160;
const cy = 120;
const radius = 72;
const seed = 1337;
const elapsed = 0.42;

function fract(v){return v-Math.floor(v)}
function hash2(x,y,s){return fract(Math.sin(x*127.1+y*311.7+s*17.13)*43758.5453123)}
function smoothstep(t){return t*t*(3-2*t)}
function valueNoise2D(x,y,s){
  const x0=Math.floor(x), y0=Math.floor(y);
  const tx=x-x0, ty=y-y0;
  const a=hash2(x0,y0,s), b=hash2(x0+1,y0,s), c=hash2(x0,y0+1,s), d=hash2(x0+1,y0+1,s);
  const ux=smoothstep(tx), uy=smoothstep(ty);
  const ab=a+(b-a)*ux, cd=c+(d-c)*ux;
  return ab+(cd-ab)*uy;
}
function fbm(x,y,s){
  let sum=0, amp=0.6, freq=1, norm=0;
  for(let i=0;i<4;i++){ sum += valueNoise2D(x*freq,y*freq,s+i*29)*amp; norm+=amp; freq*=2.05; amp*=0.5; }
  return sum/Math.max(1e-4,norm);
}
function redFromNoise(t){
  if(t<0.34) return 0x160000;
  if(t<0.44) return 0x2a0000;
  if(t<0.58) return 0x4a0000;
  if(t<0.72) return 0x760000;
  if(t<0.86) return 0xaa0000;
  return 0xde0000;
}
function hexToRgb(h){return [(h>>16)&255,(h>>8)&255,h&255]}
function blend(dst,src,a){return Math.round(dst*(1-a)+src*a)}

const data = new Uint8Array(W*H*3);
for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const i=(y*W+x)*3; data[i]=8; data[i+1]=8; data[i+2]=20; }

function put(x,y,rgb,a=1){ if(x<0||y<0||x>=W||y>=H) return; const i=(y*W+x)*3; data[i]=blend(data[i],rgb[0],a); data[i+1]=blend(data[i+1],rgb[1],a); data[i+2]=blend(data[i+2],rgb[2],a); }
function hline(x0,x1,y,rgb,a=1){ const a0=Math.max(0,Math.floor(Math.min(x0,x1))), b0=Math.min(W-1,Math.ceil(Math.max(x0,x1))); for(let x=a0;x<=b0;x++) put(x,y,rgb,a); }
function circleFill(x0,y0,r,rgb,a=1){ const r2=r*r; const yMin=Math.max(0,Math.floor(y0-r)); const yMax=Math.min(H-1,Math.ceil(y0+r)); for(let y=yMin;y<=yMax;y++){ const dy=y-y0; const in2=r2-dy*dy; if(in2<0) continue; const half=Math.sqrt(in2); hline(x0-half,x0+half,y,rgb,a);} }
function circleStroke(x0,y0,r,rgb,a=1){ const steps=Math.max(48,Math.floor(r*8)); for(let i=0;i<steps;i++){ const t=(i/steps)*Math.PI*2; put(Math.round(x0+Math.cos(t)*r),Math.round(y0+Math.sin(t)*r),rgb,a);} }

circleFill(cx,cy,radius,hexToRgb(0xb10000),0.92);
circleFill(cx,cy+radius*0.18,radius*0.62,hexToRgb(0x3a0000),0.35);

const step=Math.max(1,Math.floor(radius/22));
const invR=1/Math.max(1,radius);
const driftX=elapsed*0.85, driftY=elapsed*-0.63;
const noiseScale=4.4;
for(let py=-Math.floor(radius); py<=Math.floor(radius); py+=step){
  for(let px=-Math.floor(radius); px<=Math.floor(radius); px+=step){
    const nx=px*invR, ny=py*invR;
    const d2=nx*nx+ny*ny;
    if(d2>1) continue;
    const edgeFade=1-Math.pow(d2,1.35);
    const n=fbm((nx+driftX)*noiseScale,(ny+driftY)*noiseScale,seed);
    const m=fbm((nx-driftY*0.5)*(noiseScale*1.8),(ny+driftX*0.4)*(noiseScale*1.8),seed+101);
    const mix=n*0.72+m*0.28;
    const x=cx+px, y=cy+py;
    if(mix<0.38){
      const c=hexToRgb(0x090909); for(let yy=0;yy<=step;yy++) for(let xx=0;xx<=step;xx++) put(x+xx,y+yy,c,0.5+edgeFade*0.32);
    } else {
      const c=hexToRgb(redFromNoise(mix)); for(let yy=0;yy<=step;yy++) for(let xx=0;xx<=step;xx++) put(x+xx,y+yy,c,0.35+edgeFade*0.6);
    }
  }
}

circleStroke(cx,cy,radius*0.995,hexToRgb(0xff2a2a),0.42);

const header = Buffer.from(`P6\n${W} ${H}\n255\n`, 'ascii');
const body = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
fs.writeFileSync('/Users/amitbet/workspace/scorched-web/java/nuke_pattern_blob.ppm', Buffer.concat([header, body]));
