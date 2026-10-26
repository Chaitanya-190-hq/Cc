const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'outside-only',url:'https://localhost/',pretendToBeVisual:true});
const w=dom.window,d=w.document;
w.HTMLCanvasElement.prototype.getContext=()=>({setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},arcTo(){},closePath(){},fill(){},stroke(){},save(){},restore(){},setLineDash(){},fillText(){},measureText(t){return{width:t.length*6.5}},font:'',fillStyle:'',strokeStyle:'',lineWidth:0,textAlign:'left'});
w.confirm=()=>true;w.scrollTo=()=>{};
const errs=[];w.onerror=m=>errs.push(m);
w.eval(fs.readFileSync('app.js','utf8'));
const $=s=>d.querySelector(s),$$=s=>Array.from(d.querySelectorAll(s));
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const R=[];const chk=(n,c,x='')=>{R.push(`${c?'PASS':'FAIL'}  ${n}${c?'':'  -> '+x}`)};
chk('boot',errs.length===0,errs.join('|'));
click($('.nav-btn[data-nav="assignments"]'));
chk('assignments view open',$('#view-assignments').hidden===false);
click($('#assignment-filter [data-filter="all"]'));   // keep done items visible
chk('normal mode by default',!$('#view-assignments').classList.contains('selecting'));
chk('selbar hidden by default',$('#selbar').hidden===true);

// tap a card in NORMAL mode
const card=$$('#assignment-list .item')[0];
click(card);
chk('tapping card does NOT enter select mode',!$('#view-assignments').classList.contains('selecting'),$('#view-assignments').className);
chk('tapping card keeps selbar hidden',$('#selbar').hidden===true);
chk('Select button still says Select',$('#btn-select-mode').textContent==='Select',$('#btn-select-mode').textContent);
chk('card not marked selected',$$('#assignment-list .item.selected').length===0);

// normal-mode buttons still work
click($('[data-edit-asg]'));
chk('edit button opens modal',$('#modal-backdrop').hidden===false);
click($('#modal-close'));
chk('modal closes',$('#modal-backdrop').hidden===true);
click($('[data-toggle-asg]'));
chk('mark-submitted still works',$('#modal-backdrop').hidden===true);
click($('[data-add="assignment"]'));
chk('+ Add still works',$('#modal-backdrop').hidden===false);
click($('#modal-close'));

// selection still reachable via the Select button
click($('#btn-select-mode'));
chk('Select button enters select mode',$('#view-assignments').classList.contains('selecting'));
chk('selbar shows',$('#selbar').hidden===false);
click($$('#assignment-list .item')[0]);
chk('card pickable in select mode',$('#sel-count').textContent==='1 selected',$('#sel-count').textContent);
// leaving mode restores the edit buttons
click($('#btn-select-mode'));
chk('Done leaves select mode',!$('#view-assignments').classList.contains('selecting'));
chk('edit buttons visible again',!!$('[data-edit-asg]'));
chk('view not left on tap',$('#view-assignments').hidden===false);

console.log(R.join('\n'));
const f=R.filter(r=>r.startsWith('FAIL')).length;
console.log(`\n${R.length-f}/${R.length} passed`);
process.exit(f?1:0);
