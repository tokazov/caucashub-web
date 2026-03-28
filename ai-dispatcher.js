// ── AI DISPATCHER v2 ──────────────────────────────────
let aiOpen=false;
let aiRole=null; // 'carrier' | 'shipper' | null
let aiLoadData={from:null,to:null,desc:null,weight:null,date:null,truck:null,price:null,pay:null};
let aiCarrierData={from:null,to:null,date:null,truck:null,weightCap:null};
let aiStep='greeting'; // greeting | ask_role | carrier_flow | shipper_flow
let aiPendingText=null; // первое сообщение до определения роли

function toggleAI(){
  aiOpen=!aiOpen;
  const chat=document.getElementById('aiChat');
  const fab=document.querySelector('.ai-fab');
  if(!chat) return;
  if(aiOpen){
    chat.classList.add('open');
    if(fab) positionChat(chat, fab);
    setTimeout(()=>document.getElementById('aiInput')?.focus(),100);
  } else {
    chat.classList.remove('open');
  }
}

function closeAI(){
  aiOpen=false;
  const chat=document.getElementById('aiChat');
  if(chat) chat.classList.remove('open');
}

function positionChat(chat, fab){
  const r=fab.getBoundingClientRect();
  const chatW=320;
  const margin=10;
  const gap=10; // зазор между кнопкой и чатом

  // Реальная высота чата после рендера
  chat.style.visibility='hidden';
  chat.style.display='flex';
  const chatH=Math.min(chat.offsetHeight||480, window.innerHeight*0.75);
  chat.style.visibility='';

  // По горизонтали: центрируем чат по кнопке, не выходим за края
  let left=r.left + r.width/2 - chatW/2;
  left=Math.max(margin, Math.min(left, window.innerWidth - chatW - margin));

  // По вертикали: предпочтительно ВЫШЕ кнопки
  let top=r.top - chatH - gap;
  if(top < margin){
    // не влазит сверху — размещаем снизу
    top=r.bottom + gap;
  }
  if(top + chatH > window.innerHeight - margin){
    top=window.innerHeight - chatH - margin;
  }

  chat.style.left=left+'px';
  chat.style.top=top+'px';
  chat.style.right='auto';
  chat.style.bottom='auto';
}

function aiAddMsg(text,type){
  const msgs=document.getElementById('aiMessages');
  if(!msgs) return;
  const div=document.createElement('div');
  div.className='ai-msg '+type;
  div.innerHTML=text;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
  return div;
}

function aiAddRoleButtons(){
  const msgs=document.getElementById('aiMessages');
  if(!msgs) return;
  const div=document.createElement('div');
  div.className='ai-role-btns';
  div.innerHTML='<button class="ai-role-btn" onclick="setRole(\'carrier\')">🚛 Я водитель / Перевозчик</button><button class="ai-role-btn" onclick="setRole(\'shipper\')">📦 Я грузовладелец</button>';
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}

function setRole(role){
  aiRole=role;
  document.querySelectorAll('.ai-role-btns').forEach(el=>el.remove());

  if(role==='carrier'){
    aiStep='carrier_flow';
    // Если было первое сообщение — парсим его сразу
    if(aiPendingText){
      parseCarrier(aiPendingText);
      aiPendingText=null;
      const reply=buildCarrierReply();
      // Если уже есть маршрут — сразу ищем грузы
      if(aiCarrierData.from&&aiCarrierData.to){
        const loads=findMatchingLoads();
        if(loads.length>0){
          aiAddMsg('✅ Нашёл '+loads.length+' груза по маршруту '+aiCarrierData.from+' → '+aiCarrierData.to+'!','bot');
          showMatchingLoads();
          return;
        }
      }
      aiAddMsg(reply,'bot');
    } else {
      aiAddMsg('Отлично! Расскажите о маршруте — откуда и куда едете, когда и какой у вас кузов?','bot');
    }
  } else {
    aiStep='shipper_flow';
    document.getElementById('aiTemplate').style.display='block';
    // Если было первое сообщение — парсим его сразу
    if(aiPendingText){
      parseShipper(aiPendingText);
      aiPendingText=null;
      updateTemplate();
      aiAddMsg(buildShipperReply(),'bot');
    } else {
      aiAddMsg('Хорошо! Расскажите о грузе — можно свободным текстом. Например: "5 тонн плитки из Тбилиси в Батуми завтра за 700 лари"','bot');
    }
  }
}

function detectRole(text){
  const t=text.toLowerCase();
  const carrierWords=['водитель','везу','еду','перевозчик','машина','фура','мой кузов','свободен','ищу груз','нужен груз','нужно груз','найди груз','есть ли груз'];
  const shipperWords=['нужно везти','отправить','хочу отправить','доставить','ищу машину','нужна машина','ищу перевозчика','сколько стоит везти','разместить груз'];
  
  const isCarrier=carrierWords.some(w=>t.includes(w));
  const isShipper=shipperWords.some(w=>t.includes(w));
  
  if(isCarrier&&!isShipper) return 'carrier';
  if(isShipper&&!isCarrier) return 'shipper';
  return null;
}

function parseCarrier(text){
  const t=text.toLowerCase();
  const cities=['тбилиси','батуми','поти','кутаиси','рустави','стамбул','ереван','баку','москва','сочи','алматы','трабзон','анкара'];

  // Ищем порядок городов в тексте с учётом предлогов из/в/до
  const fromMatch=t.match(/из\s+([а-яё]+)/);
  const toMatch=t.match(/(?:в|до)\s+([а-яё]+)/);
  if(fromMatch){
    const c=cities.find(c=>c.startsWith(fromMatch[1].slice(0,4)));
    if(c&&!aiCarrierData.from) aiCarrierData.from=c.charAt(0).toUpperCase()+c.slice(1);
  }
  if(toMatch){
    const c=cities.find(c=>c.startsWith(toMatch[1].slice(0,4)));
    if(c&&!aiCarrierData.to) aiCarrierData.to=c.charAt(0).toUpperCase()+c.slice(1);
  }
  // Fallback: порядок упоминания
  if(!aiCarrierData.from||!aiCarrierData.to){
    const found=cities.filter(c=>t.includes(c));
    if(found[0]&&!aiCarrierData.from) aiCarrierData.from=found[0].charAt(0).toUpperCase()+found[0].slice(1);
    if(found[1]&&!aiCarrierData.to) aiCarrierData.to=found[1].charAt(0).toUpperCase()+found[1].slice(1);
  }

  if(t.includes('сегодня')) aiCarrierData.date='Сегодня';
  else if(t.includes('завтра')) aiCarrierData.date='Завтра';
  const trucks={тент:'Тент',рефриж:'Рефрижератор',борт:'Бортовой',термос:'Термос',фургон:'Фургон',контейн:'Контейнер',автовоз:'Автовоз'};
  for(const[k,v] of Object.entries(trucks)){if(t.includes(k)){aiCarrierData.truck=v;break;}}
  // Вес: "до 1.5 тонны", "максимум 2 тонны", "1500 кг"
  const wm=t.match(/(\d+[.,]?\d*)\s*(тонн|тн\b|кг)/);
  if(wm){let w=parseFloat(wm[1].replace(',','.'));if(wm[2].includes('тонн')||wm[2]==='тн')w*=1000;aiCarrierData.weightCap=Math.round(w);}
}

function findMatchingLoads(){
  const d=aiCarrierData;
  let data=[...LOCAL,...INTL].filter(ld=>ld.status!=='taken');
  if(d.from) data=data.filter(ld=>ld.from.toLowerCase().includes(d.from.toLowerCase().slice(0,4)));
  if(d.to) data=data.filter(ld=>ld.to.toLowerCase().includes(d.to.toLowerCase().slice(0,4)));
  // фильтр по грузоподъёмности — груз не должен превышать возможности машины
  if(d.weightCap) data=data.filter(ld=>ld.kg<=d.weightCap);
  return data.slice(0,3);
}

function buildCarrierReply(){
  const d=aiCarrierData;
  const missing=[];
  if(!d.from) missing.push('откуда едете');
  if(!d.to) missing.push('куда');
  if(!d.date) missing.push('когда');
  if(!d.truck) missing.push('тип кузова');
  
  if(missing.length<=1){
    const loads=findMatchingLoads();
    if(loads.length>0){
      return '✅ Нашёл '+loads.length+' груза по вашему маршруту! Смотрите ниже 👇';
    }
    return '🔍 По вашему маршруту сейчас нет грузов. Я оповещу вас как только появится подходящий!';
  }
  if(missing.length<=2) return 'Отлично! Уточните: '+missing.join(' и ')+'?';
  return 'Понял! Ещё нужно: '+missing.slice(0,2).join(' и ')+'?';
}

function showMatchingLoads(){
  const loads=findMatchingLoads();
  if(!loads.length) return;
  const msgs=document.getElementById('aiMessages');
  loads.forEach(d=>{
    const div=document.createElement('div');
    div.className='ai-msg bot';
    div.style.cssText='background:#fffbf0;border:1px solid #f7b731;border-radius:10px;cursor:pointer;padding:10px 12px;';
    div.innerHTML='<div style="font-weight:700;font-size:13px">'+d.from+' → '+d.to+'</div><div style="font-size:12px;color:#888;margin-top:3px">'+d.kg.toLocaleString()+' кг · '+(d.cur||'₾')+d.price+' · '+d.co+'</div>';
    div.onclick=()=>openCargo(d);
    msgs.appendChild(div);
  });
  msgs.scrollTop=msgs.scrollHeight;
}

function parseShipper(text){
  const t=text.toLowerCase();
  const cities=['тбилиси','батуми','поти','кутаиси','рустави','стамбул','ереван','баку','москва','сочи','алматы'];
  const fromMatch=t.match(/из\s+([а-яё]+)/);
  const toMatch=t.match(/(?:в|до)\s+([а-яё]+)/);
  if(fromMatch){const c=cities.find(c=>c.startsWith(fromMatch[1].slice(0,4)));if(c&&!aiLoadData.from)aiLoadData.from=c.charAt(0).toUpperCase()+c.slice(1);}
  if(toMatch){const c=cities.find(c=>c.startsWith(toMatch[1].slice(0,4)));if(c&&!aiLoadData.to)aiLoadData.to=c.charAt(0).toUpperCase()+c.slice(1);}
  if(!aiLoadData.from||!aiLoadData.to){
    const found=cities.filter(c=>t.includes(c));
    if(found[0]&&!aiLoadData.from) aiLoadData.from=found[0].charAt(0).toUpperCase()+found[0].slice(1);
    if(found[1]&&!aiLoadData.to) aiLoadData.to=found[1].charAt(0).toUpperCase()+found[1].slice(1);
  }
  const wm=t.match(/(\d+)\s*(тонн|тн\b|кг|кило)/);
  if(wm){let w=parseInt(wm[1]);if(wm[2].includes('тонн')||wm[2]==='тн')w*=1000;aiLoadData.weight=w;}
  const pm=t.match(/(\d+)\s*(лари|₾|\$)/);
  if(pm) aiLoadData.price=parseInt(pm[1]);
  if(t.includes('нал')&&!t.includes('безнал')) aiLoadData.pay='Наличные';
  else if(t.includes('безнал')) aiLoadData.pay='Безналичный';
  if(t.includes('сегодня')) aiLoadData.date='Сегодня';
  else if(t.includes('завтра')) aiLoadData.date='Завтра';
  const trucks={тент:'Тент',рефриж:'Рефрижератор',борт:'Бортовой',термос:'Термос',фургон:'Фургон'};
  for(const[k,v] of Object.entries(trucks)){if(t.includes(k)&&!aiLoadData.truck){aiLoadData.truck=v;break;}}
  // Описание груза
  const goods=['плитка','мебель','продукты','оборудование','стройматериал','ткань','текстиль','металл','зерно','химия','авто','машин'];
  for(const g of goods){if(t.includes(g)&&!aiLoadData.desc){aiLoadData.desc=g.charAt(0).toUpperCase()+g.slice(1);break;}}
}

function buildShipperReply(){
  const d=aiLoadData;
  const missing=[];
  if(!d.from) missing.push('откуда');
  if(!d.to) missing.push('куда');
  if(!d.weight) missing.push('вес (кг или тонн)');
  if(!d.date) missing.push('дата загрузки');
  if(missing.length===0) return '✅ Все данные есть! Нажмите кнопку ниже чтобы разместить груз на бирже.';
  if(missing.length<=2) return 'Почти готово! Уточните: '+missing.join(' и ')+'?';
  return 'Понял! Ещё нужно: '+missing.slice(0,2).join(' и ')+'?';
}

function updateTemplate(){
  const d=aiLoadData;
  const filled=[d.from,d.to,d.weight].filter(Boolean).length;
  if(filled>0){
    document.getElementById('aiTemplate').style.display='block';
    document.getElementById('tFrom').textContent=d.from||'—';
    document.getElementById('tTo').textContent=d.to||'—';
    document.getElementById('tDesc').textContent=d.desc||'—';
    document.getElementById('tWeight').textContent=d.weight?d.weight+' кг':'—';
    document.getElementById('tDate').textContent=d.date||'—';
    document.getElementById('tTruck').textContent=d.truck||'—';
    document.getElementById('tPrice').textContent=d.price?'₾'+d.price:'—';
    document.getElementById('tPay').textContent=d.pay||'—';
  }
  const ready=d.from&&d.to&&d.weight;
  const btn=document.getElementById('aiPostBtn');
  if(btn) btn.classList.toggle('ready',!!ready);
}

async function aiSend(){
  const input=document.getElementById('aiInput');
  if(!input) return;
  const text=input.value.trim();
  if(!text) return;
  input.value='';input.style.height='auto';
  aiAddMsg(text,'user');

  // Определяем роль если ещё не знаем
  if(!aiRole&&aiStep!=='greeting'){
    const detected=detectRole(text);
    if(detected){
      aiRole=detected;
      aiStep=detected==='carrier'?'carrier_flow':'shipper_flow';
      if(detected==='shipper') document.getElementById('aiTemplate').style.display='block';
    }
  }

  const typing=aiAddMsg('...','typing');
  await new Promise(r=>setTimeout(r,600));
  if(typing) typing.remove();

  if(aiStep==='greeting'||!aiRole){
    // Пробуем определить роль из первого сообщения
    const detected=detectRole(text);
    if(detected){
      aiRole=detected;
      aiStep=detected==='carrier'?'carrier_flow':'shipper_flow';
      if(detected==='shipper'){
        document.getElementById('aiTemplate').style.display='block';
        parseShipper(text);
        updateTemplate();
        aiAddMsg(buildShipperReply(),'bot');
      } else {
        parseCarrier(text);
        const reply=buildCarrierReply();
        aiAddMsg(reply,'bot');
        if(findMatchingLoads().length>0) showMatchingLoads();
      }
    } else {
      aiStep='ask_role';
      aiPendingText=text; // запоминаем — применим после выбора роли
      aiAddMsg('Привет! Чтобы помочь вам — скажите, вы водитель или грузовладелец?','bot');
      aiAddRoleButtons();
    }
    return;
  }

  if(aiStep==='carrier_flow'){
    parseCarrier(text);
    const reply=buildCarrierReply();
    aiAddMsg(reply,'bot');
    if(findMatchingLoads().length>0&&(aiCarrierData.from&&aiCarrierData.to)) showMatchingLoads();
  } else {
    parseShipper(text);
    updateTemplate();
    aiAddMsg(buildShipperReply(),'bot');
  }
}

function aiPostLoad(){
  if(typeof user==='undefined'||!user){toggleAI();if(typeof openAuth==='function')openAuth('register');return;}
  if(typeof openPostLoad==='function') openPostLoad();
  setTimeout(()=>{
    const d=aiLoadData;
    if(d.from){const el=document.getElementById('pFromAddr');if(el)el.value=d.from;}
    if(d.to){const el=document.getElementById('pToAddr');if(el)el.value=d.to;}
    if(d.weight){const el=document.getElementById('pWeight');if(el)el.value=d.weight;}
    if(d.price){const el=document.getElementById('pPrice');if(el)el.value=d.price;}
    if(d.desc){const el=document.getElementById('pDesc');if(el)el.value=d.desc;}
  },400);
  aiAddMsg('Форму заполнил! Проверьте данные и нажмите "Разместить груз".','bot');
}

function aiStartVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){aiAddMsg('Голосовой ввод: используйте Chrome браузер.','bot');return;}
  const rec=new SR();
  rec.lang='ru-RU';
  const mic=document.querySelector('.ai-mic');
  rec.onstart=()=>{if(mic)mic.textContent='🔴';};
  rec.onresult=(e)=>{
    const t=e.results[0][0].transcript;
    const inp=document.getElementById('aiInput');
    if(inp)inp.value=t;
    aiSend();
  };
  rec.onend=()=>{if(mic)mic.textContent='🎤';};
  rec.start();
}

document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('aiInput');
  if(inp) inp.addEventListener('input',()=>{inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,80)+'px';});
});

// Draggable FAB
(function(){
  const fab = document.querySelector('.ai-fab');
  if(!fab) return;

  // Restore saved position
  const saved = JSON.parse(localStorage.getItem('fabPos')||'null');
  if(saved){
    fab.style.right='auto';
    fab.style.bottom='auto';
    fab.style.left = saved.x + 'px';
    fab.style.top  = saved.y + 'px';
  }

  let dragging=false, startX, startY, origX, origY, moved=false;

  function getPos(){
    const r = fab.getBoundingClientRect();
    return {x: r.left, y: r.top};
  }

  fab.addEventListener('mousedown', e=>{
    if(e.button!==0) return;
    dragging=true; moved=false;
    startX=e.clientX; startY=e.clientY;
    const p=getPos(); origX=p.x; origY=p.y;
    fab.style.transition='none';
    fab.style.right='auto'; fab.style.bottom='auto';
    fab.style.left=origX+'px'; fab.style.top=origY+'px';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e=>{
    if(!dragging) return;
    const dx=e.clientX-startX, dy=e.clientY-startY;
    if(Math.abs(dx)>4||Math.abs(dy)>4) moved=true;
    const nx=Math.max(0,Math.min(window.innerWidth-60,origX+dx));
    const ny=Math.max(0,Math.min(window.innerHeight-60,origY+dy));
    fab.style.left=nx+'px'; fab.style.top=ny+'px';
    // двигаем чат вместе с кнопкой если открыт
    const chat=document.getElementById('aiChat');
    if(chat&&chat.classList.contains('open')) positionChat(chat,fab);
  });

  document.addEventListener('mouseup', e=>{
    if(!dragging) return;
    dragging=false;
    fab.style.transition='';
    if(moved){
      localStorage.setItem('fabPos',JSON.stringify({x:parseFloat(fab.style.left),y:parseFloat(fab.style.top)}));
      e.stopPropagation();
    }
  });

  // Touch support
  fab.addEventListener('touchstart', e=>{
    dragging=true; moved=false;
    const t=e.touches[0];
    startX=t.clientX; startY=t.clientY;
    const p=getPos(); origX=p.x; origY=p.y;
    fab.style.transition='none';
    fab.style.right='auto'; fab.style.bottom='auto';
    fab.style.left=origX+'px'; fab.style.top=origY+'px';
  },{passive:true});

  document.addEventListener('touchmove', e=>{
    if(!dragging) return;
    const t=e.touches[0];
    const dx=t.clientX-startX, dy=t.clientY-startY;
    if(Math.abs(dx)>4||Math.abs(dy)>4) moved=true;
    const nx=Math.max(0,Math.min(window.innerWidth-60,origX+dx));
    const ny=Math.max(0,Math.min(window.innerHeight-60,origY+dy));
    fab.style.left=nx+'px'; fab.style.top=ny+'px';
    const chat=document.getElementById('aiChat');
    if(chat&&chat.classList.contains('open')) positionChat(chat,fab);
    if(moved) e.preventDefault();
  },{passive:false});

  document.addEventListener('touchend', ()=>{
    if(!dragging) return;
    dragging=false;
    fab.style.transition='';
    if(moved) localStorage.setItem('fabPos',JSON.stringify({x:parseFloat(fab.style.left),y:parseFloat(fab.style.top)}));
  });

  // Override click: don't open if dragged
  fab.addEventListener('click', e=>{
    if(moved){ moved=false; e.stopImmediatePropagation(); }
  }, true);
})();
