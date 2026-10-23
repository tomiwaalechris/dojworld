/* Deterministic 72-second, 1080p composition. All hotel and guest data is illustrative. */
(() => {
  const canvas = document.getElementById('film'), c = canvas.getContext('2d');
  const W = 1920, H = 1080, DURATION = 72;
  const P = { dark:'#102d26', deeper:'#091c18', green:'#176b53', lime:'#e3f18e', paper:'#f5f7f4', white:'#fff', ink:'#172b2a', muted:'#75827d', line:'#e7ece8', soft:'#eaf4ef', amber:'#a85f1c', amberSoft:'#fff2df', blue:'#386d91', blueSoft:'#eaf3fa' };
  const scenes = [
    {start:0,end:7,name:'Meet Coastline',caption:'From the first booking to the final balance. One connected hotel workflow.'},
    {start:7,end:15,name:'Your day at a glance',tag:'01 / THE OVERVIEW',title:['Know your','hotel’s next','move.'],body:['See occupancy, arrivals and','departures in one dashboard.'],caption:'Start with a clear view of your rooms and today’s guest activity.'},
    {start:15,end:26,name:'Availability & reservations',tag:'02 / THE RESERVATION',title:['Find a room.','Make it','official.'],body:['Check availability. Choose dates.','Confirm the agreed nightly price.'],caption:'Choose available dates, enter guest details and confirm the reservation.'},
    {start:26,end:35,name:'Check-in',tag:'03 / THE WELCOME',title:['A prepared','room. A smooth','arrival.'],body:['Find today’s arriving guest.','Check them into a ready room.'],caption:'At the front desk, verify the guest and ready room, then check in.'},
    {start:35,end:46,name:'Guest folios & payments',tag:'04 / THE GUEST BILL',title:['Every charge.','Every payment.','One folio.'],body:['Post room nights and extras.','Apply deposits and record payments.'],caption:'Bring charges and payments together. Settle the balance before checkout.'},
    {start:46,end:55,name:'Housekeeping',tag:'05 / THE NEXT STAY',title:['Check out.','Clean up.','Welcome again.'],body:['Follow room status from dirty','to clean and inspected.'],caption:'After checkout, prepare and inspect the room for the next arrival.'},
    {start:55,end:65,name:'Financial reports',tag:'06 / THE BUSINESS VIEW',title:['Turn hotel','activity into','clarity.'],body:['Review posted revenue, expenses','and the financial reports.'],caption:'Review profit and loss, balances, cash flow and guest receivables.'},
    {start:65,end:72,name:'One connected workflow',caption:'Coastline PMS. A clearer way to run your hotel.'}
  ];
  const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
  const ease = x => 1-Math.pow(1-clamp(x),3);
  const range = (t,a,b) => ease((t-a)/(b-a));
  const lerp = (a,b,p) => a+(b-a)*p;
  const money = n => '₦'+Math.round(n).toLocaleString('en-NG');
  function box(x,y,w,h,r=14,fill=P.white,stroke=null) {
    c.beginPath(); c.roundRect(x,y,w,h,r);
    if(fill){c.fillStyle=fill;c.fill()} if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke()}
  }
  function text(s,x,y,size=24,color=P.ink,weight=450,align='left') {
    c.font=`${weight} ${size}px Geist, Arial, sans-serif`;c.textAlign=align;c.textBaseline='alphabetic';c.fillStyle=color;c.fillText(s,x,y);
  }
  function line(x,y,x2,y2,color=P.line,width=1) { c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke() }
  function circle(x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill()}
  function pill(label,x,y,color=P.green,bg=P.soft,size=17) {
    c.font=`600 ${size}px Geist,Arial,sans-serif`;const w=c.measureText(label).width+28;
    box(x,y,w,34,17,bg);text(label,x+14,y+23,size,color,600);return w;
  }
  function button(label,x,y,w=190,primary=true) {box(x,y,w,44,9,primary?P.green:P.white,primary?null:P.line);text(label,x+w/2,y+29,19,primary?P.white:P.ink,600,'center')}
  function icon(name,x,y,size=24,color=P.green) {
    c.save();c.translate(x,y);c.scale(size/24,size/24);c.strokeStyle=color;c.lineWidth=1.7;c.lineCap='round';c.lineJoin='round';
    const path=(pts)=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke()};
    const rect=(x,y,w,h,r=2)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.stroke()};
    if(name==='calendar'){rect(3,5,18,16);path([[3,10],[21,10]]);path([[7,2],[7,7]]);path([[17,2],[17,7]]);path([[7,14],[10,14]]);path([[14,14],[17,14]])}
    else if(name==='bed'){rect(3,10,18,9);rect(5,5,14,5);path([[3,19],[3,22]]);path([[21,19],[21,22]]);path([[12,5],[12,10]])}
    else if(name==='check'){path([[5,12],[10,17],[20,6]])}
    else if(name==='chart'){path([[3,3],[3,21],[22,21]]);path([[7,16],[7,12]]);path([[12,16],[12,8]]);path([[17,16],[17,4]])}
    else if(name==='wallet'){rect(3,5,18,15);rect(14,10,8,6);circle(17,13,1,color)}
    else if(name==='spark'){path([[12,2],[15,9],[22,12],[15,15],[12,22],[9,15],[2,12],[9,9],[12,2]])}
    else if(name==='door'){rect(5,3,13,18);path([[11,14],[13,14]]);path([[2,21],[22,21]])}
    else if(name==='users'){c.beginPath();c.arc(9,7,4,0,Math.PI*2);c.stroke();path([[2,21],[2,18],[5,14],[13,14],[16,18],[16,21]]);path([[18,4],[21,7],[18,10]]);path([[20,15],[23,18],[23,21]])}
    else {rect(3,3,7,7);rect(14,3,7,7);rect(3,14,7,7);rect(14,14,7,7)}
    c.restore();
  }
  function brand(x,y,scale=1,light=true){c.save();c.translate(x,y);c.scale(scale,scale);box(0,0,48,48,14,P.lime);text('C',24,34,32,P.dark,800,'center');text('Coastline',63,29,29,light?P.white:P.dark,700);text('HOTEL OPERATIONS',64,48,10,light?'#a6bfb2':P.muted,550);c.restore()}
  function shadow(fn) {c.save();c.shadowColor='#00000030';c.shadowBlur=34;c.shadowOffsetY=16;fn();c.restore()}
  function field(label,value,x,y,w=320){text(label,x,y,16,P.muted,550);box(x,y+12,w,48,8,P.white,P.line);text(value,x+14,y+43,20,P.ink,500)}
  function reveal(p,fn,dx=0,dy=25) {c.save();c.globalAlpha*=clamp(p);c.translate(dx*(1-p),dy*(1-p));fn();c.restore()}
  function cursor(x,y,t,start) {
    const p=range(t,start,start+.5); if(p===0)return;
    c.save();c.globalAlpha*=clamp((t-start)*3);c.translate(x+80*(1-p),y+70*(1-p));
    c.beginPath();c.moveTo(0,0);c.lineTo(0,28);c.lineTo(8,21);c.lineTo(15,35);c.lineTo(21,32);c.lineTo(14,18);c.lineTo(27,17);c.closePath();c.fillStyle=P.dark;c.fill();c.strokeStyle=P.white;c.lineWidth=2;c.stroke();c.restore();
    if(t>start+.7&&t<start+1.3){c.save();c.globalAlpha*=1-(t-start-.7)/.6;c.strokeStyle=P.green;c.lineWidth=3;c.beginPath();c.arc(x,y,14+65*(t-start-.7),0,Math.PI*2);c.stroke();c.restore()}
  }
  function toast(label,x,y,p) {c.font='550 20px Geist,Arial,sans-serif';const w=c.measureText(label).width+78;reveal(p,()=>{shadow(()=>box(x,y,w,56,12,P.dark));circle(x+28,y+28,14,P.lime);icon('check',x+18,y+18,20,P.dark);text(label,x+54,y+35,20,P.white,550)},0,16)}
  function bg(t){
    const grad=c.createLinearGradient(0,0,W,H);grad.addColorStop(0,'#14392f');grad.addColorStop(.55,P.dark);grad.addColorStop(1,P.deeper);c.fillStyle=grad;c.fillRect(0,0,W,H);
    const glow=c.createRadialGradient(1540,260,0,1540,260,950);glow.addColorStop(0,'#37664328');glow.addColorStop(1,'#37664300');c.fillStyle=glow;c.fillRect(0,0,W,H);
    c.save();c.strokeStyle='#b8d7b10a';c.lineWidth=1;for(let k=0;k<12;k++){const y=180+k*78; c.beginPath();c.moveTo(0,y);c.bezierCurveTo(560,y-110+Math.sin(t*.18+k)*15,1400,y+130,1920,y-25);c.stroke()}c.restore();
  }
  function shell(screen,t,fn) {
    c.save();c.translate(758,174);
    shadow(()=>box(0,0,1080,716,20,P.paper));
    c.save();c.beginPath();c.roundRect(0,0,1080,716,20);c.clip();
    box(0,0,1080,42,0,'#edf1ec');[0,1,2].forEach(i=>circle(24+i*19,21,5,['#ca8d80','#d8c081','#96b996'][i]));text('COASTLINE PMS  /  PRODUCT WALKTHROUGH',540,27,12,P.muted,600,'center');
    box(0,42,180,674,0,P.dark);brand(18,65,.72);box(14,124,152,66,9,'#1c4a3f','#42675d');text('PROPERTY',27,146,11,'#b2c7bb',600);text('Calabar Hotel',27,171,17,P.white,600);
    const nav=[['Dashboard','grid'],['Reservations','calendar'],['Front Desk','door'],['Rooms','bed'],['Housekeeping','spark'],['Accounting','wallet'],['Reports','chart'],['Staff','users'],['Settings','grid']];
    text('WORKSPACE',25,222,11,'#91b19e',600);nav.forEach(([label,name],i)=>{const y=239+i*42,active=label===screen;if(active)box(14,y,152,36,8,P.lime);icon(name,25,y+8,20,active?P.dark:'#b5cbbd');text(label,55,y+24,14,active?P.dark:'#c9d9ce',active?650:450)});
    text('ILLUSTRATIVE',24,650,10,'#a7c2b2',600);text('SAMPLE DATA',24,666,10,'#a7c2b2',600);line(18,681,163,681,'#42675d');circle(34,701,10,P.lime);text('Owner workspace',53,706,11,'#cfdfd3',450);
    box(180,42,900,64,0,P.white);line(180,106,1080,106);text('Calabar Hotel  /  '+screen,212,81,17,P.muted,500);circle(1040,73,17,'#d0e3ba');text('CO',1040,79,13,P.dark,650,'center');
    c.save();c.translate(212,142);fn();c.restore();c.restore();c.restore();
  }
  function panelTitle(title,subtitle){text(title,0,31,34,P.ink,650);text(subtitle,0,62,17,P.muted)}
  function dashboard(t) {shell('Dashboard',t,()=>{
    panelTitle('Your hotel, at a glance','Tuesday, 13 October · Calabar Hotel');
    const cards=[['Occupied rooms',18,'of 24 rooms','bed'],['Arrivals today',3,'Expected guests','door'],['Departures today',2,'Due to check out','calendar']];
    cards.forEach(([label,n,small,name],i)=>reveal(range(t,.4+i*.16,1.2+i*.16),()=>{const x=i*276;box(x,94,258,138,12,P.white,P.line);icon(name,x+216,111,23);text(label,x+20,127,17,P.muted,500);text(String(Math.round(n*range(t,.55,2))),x+20,181,43,P.ink,650);text(small,x+20,211,14,P.muted)}));
    box(0,252,532,247,12,P.white,P.line);text('Room occupancy trend',22,288,21,P.ink,600);text('Occupied rooms · illustrative week',22,314,15,P.muted);[0,1,2].forEach(i=>line(30,350+i*54,508,350+i*54));
    const pts=[[32,444],[104,422],[184,429],[264,383],[344,398],[424,364],[505,349]];c.save();c.beginPath();c.rect(24,334,490*range(t,1,3.3),150);c.clip();c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=P.green;c.lineWidth=4;c.stroke();c.lineTo(505,465);c.lineTo(32,465);c.closePath();c.fillStyle='#176b5310';c.fill();c.restore();text('07 OCT',30,483,11,P.muted);text('13 OCT',449,483,11,P.muted);
    box(550,252,260,247,12,P.white,P.line);text('Today’s occupancy',574,288,20,P.ink,600);c.save();c.strokeStyle=P.soft;c.lineWidth=19;c.beginPath();c.arc(680,389,62,0,Math.PI*2);c.stroke();c.strokeStyle=P.green;c.beginPath();c.arc(680,389,62,-Math.PI/2,-Math.PI/2+Math.PI*1.5*range(t,1.1,3.2));c.stroke();c.restore();text(Math.round(75*range(t,1.1,3.2))+'%',680,400,35,P.green,650,'center');text('18 of 24 rooms',680,487,15,P.muted,500,'center');
    if(t>4)toast('Today’s arrivals are ready to review',210,448,range(t,4,4.7));
  })}
  function calendar(t){shell('Reservations',t,()=>{
    panelTitle('Reservations','Choose a room night to start a booking');button('New reservation',600,4,210);
    box(0,91,816,410,12,P.white,P.line);text('Availability calendar',22,130,22,P.ink,600);pill('Available',585,108);text('13–19 October 2026',22,162,16,P.muted);
    const cw=90,rh=57,x0=169,y0=189;['TUE 13','WED 14','THU 15','FRI 16','SAT 17','SUN 18','MON 19'].forEach((d,i)=>text(d,x0+i*cw+cw/2,y0+18,12,P.muted,650,'center'));
    const rooms=['101 · Standard','102 · Standard','204 · Deluxe','205 · Deluxe','308 · Suite'];
    rooms.forEach((r,j)=>{const y=y0+32+j*rh;text(r,17,y+35,17,P.ink,550);for(let i=0;i<7;i++){const busy=(j===0&&i<3)||(j===1&&i>3)||(j===3&&i<5)||(j===4&&i>2);box(x0+i*cw,y,cw-5,rh-5,5,busy?'#eee6d3':P.soft);text(busy?'Booked':'Free',x0+i*cw+42,y+31,14,busy?P.amber:P.green,500,'center')}});
    if(t>1){const p=range(t,1,2);c.save();c.globalAlpha=p;box(x0,y0+32+2*rh,cw*2-5,rh-5,5,P.lime,P.green);text('Selected · 2 nights',x0+87,y0+32+2*rh+31,15,P.dark,650,'center');c.restore();cursor(x0+55,y0+32+2*rh+25,t,1)}
    if(t>3.6){const p=range(t,3.6,4.2);c.save();c.globalAlpha=p;c.fillStyle='#172b2a35';c.fillRect(-32,-36,900,610);reveal(p,()=>{
      shadow(()=>box(134,-8,640,523,16,P.white));text('New reservation',163,34,28,P.ink,650);text('Guest details and agreed room price',163,63,16,P.muted);
      field('GUEST NAME','Ada Okon',163,98,579);field('ARRIVAL','13 Oct 2026',163,187,276);field('DEPARTURE','15 Oct 2026',465,187,277);field('ROOM','204 · Deluxe',163,276,579);
      box(163,355,579,66,10,P.soft);text('2 nights × ₦85,000',183,382,19,P.green,550);text('Quoted total',183,405,14,P.muted);text('₦170,000',722,394,28,P.green,650,'right');
      text('A booking quote is separate from posted revenue.',163,449,14,P.muted);button('Confirm reservation',472,464,270);
      if(t>7){cursor(659,485,t,7);toast('Reservation confirmed · Room 204',240,478,range(t,8.3,8.8))}
    },0,30);c.restore()}
  })}
  function checkin(t){shell('Front Desk',t,()=>{
    panelTitle('Front desk','Arrivals and in-house guests');pill('Today’s arrivals',0,93);
    box(0,150,816,338,14,P.white,P.line);text('GUEST',26,188,13,P.muted,600);text('ROOM',363,188,13,P.muted,600);text('STATUS',580,188,13,P.muted,600);line(0,210,816,210);
    circle(53,260,26,'#d0e3ba');text('AO',53,268,19,P.dark,650,'center');text('Ada Okon',96,252,24,P.ink,650);text('13–15 Oct · 2 nights',96,281,17,P.muted);text('204 · Deluxe',363,255,21,P.ink,600);pill('Inspected',363,270);pill(t>5.3?'In-house':'Confirmed',580,243);
    box(26,330,764,72,10,P.soft);icon('check',46,350,28);text('Room 204 is inspected and ready for check-in',88,373,21,P.green,550);
    button(t>5.3?'Open folio':'Check in',580,425,208);text('Guest and room details verified',26,453,17,P.muted);
    if(t>3.5&&t<6.4)cursor(694,446,t,3.5);if(t>5.3)toast('Ada Okon is now checked in',226,470,range(t,5.3,5.9));
  })}
  function folio(t){shell('Front Desk',t,()=>{
    panelTitle('Guest folio','Ada Okon · Room 204 · 13–15 October');pill('Departure day · 15 Oct',573,0,P.blue,P.blueSoft,14);
    box(0,95,816,363,12,P.white,P.line);text('Posted charges',24,135,22,P.ink,600);text('AMOUNT',790,135,13,P.muted,550,'right');line(0,153,816,153);
    [['Room night · 13 Oct',85000],['Room night · 14 Oct',85000],['Laundry · Guest services',10000]].forEach(([s,n],i)=>reveal(range(t,.5+i*.5,1.1+i*.5),()=>{text(s,24,190+i*49,19,P.ink,500);text(money(n),788,190+i*49,21,P.ink,550,'right');line(24,205+i*49,792,205+i*49)}));
    const applied=t>4.2,paid=t>7.2;const balance=paid?0:applied?130000:180000;
    text('Advance deposit',24,348,19,P.muted);text(applied?'₦50,000 applied':'₦50,000 held separately',788,348,18,P.green,550,'right');
    text('Guest payment',24,388,19,P.muted);text(paid?'₦130,000 recorded':'Awaiting payment',788,388,18,paid?P.green:P.muted,550,'right');
    box(18,411,780,76,10,paid?P.lime:P.soft);text('Balance due',39,456,23,P.dark,600);text(money(balance),774,460,34,P.dark,650,'right');
    text(paid?'Balance settled · No unapplied deposit':'Post room nights, then settle the guest balance.',0,528,16,P.muted);
    button(paid?'Check out':applied?'Record payment':'Apply deposit',574,503,238);
    if(t>2.7&&t<4.5)cursor(690,523,t,2.7);if(t>5.7&&t<7.4)cursor(690,523,t,5.7);if(t>8.2){cursor(690,523,t,8.2);toast('Checked out · Room sent to housekeeping',200,456,range(t,9.3,9.8))}
  })}
  function housekeeping(t){shell('Housekeeping',t,()=>{
    panelTitle('Housekeeping','Prepare rooms for their next guests');['Dirty','Clean','Inspected'].forEach((s,i)=>pill(s,i*135,92,i===0?P.amber:P.green,i===0?P.amberSoft:P.soft));
    const state=t<3?'Dirty':t<5.9?'Clean':'Inspected';
    [204,205,308].forEach((n,i)=>reveal(range(t,i*.2,.8+i*.2),()=>{
      const x=i*277;box(x,154,259,306,14,P.white,P.line);icon('bed',x+24,181,34);text('Room '+n,x+24,255,29,P.ink,650);text(i===2?'Suite':'Deluxe',x+24,286,18,P.muted);
      const s=i===0?state:i===1?'Clean':'Inspected';pill(s,x+24,306,s==='Dirty'?P.amber:P.green,s==='Dirty'?P.amberSoft:P.soft);text(i===0?(state==='Dirty'?'Waiting for cleaning':state==='Clean'?'Ready for inspection':'Ready for check-in'):'Room ready',x+24,380,17,P.muted);
      if(i===0)button(state==='Dirty'?'Mark clean':state==='Clean'?'Mark inspected':'Inspected ✓',x+20,401,219,s!=='Inspected');
    }));
    box(0,485,813,79,12,P.soft);icon('spark',24,511,30);text('A clear handoff between front desk and housekeeping',76,531,20,P.green,550);
    if(t>1.6&&t<3.2)cursor(155,427,t,1.6);if(t>4.4&&t<6.1)cursor(155,427,t,4.4);if(t>6.3)toast('Room 204 is ready for the next guest',220,429,range(t,6.3,6.9));
  })}
  function finance(t){shell('Reports',t,()=>{
    panelTitle('Finance & reports','Illustrative posted activity from Ada’s stay');pill('Profit & loss',633,0);
    [['Posted revenue',180000],['Expenses',30000],['Net profit',150000]].forEach(([label,n],i)=>reveal(range(t,i*.2,.8+i*.2),()=>{const x=i*276;box(x,98,259,129,12,i===2?P.lime:P.white,i===2?null:P.line);text(label,x+20,132,17,i===2?P.dark:P.muted,550);text(money(n*range(t,.4,2.1)),x+20,184,32,i===2?P.dark:P.ink,650);text('Illustrative stay activity',x+20,209,13,i===2?P.dark:P.muted)}));
    box(0,249,492,269,12,P.white,P.line);text('Revenue by department',22,286,22,P.ink,600);
    [['Accommodation',170000],['Guest services',10000]].forEach(([label,n],i)=>{const y=325+i*89;text(label,22,y,18,P.ink,500);text(money(n),469,y,19,P.green,600,'right');box(22,y+18,448,16,8,P.soft);box(22,y+18,Math.max(2,448*n/180000*range(t,1.6+i*.2,3.4+i*.2)),16,8,P.green)});text('Room nights and extras count when posted.',22,493,15,P.muted);
    box(510,249,303,269,12,P.white,P.line);text('Financial statements',531,286,21,P.ink,600);['Profit & loss','Balance sheet','Cash-flow statement','Guest receivables'].forEach((s,i)=>{icon('check',531,318+i*44,20,P.green);text(s,561,334+i*44,17,P.ink,500)});
    if(t>4.3)toast('Review the books across your hotel activity',202,488,range(t,4.3,4.9));
  })}
  function intro(t){
    const p=range(t,.1,1.3);reveal(p,()=>brand(791,120,1.5),0,15);
    c.save();c.globalAlpha=.15*range(t,.2,1.8);for(let i=0;i<3;i++){c.strokeStyle='#a9c38e';c.lineWidth=1;c.beginPath();c.ellipse(960,486,555+i*130,210+i*72,0,0,Math.PI*2);c.stroke()}c.restore();
    reveal(range(t,.5,1.55),()=>text('Your hotel.',960,437,118,P.white,650,'center'),0,35);
    reveal(range(t,.8,1.9),()=>text('One connected day.',960,569,108,P.lime,650,'center'),0,35);
    reveal(range(t,1.5,2.5),()=>text('Rooms, guests and finances — working together.',960,639,30,'#b5cbbb',450,'center'),0,22);
    const steps=[['Reserve','calendar'],['Welcome','door'],['Settle','wallet'],['Review','chart']];
    steps.forEach(([label,name],i)=>reveal(range(t,2.2+i*.25,3+i*.25),()=>{const x=390+i*310;box(x,735,270,100,18,'#1c4236','#3f6251');icon(name,x+24,766,34,P.lime);text(label,x+76,796,27,P.white,550);if(i<3){text('→',x+290,796,24,'#8cab97',450,'center')}},0,25));
    text('COASTLINE PMS',90,83,17,'#c3d4c2',600);text('PRODUCT WALKTHROUGH',1830,83,16,'#c3d4c2',500,'right');
  }
  function outro(t){
    reveal(range(t,0,.8),()=>brand(777,156,1.65),0,20);
    reveal(range(t,.35,1.25),()=>text('Run the hotel.',960,411,112,P.white,650,'center'),0,30);
    reveal(range(t,.65,1.6),()=>text('See the whole picture.',960,531,100,P.lime,650,'center'),0,30);
    reveal(range(t,1.1,2.1),()=>text('Coastline PMS brings your hotel’s daily work together.',960,611,31,'#b5cbbb',450,'center'),0,20);
    const steps=['Reservations','Front desk','Housekeeping','Finance'];let xx=388;
    steps.forEach((s,i)=>{reveal(range(t,1.8+i*.17,2.6+i*.17),()=>{box(xx,710,265,67,13,'#1c4236','#3f6251');text(s,xx+132.5,753,24,P.white,550,'center')},0,15);xx+=294});
    reveal(range(t,2.5,3.4),()=>{text('Set up your property. Invite your team. Start the day.',960,851,26,'#d6e4ce',450,'center')});
  }
  function draw(t){
    t=clamp(t,0,DURATION-.001);bg(t);const idx=scenes.findIndex(s=>t>=s.start&&t<s.end),s=scenes[idx],u=t-s.start;
    const alpha=Math.min(range(u,0,.65),clamp((s.end-t)/.45));c.save();c.globalAlpha=alpha;
    if(idx===0)intro(u);else if(idx===7)outro(u);else {
      brand(88,57,.94);text('A DAY WITH COASTLINE',1830,85,16,'#b5cbbb',550,'right');
      reveal(range(u,.05,.65),()=>{text(s.tag,90,239,18,P.lime,600);s.title.forEach((v,i)=>text(v,85,352+i*89,76,P.white,600));s.body.forEach((v,i)=>text(v,90,676+i*36,27,'#b5cbbb',450));line(90,770,405,770,'#3c5b4c');text('COASTLINE PMS',90,809,14,'#92b49f',550)},-30,0);
      reveal(range(u,.1,.8),()=>[null,dashboard,calendar,checkin,folio,housekeeping,finance][idx](u),75,0);
    }
    reveal(range(u,.5,1.2),()=>{text(s.caption,960,976,28,'#e0ead9',450,'center')},0,12);c.restore();
    line(88,1031,1832,1031,'#345345',3);line(88,1031,88+1744*t/DURATION,1031,P.lime,3);
    scenes.forEach((s,i)=>{const x=88+1744*s.start/DURATION;circle(x,1031,idx===i?5:3,idx>=i?P.lime:'#56725f')});text(String(idx+1).padStart(2,'0')+' / 08',88,1064,13,'#99b5a0',550);text('ILLUSTRATIVE SAMPLE DATA',1832,1064,12,'#99b5a0',500,'right');
  }
  window.coastlineFilm={duration:DURATION,scenes,draw,ready:false};
  const renderMode=new URLSearchParams(location.search).has('render');if(renderMode)document.body.classList.add('render');
  let playing=false,position=3.5,last=0;const scrub=document.getElementById('scrub'),play=document.getElementById('play'),time=document.getElementById('time');
  function update(){scrub.value=position;time.textContent=`${Math.floor(position/60)}:${String(Math.floor(position%60)).padStart(2,'0')} / 1:12`;draw(position)}
  play.onclick=()=>{if(position>=72)position=0;playing=!playing;play.textContent=playing?'Pause':'Play';last=performance.now()};scrub.oninput=()=>{position=Number(scrub.value);update()};
  function tick(now){if(playing){position=Math.min(DURATION,position+(now-last)/1000);if(position>=DURATION){playing=false;play.textContent='Replay'}update()}last=now;requestAnimationFrame(tick)}
  document.fonts.load('600 76px Geist').then(()=>document.fonts.ready).then(()=>{update();window.coastlineFilm.ready=true;if(!renderMode)requestAnimationFrame(tick)});
})();
