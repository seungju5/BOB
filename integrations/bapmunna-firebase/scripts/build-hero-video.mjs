// Optional presentation export. The website uses CSS and never downloads this video automatically.
// CRAFT_CANVAS_MODULE may point to the installed @napi-rs/canvas package; FFMPEG to its executable.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage,GlobalFonts}=require(process.env.CRAFT_CANVAS_MODULE||'@napi-rs/canvas');
const assets=fileURLToPath(new URL('../docs/assets/',import.meta.url));
GlobalFonts.registerFromPath(assets+'PretendardVariable.woff2','Pretendard');
GlobalFonts.registerFromPath(assets+'NanumPenScript-Regular.ttf','NanumPen');
const bunny=await loadImage(assets+'bunny.png'),logo=await loadImage(assets+'rice-logo.png');
const canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d');
const output=assets+'bapmunna-hero.mp4';
const encoder=spawn(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','inherit','inherit']});
const complete=once(encoder,'close');
const keys=[[0,0,0,1,1],[.10,0,0,1,1],[.18,10,-3,1.025,.965],[.34,-112,4,.985,1.025],[.47,0,-2,1.035,.96],[.53,0,0,1,1],[.63,-60,-3,.99,1.015],[.75,0,2,1.02,.98],[.88,-7,-1,1,1],[1,0,0,1,1]];
const clamp=x=>Math.max(0,Math.min(1,x));
function pose(t){const p=clamp(t/2.8),i=keys.findIndex(k=>k[0]>=p);if(i<=0)return keys[0].slice(1);const a=keys[i-1],b=keys[i],u=(p-a[0])/(b[0]-a[0]),e=u*u*(3-2*u);return a.slice(1).map((v,j)=>v+(b[j+1]-v)*e);}
function round(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function text(s,x,y,size,weight=500,color='#372b20',font='Pretendard'){ctx.fillStyle=color;ctx.font=`${Math.round(weight/100)*100} ${size}px ${font}`;if(ctx.measureText(s).width>810)throw Error('Text exceeds layout: '+s);ctx.fillText(s,x,y);}
function heart(x,y,size,alpha){ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.globalAlpha=alpha;ctx.fillStyle='#bd725b';ctx.beginPath();ctx.moveTo(0,.2);ctx.bezierCurveTo(-1,-.6,-.9,-1.15,-.35,-1.15);ctx.bezierCurveTo(-.1,-1.15,0,-.9,0,-.8);ctx.bezierCurveTo(.1,-1.15,.9,-1.45,.9,-.65);ctx.bezierCurveTo(.9,-.25,.3,.1,0,.2);ctx.fill();ctx.restore();}
for(let frame=0;frame<165;frame++){
  const t=frame/30,[dy,angle,sx,sy]=pose(t);
  ctx.clearRect(0,0,1920,1080);ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,1920,1080);
  round(960,44,916,992,104,'#f8d14a');
  ctx.fillStyle='#fbe39b';ctx.beginPath();ctx.ellipse(1425,826,330,118,0,0,Math.PI*2);ctx.fill();
  ctx.drawImage(logo,110,98,58,58);text('밥뭇나',180,150,58,400,'#372b20','NanumPen');
  text('안부가',110,352,95,750);text('폴짝,',110,467,95,750);text('찾아왔어요.',110,582,95,750);
  text('따로 살아도, 마음은 가까이.',115,695,30,450,'#74634c');
  round(109,805,622,92,46,'#f8d14a');text('밥 한 끼로 전하는 안부',148,865,36,650);
  text('서로의 하루에, 작은 온기를.',114,966,25,400,'#88795f');
  // Ground stays put as the character lifts, retaining the original illustration intact.
  ctx.save();ctx.globalAlpha=.15+dy/1600;ctx.fillStyle='#665032';ctx.filter='blur(11px)';ctx.beginPath();ctx.ellipse(1425,867,126+dy*.32,19,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.save();ctx.translate(1425,858+dy);ctx.rotate(angle*Math.PI/180);ctx.scale(sx,sy);ctx.drawImage(bunny,-310,-583,620,620);ctx.restore();
  const show=clamp((t-.5)/.5);heart(1740,416-25*Math.sin(clamp(t/2.8)*Math.PI),23,show*.8);
  const hello=clamp((t-2.1)/.5);ctx.save();ctx.globalAlpha=hello;round(1206,169,390,100,44,'#fffaf0');ctx.fillStyle='#fffaf0';ctx.beginPath();ctx.moveTo(1450,262);ctx.lineTo(1473,287);ctx.lineTo(1480,262);ctx.fill();text('반가워요!',1286,237,56,400,'#53402b','NanumPen');ctx.restore();
  const image=canvas.toBuffer('image/png');
  if(frame===105)writeFileSync(assets+'bapmunna-hero-poster.png',image);
  if(!encoder.stdin.write(image))await once(encoder.stdin,'drain');
}
encoder.stdin.end();
const [code]=await complete;if(code!==0)throw Error(`Video export failed: ${code}`);
console.log(`Hero video: ${output} · 1920×1080 · 30 fps · 5.5 s · silent`);
