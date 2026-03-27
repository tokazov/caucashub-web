// AI DISPATCHER
let aiOpen=false;
let aiLoadData={from:null,to:null,desc:null,weight:null,date:null,truck:null,price:null,pay:null};

function toggleAI(){
  aiOpen=!aiOpen;
  const chat=document.getElementById('aiChat');
  if(chat) chat.classList.toggle('open',aiOpen);
  if(aiOpen) setTimeout(()=>document.getElementById('aiInput')?.focus(),100);
}

function aiAddMsg(text,type){
  const msgs=document.getElementById('aiMessages');
  if(!msgs) return;
  const div=document.createElement('div');
  div.className='ai-msg '+type;
  div.textContent=text;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
  return div;
}

function aiUpdateTemplate(){
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

function parseLocal(text){
  const t=text.toLowerCase();
  const georgianCities=['тбилиси','батуми','поти','кутаиси','рустави','зугдиди','гори','телави'];
  const intlCities=['стамбул','ереван','баку','москва','сочи','алматы','ташкент','дубай','анкара'];
  const allCities=[...georgianCities,...intlCities];
  
  const found=allCities.filter(c=>t.includes(c));
  if(found.length>=1&&!aiLoadData.from) aiLoadData.from=found[0].charAt(0).toUpperCase()+found[0].slice(1);
  if(found.length>=2&&!aiLoadData.to) aiLoadData.to=found[1].charAt(0).toUpperCase()+found[1].slice(1);
  
  const wm=t.match(/(\d+)\s*(тонн|тн\b|кг|кило)/);
  if(wm){let w=parseInt(wm[1]);if(wm[2].includes('тонн')||wm[2]==='тн') w*=1000;aiLoadData.weight=w;}
  
  const pm=t.match(/(\d+)\s*(лари|₾)/);
  if(pm) aiLoadData.price=parseInt(pm[1]);
  
  if(t.includes('нал')&&!t.includes('безнал')) aiLoadData.pay='Наличные';
  else if(t.includes('безнал')) aiLoadData.pay='Безналичный';
  
  if(t.includes('сегодня')) aiLoadData.date='Сегодня';
  else if(t.includes('завтра')) aiLoadData.date='Завтра';
  else if(t.includes('пятниц')) aiLoadData.date='Пятница';
  else if(t.includes('понедел')) aiLoadData.date='Понедельник';
  
  const truckTypes={тент:'Тент',рефриж:'Рефрижератор',борт:'Бортовой',термос:'Термос',фургон:'Фургон',контейн:'Контейнер',автовоз:'Автовоз'};
  for(const[k,v] of Object.entries(truckTypes)){if(t.includes(k)&&!aiLoadData.truck){aiLoadData.truck=v;break;}}
  
  const dm=t.match(/(\w+)\s+груз|везт[ии]\s+(\w+)|(\w+)\s+товар/);
  if(dm&&!aiLoadData.desc) aiLoadData.desc=(dm[1]||dm[2]||dm[3]).charAt(0).toUpperCase()+(dm[1]||dm[2]||dm[3]).slice(1);
}

function buildReply(){
  const d=aiLoadData;
  const missing=[];
  if(!d.from) missing.push('откуда везём');
  if(!d.to) missing.push('куда');
  if(!d.weight) missing.push('вес груза (кг или тонн)');
  if(!d.date) missing.push('дата загрузки');
  if(missing.length===0) return '✅ Отлично! Все данные есть. Нажмите "Разместить груз"!';
  if(missing.length<=2) return 'Почти готово! Уточните: '+missing.join(' и ')+'?';
  return 'Понял! Теперь скажите: '+missing.slice(0,2).join(' и ')+'?';
}

async function aiSend(){
  const input=document.getElementById('aiInput');
  if(!input) return;
  const text=input.value.trim();
  if(!text) return;
  input.value='';
  input.style.height='auto';
  aiAddMsg(text,'user');
  
  const typing=aiAddMsg('...','typing');
  
  // Сначала парсим локально
  parseLocal(text);
  
  // Пробуем через API
  try{
    const prompt='Извлеки данные о грузе из текста: "'+text+'". Верни JSON: {"from":"город или null","to":"город или null","desc":"груз или null","weight":число_или_null,"date":"дата или null","truck":"тип_кузова или null","price":число_или_null,"pay":"оплата или null"}. Только JSON.';
    const resp=await fetch('https://api-production-f3ea.up.railway.app/api/ai/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:prompt,lang:'ru'})
    });
    if(resp.ok){
      const data=await resp.json();
      const m=(data.reply||'').match(/\{[\s\S]*\}/);
      if(m){
        const parsed=JSON.parse(m[0]);
        if(parsed.from) aiLoadData.from=parsed.from;
        if(parsed.to) aiLoadData.to=parsed.to;
        if(parsed.desc) aiLoadData.desc=parsed.desc;
        if(parsed.weight) aiLoadData.weight=parsed.weight;
        if(parsed.date) aiLoadData.date=parsed.date;
        if(parsed.truck) aiLoadData.truck=parsed.truck;
        if(parsed.price) aiLoadData.price=parsed.price;
        if(parsed.pay) aiLoadData.pay=parsed.pay;
      }
    }
  }catch(e){}
  
  if(typing) typing.remove();
  aiUpdateTemplate();
  aiAddMsg(buildReply(),'bot');
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
    if(d.truck){
      const sel=document.getElementById('pTruck');
      if(sel){for(let i=0;i<sel.options.length;i++){if(sel.options[i].text.toLowerCase().includes(d.truck.toLowerCase())){sel.selectedIndex=i;break;}}}
    }
  },400);
  aiAddMsg('Форму заполнил! Проверьте данные и нажмите "Разместить груз".','bot');
}

function aiStartVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){aiAddMsg('Голосовой ввод не поддерживается. Используйте Chrome.','bot');return;}
  const rec=new SR();
  rec.lang='ru-RU';
  const mic=document.querySelector('.ai-mic');
  rec.onstart=()=>{if(mic)mic.textContent='🔴';aiAddMsg('Слушаю...','bot');};
  rec.onresult=(e)=>{const t=e.results[0][0].transcript;const inp=document.getElementById('aiInput');if(inp)inp.value=t;aiSend();};
  rec.onend=()=>{if(mic)mic.textContent='🎤';};
  rec.onerror=()=>{if(mic)mic.textContent='🎤';aiAddMsg('Не удалось распознать речь.','bot');};
  rec.start();
}

document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('aiInput');
  if(inp) inp.addEventListener('input',()=>{inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,80)+'px';});
});
