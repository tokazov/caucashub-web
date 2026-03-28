// ── AI DISPATCHER — CaucasHub ─────────────────────────
// Живой диалог через Gemini на бэкенде
// POST https://api-production-f3ea.up.railway.app/api/ai/dispatcher

const API_URL = 'https://api-production-f3ea.up.railway.app/api/ai/dispatcher';

let aiOpen = false;
let aiHistory = [];   // [{role:'user'|'assistant', text:'...'}]
let aiState = {};     // накопленные данные от Gemini
let aiTyping = false;

// ── OPEN / CLOSE ──────────────────────────────────────
function toggleAI() {
  if (aiOpen) { closeAI(); } else { openAI(); }
}

function openAI() {
  aiOpen = true;
  const chat = document.getElementById('aiChat');
  const fab  = document.querySelector('.ai-fab');
  if (!chat) return;
  chat.classList.add('open');
  // На десктопе — позиционируем рядом с кнопкой
  if (fab && window.innerWidth > 600) positionChat(chat, fab);
  setTimeout(() => document.getElementById('aiInput')?.focus(), 100);

  // Приветствие только если история пустая
  if (aiHistory.length === 0) {
    setTimeout(() => {
      addBotMsg('Привет! Я Алекс, диспетчер CaucasHub 👋\nВы водитель или грузовладелец?');
      addRoleBtns();
    }, 200);
  }
}

function closeAI() {
  aiOpen = false;
  const chat = document.getElementById('aiChat');
  if (chat) chat.classList.remove('open');
}

// ── POSITION ──────────────────────────────────────────
function positionChat(chat, fab) {
  const r = fab.getBoundingClientRect();
  const chatW = 320;
  const margin = 10;
  const gap = 12;

  chat.style.visibility = 'hidden';
  chat.style.display = 'flex';
  const chatH = Math.min(chat.offsetHeight || 480, window.innerHeight * 0.75);
  chat.style.visibility = '';

  let left = r.left + r.width / 2 - chatW / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - chatW - margin));

  let top = r.top - chatH - gap;
  if (top < margin) top = r.bottom + gap;
  if (top + chatH > window.innerHeight - margin) top = window.innerHeight - chatH - margin;

  chat.style.left   = left + 'px';
  chat.style.top    = top + 'px';
  chat.style.right  = 'auto';
  chat.style.bottom = 'auto';
}

// ── MESSAGES ──────────────────────────────────────────
function addBotMsg(text) {
  const msgs = document.getElementById('aiMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'ai-msg bot';
  div.innerHTML = text.replace(/\n/g, '<br>');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  aiHistory.push({ role: 'assistant', text });
}

function addUserMsg(text) {
  const msgs = document.getElementById('aiMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'ai-msg user';
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  aiHistory.push({ role: 'user', text });
}

function showTyping() {
  const msgs = document.getElementById('aiMessages');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = 'ai-msg typing';
  div.id = 'aiTypingIndicator';
  div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function hideTyping() {
  document.getElementById('aiTypingIndicator')?.remove();
}

// ── ROLE BUTTONS ──────────────────────────────────────
function addRoleBtns() {
  const msgs = document.getElementById('aiMessages');
  if (!msgs) return;
  const wrap = document.createElement('div');
  wrap.className = 'ai-role-btns';
  wrap.id = 'aiRoleBtns';
  wrap.innerHTML = `
    <button class="ai-role-btn" onclick="pickRole('carrier')">🚛 Я водитель / Перевозчик</button>
    <button class="ai-role-btn" onclick="pickRole('shipper')">📦 Я грузовладелец</button>
  `;
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function pickRole(role) {
  document.getElementById('aiRoleBtns')?.remove();
  const label = role === 'carrier' ? '🚛 Я водитель' : '📦 Я грузовладелец';
  addUserMsg(label);
  aiState.role = role;
  sendToGemini(label);
}

// ── SEND ──────────────────────────────────────────────
async function aiSend() {
  if (aiTyping) return;
  const input = document.getElementById('aiInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';

  // Убираем кнопки роли если ещё висят
  document.getElementById('aiRoleBtns')?.remove();

  addUserMsg(text);
  await sendToGemini(text);
}

async function sendToGemini(text) {
  if (aiTyping) return;
  aiTyping = true;

  const typingEl = showTyping();

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: aiHistory.slice(-8),
        state: aiState
      })
    });

    const data = await resp.json();
    hideTyping();

    // Если бэкенд вернул 404 или нет reply — уходим в офлайн логику
    if (!resp.ok || !data.reply) {
      handleOffline(text);
      return;
    }

    // Обновляем состояние
    if (data.state) aiState = { ...aiState, ...data.state };

    // Показываем ответ
    addBotMsg(data.reply);

    // Показываем найденные грузы
    if (data.loads && data.loads.length > 0) {
      showFoundLoads(data.loads);
    } else if (data.state?.ready_to_search && data.loads?.length === 0) {
      addBotMsg('По этому маршруту сейчас нет грузов. Как только появятся — сообщу 🔔');
    }

    // Показываем шаблон для грузовладельца
    if (data.state?.ready_to_post) {
      updatePostTemplate(data.state);
    }

  } catch (err) {
    hideTyping();
    // Fallback — локальная логика если бэкенд недоступен
    handleOffline(text);
  } finally {
    aiTyping = false;
  }
}

// ── FOUND LOADS ───────────────────────────────────────
function showFoundLoads(loads) {
  const msgs = document.getElementById('aiMessages');
  if (!msgs) return;

  const header = document.createElement('div');
  header.className = 'ai-msg bot';
  header.style.cssText = 'font-size:12px;color:#888;padding:4px 0 2px;';
  header.textContent = `Нашёл ${loads.length} груза по маршруту:`;
  msgs.appendChild(header);

  loads.forEach(l => {
    // Ищем груз в локальных данных для открытия модалки
    const localLoad = (window.allLoads || []).find(x =>
      x.from.toLowerCase().includes((l.from||'').toLowerCase().slice(0,4)) &&
      x.to.toLowerCase().includes((l.to||'').toLowerCase().slice(0,4))
    );

    const div = document.createElement('div');
    div.className = 'ai-msg bot';
    div.style.cssText = 'background:#fffbf0;border:1.5px solid #f7b731;border-radius:10px;cursor:pointer;padding:10px 12px;margin-top:4px;';
    div.innerHTML = `
      <div style="font-weight:700;font-size:13px">${l.from} → ${l.to}</div>
      <div style="font-size:12px;color:#666;margin-top:3px">${(l.kg||0).toLocaleString()} кг · ${l.scope==='intl'?'$':'₾'}${l.price} · ${l.company}</div>
      <div style="font-size:11px;color:#f7b731;margin-top:4px;font-weight:600">Нажмите чтобы открыть →</div>
    `;
    div.onclick = () => {
      if (localLoad && typeof openCargo === 'function') openCargo(localLoad);
    };
    msgs.appendChild(div);
  });
  msgs.scrollTop = msgs.scrollHeight;
}

// ── POST TEMPLATE ─────────────────────────────────────
function updatePostTemplate(state) {
  const tpl = document.getElementById('aiTemplate');
  if (!tpl) return;
  tpl.style.display = 'block';

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  };
  set('tFrom',   state.from);
  set('tTo',     state.to);
  set('tWeight', state.weight ? state.weight + ' кг' : null);
  set('tDesc',   state.cargo_desc);
  set('tDate',   state.date);
  set('tTruck',  state.truck);
  set('tPrice',  state.price ? '₾' + state.price : null);

  const btn = document.getElementById('aiPostBtn');
  if (btn) btn.classList.add('ready');
}

// ── POST LOAD ─────────────────────────────────────────
function aiPostLoad() {
  if (typeof user === 'undefined' || !user) {
    closeAI();
    if (typeof openAuth === 'function') openAuth('register');
    return;
  }
  if (typeof openPostLoad === 'function') openPostLoad();
  setTimeout(() => {
    const s = aiState;
    const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    fill('pFromAddr', s.from);
    fill('pToAddr',   s.to);
    fill('pWeight',   s.weight);
    fill('pPrice',    s.price);
    fill('pDesc',     s.cargo_desc);
  }, 400);
  addBotMsg('Форму заполнил! Проверьте данные и нажмите "Разместить груз" 👍');
}

// ── VOICE ─────────────────────────────────────────────
function aiVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addBotMsg('Голосовой ввод доступен только в Chrome.'); return; }
  const rec = new SR();
  rec.lang = 'ru-RU';
  const mic = document.querySelector('.ai-mic');
  rec.onstart  = () => { if (mic) mic.textContent = '🔴'; };
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    const inp = document.getElementById('aiInput');
    if (inp) { inp.value = t; aiSend(); }
  };
  rec.onend = () => { if (mic) mic.textContent = '🎤'; };
  rec.start();
}

// ── RESET ─────────────────────────────────────────────
function aiReset() {
  aiHistory = [];
  aiState   = {};
  aiTyping  = false;
  const msgs = document.getElementById('aiMessages');
  if (msgs) msgs.innerHTML = '';
  const tpl = document.getElementById('aiTemplate');
  if (tpl) tpl.style.display = 'none';
  const btn = document.getElementById('aiPostBtn');
  if (btn) btn.classList.remove('ready');

  setTimeout(() => {
    addBotMsg('Начнём сначала! Вы водитель или грузовладелец?');
    addRoleBtns();
  }, 100);
}

// ── OFFLINE FALLBACK ──────────────────────────────────
function handleOffline(text) {
  const t = text.toLowerCase();

  // Определяем роль если не знаем
  if (!aiState.role) {
    const isCarrier = ['водитель','везу','еду','перевозчик','нужен груз','ищу груз','свободен'].some(w=>t.includes(w));
    const isShipper = ['отправить','доставить','ищу машину','нужна машина','нужно везти','хочу разместить'].some(w=>t.includes(w));
    if (isCarrier) aiState.role = 'carrier';
    else if (isShipper) aiState.role = 'shipper';
  }

  // Парсим города с предлогами
  const cities = ['тбилиси','батуми','поти','кутаиси','рустави','ереван','баку','стамбул','москва','сочи'];
  const fromM = t.match(/из\s+([а-яё]+)/);
  const toM   = t.match(/(?:в|до)\s+([а-яё]+)/);
  if (fromM) { const c = cities.find(c=>c.startsWith(fromM[1].slice(0,4))); if(c&&!aiState.from) aiState.from = cap(c); }
  if (toM)   { const c = cities.find(c=>c.startsWith(toM[1].slice(0,4)));   if(c&&!aiState.to)   aiState.to   = cap(c); }
  // Fallback — порядок упоминания
  if (!aiState.from || !aiState.to) {
    const found = cities.filter(c=>t.includes(c));
    if (found[0] && !aiState.from) aiState.from = cap(found[0]);
    if (found[1] && !aiState.to)   aiState.to   = cap(found[1]);
  }

  // Парсим вес
  const wm = t.match(/(\d+[.,]?\d*)\s*(тонн|тн\b|кг)/);
  if (wm) { let w = parseFloat(wm[1].replace(',','.')); if(wm[2].includes('тонн')||wm[2]==='тн') w*=1000; aiState.weight_cap=Math.round(w); }

  // Генерируем ответ
  const role = aiState.role;
  const from = aiState.from;
  const to   = aiState.to;

  if (!role) {
    addBotMsg('Вы водитель или грузовладелец?');
    addRoleBtns();
    return;
  }

  if (role === 'carrier') {
    if (from && to) {
      const found = (window.allLoads||[]).filter(l =>
        l.from.toLowerCase().includes(from.toLowerCase().slice(0,4)) &&
        l.to.toLowerCase().includes(to.toLowerCase().slice(0,4)) &&
        l.status !== 'taken' &&
        (!aiState.weight_cap || l.kg <= aiState.weight_cap)
      ).slice(0,3);

      if (found.length > 0) {
        addBotMsg(`${from} → ${to}: нашёл ${found.length} груза 👇`);
        showFoundLoads(found.map(l=>({from:l.from,to:l.to,kg:l.kg,price:l.price,scope:l.scope,company:l.co})));
      } else {
        addBotMsg(`По маршруту ${from} → ${to} сейчас нет грузов.\nКак только появятся — сообщу! 🔔`);
      }
    } else if (from && !to) {
      addBotMsg(`Откуда едете — понял, ${from}. Куда готовы везти?`);
    } else {
      addBotMsg('Откуда и куда едёте?');
    }
  } else {
    // Грузовладелец
    if (from && to) {
      document.getElementById('aiTemplate').style.display = 'block';
      const set = (id,val) => { const el=document.getElementById(id); if(el) el.textContent=val||'—'; };
      set('tFrom', from); set('tTo', to);
      if (!aiState.weight) {
        addBotMsg(`${from} → ${to}, понял! Какой груз и сколько весит?`);
      } else {
        document.getElementById('aiPostBtn')?.classList.add('ready');
        addBotMsg('Всё есть! Нажмите "Разместить груз" 👇');
      }
    } else {
      addBotMsg('Откуда и куда нужно доставить груз?');
    }
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── DRAG FAB ──────────────────────────────────────────
(function(){
  const fab = document.querySelector('.ai-fab');
  if (!fab) return;

  const saved = JSON.parse(localStorage.getItem('fabPos') || 'null');
  if (saved) {
    fab.style.right  = 'auto';
    fab.style.bottom = 'auto';
    fab.style.left   = saved.x + 'px';
    fab.style.top    = saved.y + 'px';
  }

  let dragging = false, startX, startY, origX, origY, moved = false;

  function getPos() {
    const r = fab.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  fab.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true; moved = false;
    startX = e.clientX; startY = e.clientY;
    const p = getPos(); origX = p.x; origY = p.y;
    fab.style.transition = 'none';
    fab.style.right = 'auto'; fab.style.bottom = 'auto';
    fab.style.left = origX + 'px'; fab.style.top = origY + 'px';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    const nx = Math.max(0, Math.min(window.innerWidth  - 60, origX + dx));
    const ny = Math.max(0, Math.min(window.innerHeight - 60, origY + dy));
    fab.style.left = nx + 'px'; fab.style.top = ny + 'px';
    if (window.innerWidth > 600) {
      const chat = document.getElementById('aiChat');
      if (chat && chat.classList.contains('open')) positionChat(chat, fab);
    }
  });

  document.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    fab.style.transition = '';
    if (moved) {
      localStorage.setItem('fabPos', JSON.stringify({ x: parseFloat(fab.style.left), y: parseFloat(fab.style.top) }));
      e.stopPropagation();
    }
  });

  fab.addEventListener('touchstart', e => {
    dragging = true; moved = false;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    const p = getPos(); origX = p.x; origY = p.y;
    fab.style.transition = 'none';
    fab.style.right = 'auto'; fab.style.bottom = 'auto';
    fab.style.left = origX + 'px'; fab.style.top = origY + 'px';
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    const nx = Math.max(0, Math.min(window.innerWidth  - 60, origX + dx));
    const ny = Math.max(0, Math.min(window.innerHeight - 60, origY + dy));
    fab.style.left = nx + 'px'; fab.style.top = ny + 'px';
    if (window.innerWidth > 600) {
      const chat = document.getElementById('aiChat');
      if (chat && chat.classList.contains('open')) positionChat(chat, fab);
    }
    if (moved) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    fab.style.transition = '';
    if (moved) localStorage.setItem('fabPos', JSON.stringify({ x: parseFloat(fab.style.left), y: parseFloat(fab.style.top) }));
  });

  fab.addEventListener('click', e => {
    if (moved) { moved = false; e.stopImmediatePropagation(); }
  }, true);
})();

// ── INIT ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('aiInput');
  if (inp) {
    inp.addEventListener('input', () => {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); }
    });
  }
});
