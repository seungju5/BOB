// Local-only video compositor. Requires ffmpeg/ffprobe, macOS `say`, and @napi-rs/canvas.
// Screenshots are captured from the real local app, not invented UI.
// Usage: BAPMUNNA_CANVAS_MODULE=/absolute/path/to/@napi-rs/canvas node scripts/render-introduction.mjs /absolute/output/directory
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.argv[2]||path.join(root,'tmp/introduction'));
const work=path.join(out,'render'),sources=path.join(out,'source');
const require=createRequire(import.meta.url);
const {createCanvas,loadImage,GlobalFonts}=require(process.env.BAPMUNNA_CANVAS_MODULE||'@napi-rs/canvas');
const story=JSON.parse(await readFile(path.join(root,'documentation/introduction-storyboard.json'),'utf8'));
const assets=path.join(root,'docs/assets');
if(!GlobalFonts.registerFromPath(path.join(assets,'PretendardVariable.woff2'),'Pretendard'))throw Error('Korean body font did not load.');
if(!GlobalFonts.registerFromPath(path.join(assets,'NanumPenScript-Regular.ttf'),'NanumPen'))throw Error('Brand lettering font did not load.');
await mkdir(work,{recursive:true});
const W=1920,H=1080,FPS=24,ink='#3d3024',muted='#77654e',cream='#fffcf5',sun='#f8d14a';
const logo=await loadImage(path.join(assets,'rice-logo.png'));
const bunny=await loadImage(path.join(assets,'bunny-natural.png'));
function run(binary,args){return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr=(stderr+data).slice(-16000));
  child.on('error',reject);child.on('close',code=>code?reject(Error(`${binary} exited ${code}: ${stderr}`)):resolve(stdout));
});}
function font(ctx,size,weight=500,family='Pretendard'){ctx.font=`${Math.round(weight/100)*100} ${size}px ${family}`;ctx.textBaseline='top';}
function text(ctx,value,x,y,size=34,color=ink,weight=500,maxWidth=1080){
  ctx.fillStyle=color;font(ctx,size,weight);if(ctx.measureText(value).width>maxWidth)throw Error(`Text overflows: ${value}`);ctx.fillText(value,x,y);
}
function box(ctx,x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function paragraph(ctx,lines,x,y,size=36,gap=56,color=muted,weight=400,maxWidth=1060){lines.forEach((line,i)=>text(ctx,line,x,y+i*gap,size,color,weight,maxWidth));}
function base(scene,index){
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');ctx.fillStyle=['welcome','together'].includes(scene.id)?sun:cream;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#c5b79155';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(120,142);ctx.lineTo(1800,142);ctx.stroke();
  ctx.drawImage(logo,120,63,53,53);font(ctx,54,400,'NanumPen');ctx.fillStyle=ink;ctx.fillText('밥뭇나',188,63);
  box(ctx,1410,66,390,46,23,['welcome','together'].includes(scene.id)?'#fff8e18c':'#f3eddf');text(ctx,'가상 데이터 · 서비스 시제품',1440,77,23,ink,500,340);
  text(ctx,scene.eyebrow,120,230,26,muted,600,1080);
  const titleSize=['welcome','together'].includes(scene.id)?112:84;
  paragraph(ctx,scene.headline,120,307,titleSize,titleSize*1.31,ink,750,1150);
  paragraph(ctx,scene.body,124,655,34,55,muted,450,1100);
  text(ctx,'BAPMUNNA / PRODUCT STORY',120,1047,17,muted,500,650);
  text(ctx,`${String(index+1).padStart(2,'0')} / ${String(story.scenes.length).padStart(2,'0')}`,1716,1047,18,muted,500,100);
  if(scene.id==='question'){
    box(ctx,1220,330,560,190,35,'#f8e9b9');text(ctx,'멀리 있는 가족',1260,364,24,muted,500,470);text(ctx,'오늘은 잘 지내실까?',1260,420,37,ink,650,470);
    box(ctx,1135,565,560,190,35,'#ebeede');text(ctx,'어르신의 평소 하루',1175,600,24,muted,500,470);text(ctx,'늘 하던 대로, 편안하게.',1175,654,37,ink,650,480);
    ctx.strokeStyle='#b9a16b';ctx.lineWidth=2;ctx.setLineDash([3,10]);ctx.beginPath();ctx.moveTo(1490,521);ctx.bezierCurveTo(1490,540,1410,540,1410,565);ctx.stroke();ctx.setLineDash([]);
  }
  if(scene.id==='welcome'||scene.id==='together'){
    const gradient=ctx.createRadialGradient(1460,565,80,1460,565,390);gradient.addColorStop(0,'#fff7dba6');gradient.addColorStop(1,'#fff7db00');ctx.fillStyle=gradient;ctx.fillRect(1070,200,730,730);
    ctx.fillStyle='#8d6b2720';ctx.beginPath();ctx.ellipse(1470,861,142,16,0,0,Math.PI*2);ctx.fill();
  }
  if(scene.id==='signal'){
    const labels=['밥솥 움직임','끼니 요약','안부 확인'];labels.forEach((label,i)=>{box(ctx,120+i*286,808,252,60,30,i===0?'#f6d668':'#f2ead6');text(ctx,label,146+i*286,824,27,ink,550,220);if(i<2)text(ctx,'→',383+i*286,826,25,muted,400,30);});
  }
  if(scene.id==='senior'){
    ['외식했어요','놀러가요','도움 요청'].forEach((label,i)=>{box(ctx,120+i*272,802,245,70,26,['#f7d65f','#eee5cf','#49382a'][i]);text(ctx,label,155+i*272,823,31,i===2?cream:ink,650,200);});
  }
  if(scene.id==='guardian'){box(ctx,120,805,792,74,26,'#eee8d9');text(ctx,'소식 확인  →  근거 살펴보기  →  직접 안부 묻기',149,830,27,ink,600,735);}
  if(scene.id==='care'){box(ctx,120,806,950,76,26,'#ede9dd');text(ctx,'실제 식사량·건강 판단 / 자동 신고 기능이 아닙니다.',147,831,29,ink,550,900);}
  if(scene.id==='together'){box(ctx,120,806,840,70,26,'#fff5ce');text(ctx,'다음 단계 · 실제 기기와 가족 연동 검증',150,829,29,ink,600,790);}
  return canvas;
}
async function layer(scene){
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  if(scene.screenshot){
    const shot=await loadImage(path.join(sources,scene.screenshot));const x=1330,y=160,w=370,h=w*shot.height/shot.width;
    if(y+h+10>974)throw Error('Screenshot frame exceeds subtitle safe area.');
    ctx.save();ctx.shadowColor='#6c523b23';ctx.shadowBlur=35;ctx.shadowOffsetY=18;box(ctx,x-10,y-10,w+20,h+20,38,'#d5cbb8');ctx.restore();
    box(ctx,x-8,y-8,w+16,h+16,35,'#fffcf5');ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,28);ctx.clip();ctx.drawImage(shot,x,y,w,h);ctx.restore();
  }else if(scene.id==='welcome'||scene.id==='together')ctx.drawImage(bunny,1160,250,630,630);
  return canvas;
}
function captionCard(value){const c=createCanvas(W,H),ctx=c.getContext('2d');box(ctx,120,975,1680,62,20,'#3d3024f5');font(ctx,28,500);const width=ctx.measureText(value).width;if(width>1580)throw Error('Caption too long: '+value);text(ctx,value,(W-width)/2,992,28,cream,500,1580);return c;}
const timestamp=seconds=>{const ms=Math.round(seconds*1000),s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);return `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
// Preflight typography and composition before the slower speech/video pass.
await mkdir(path.join(out,'preview'),{recursive:true});
for(let i=0;i<story.scenes.length;i++){
  const scene=story.scenes[i],stem=path.join(work,scene.id),background=base(scene,i),foreground=await layer(scene);
  if(scene.captions.length!==2||scene.captions.join(' ')!==scene.narration)throw Error('Captions must reproduce the narration exactly: '+scene.id);
  await writeFile(stem+'.png',background.toBuffer('image/png'));
  await writeFile(stem+'-layer.png',foreground.toBuffer('image/png'));
  if(scene.screenshotBefore)await writeFile(stem+'-before-layer.png',(await layer({...scene,screenshot:scene.screenshotBefore})).toBuffer('image/png'));
  for(let j=0;j<2;j++)await writeFile(stem+`-caption-${j}.png`,captionCard(scene.captions[j]).toBuffer('image/png'));
  const preview=background.getContext('2d');preview.drawImage(foreground,0,0);preview.drawImage(captionCard(scene.captions[0]),0,0);
  await writeFile(path.join(out,'preview',scene.id+'.jpg'),background.toBuffer('image/jpeg'));
}
if(process.env.BAPMUNNA_VIDEO_FRAMES_ONLY==='1'){console.log('Composition preflight complete.');process.exit(0);}
let elapsed=0,srt='',cue=1;const manifest=[];
for(let i=0;i<story.scenes.length;i++){
  const scene=story.scenes[i],stem=path.join(work,scene.id),voice=stem+'.wav';
  const voiceParts=[];
  // Render one audio segment per subtitle so the open captions follow the voice,
  // rather than dividing a scene in half regardless of sentence length.
  for(let j=0;j<2;j++){
    const part=stem+`-voice-${j}.aiff`;
    await run('say',['-v',story.voice,'-r',String(story.rate),'-o',part,scene.captions[j]]);
    const seconds=Number((await run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',part])).trim());
    if(!Number.isFinite(seconds)||seconds<.3)throw Error('Narration did not render: '+scene.id);
    voiceParts.push({part,seconds});
  }
  const pause=.18,lead=.45,voiceSeconds=voiceParts[0].seconds+pause+voiceParts[1].seconds;
  const captionBreak=lead+voiceParts[0].seconds+pause;
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',voiceParts[0].part,'-i',voiceParts[1].part,'-filter_complex',`[0:a]aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${pause}[first];[1:a]aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo[second];[first][second]concat=n=2:v=0:a=1[a]`,'-map','[a]','-c:a','pcm_s16le',voice]);
  const duration=Math.ceil(Math.max(scene.minimumDuration,voiceSeconds+1.3)*FPS)/FPS;
  const jump=scene.id==='welcome'?"-44*abs(sin(PI*t/0.9))*lt(t,1.8)":'0';
  const slide=scene.screenshot?"36*max(0,1-t/0.7)":'0';
  const before=scene.screenshotBefore?`[4:v]fade=t=out:st=${scene.transitionAt}:d=0.35:alpha=1[before];[art][before]overlay=x='${slide}'[scene];`:'[art]null[scene];';
  const audioIndex=scene.screenshotBefore?5:4;
  const filter=`[0:v][1:v]overlay=x='${slide}':y='${jump}'[art];${before}[scene][2:v]overlay=enable='between(t,${lead},${captionBreak})'[first];[first][3:v]overlay=enable='gte(t,${captionBreak})',fade=t=in:st=0:d=0.22:color=0xfffcf5,fade=t=out:st=${duration-.25}:d=0.25:color=0xfffcf5,format=yuv420p[v];[${audioIndex}:a]adelay=450|450,apad,afade=t=out:st=${duration-.3}:d=0.3[a]`;
  const inputs=[stem+'.png',stem+'-layer.png',stem+'-caption-0.png',stem+'-caption-1.png',...(scene.screenshotBefore?[stem+'-before-layer.png']:[])].flatMap(file=>['-loop','1','-framerate',String(FPS),'-i',file]);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y',...inputs,'-i',voice,'-filter_complex_threads','2','-filter_complex',filter,'-map','[v]','-map','[a]','-t',String(duration),'-r',String(FPS),'-c:v','libx264','-preset','fast','-crf','20','-threads','2','-c:a','aac','-b:a','160k','-ar','48000','-ac','2','-movflags','+faststart',stem+'.mp4']);
  const captionWindows=[[lead,captionBreak-.02],[captionBreak,duration-.25]];
  for(let j=0;j<2;j++){srt+=`${cue++}\n${timestamp(elapsed+captionWindows[j][0])} --> ${timestamp(elapsed+captionWindows[j][1])}\n${scene.captions[j]}\n\n`;}
  manifest.push({scene:scene.id,start:elapsed,duration,narrationSeconds:voiceSeconds,captionWindows,screen:scene.screenshot||null,beforeScreen:scene.screenshotBefore||null,transitionAt:scene.transitionAt||null});elapsed+=duration;
  console.log(`Rendered ${i+1}/${story.scenes.length}: ${scene.id} (${duration.toFixed(2)}s)`);
}
// The manifest only contains our known generated segments, never user-selected paths.
await writeFile(path.join(work,'segments.txt'),story.scenes.map(scene=>`file '${scene.id}.mp4'`).join('\n')+'\n');
const output=path.join(out,'bapmunna-introduction.mp4');
await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','1','-i',path.join(work,'segments.txt'),'-c','copy','-movflags','+faststart',output]);
await writeFile(path.join(out,'bapmunna-introduction.srt'),srt);
await writeFile(path.join(out,'storyboard.json'),JSON.stringify({...story,timing:manifest,duration:elapsed,credits:{voice:'macOS Yuna synthetic Korean voice',music:'None',visuals:'Existing Bapmunna brand assets and real local app screenshots'}},null,2)+'\n');
await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss','3','-i',output,'-frames:v','1',path.join(out,'cover.jpg')]);
console.log(JSON.stringify({output,duration:elapsed,bytes:(await stat(output)).size,scenes:manifest.length}));
