// ── CaucasHub API Client ──────────────────────────────
// Все запросы к Railway бэкенду

const API_BASE = 'https://api-production-f3ea.up.railway.app';

// Токен из localStorage
function getToken(){ return localStorage.getItem('ch_token') || null; }
function setToken(t){ if(t) localStorage.setItem('ch_token',t); else localStorage.removeItem('ch_token'); }

async function apiRequest(method, path, body=null){
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if(token) headers['Authorization'] = 'Bearer ' + token;

  const opts = { method, headers };
  if(body) opts.body = JSON.stringify(body);

  try {
    const resp = await fetch(API_BASE + path, opts);
    const data = await resp.json().catch(()=>null);
    return { ok: resp.ok, status: resp.status, data };
  } catch(e) {
    console.warn('[API]', method, path, e.message);
    return { ok: false, status: 0, data: null, error: e.message };
  }
}

// ── AUTH ──────────────────────────────────────────────
const CaucasAPI = {

  async register({ email, password, name, phone, role, inn, orgType, truckType, tonnage }){
    const r = await apiRequest('POST', '/api/auth/register', {
      email, password,
      company_name: name,
      phone: phone || '',
      role: role || 'carrier'
    });
    if(r.ok && r.data?.token){
      setToken(r.data.token);
      return { ok: true, token: r.data.token, user_id: r.data.user_id };
    }
    return { ok: false, error: r.data?.detail || 'Ошибка регистрации' };
  },

  async login({ email, password }){
    const r = await apiRequest('POST', '/api/auth/login', { email, password });
    if(r.ok && r.data?.token){
      setToken(r.data.token);
      return { ok: true, token: r.data.token, user_id: r.data.user_id, role: r.data.role };
    }
    return { ok: false, error: r.data?.detail || 'Неверный email или пароль' };
  },

  logout(){
    setToken(null);
  },

  // ── LOADS ───────────────────────────────────────────
  async getLoads({ scope, from_city, to_city, truck_type } = {}){
    const params = new URLSearchParams();
    if(scope) params.set('scope', scope);
    if(from_city) params.set('from_city', from_city);
    if(to_city) params.set('to_city', to_city);
    if(truck_type) params.set('truck_type', truck_type);
    params.set('limit', '100');
    const r = await apiRequest('GET', '/api/loads/?' + params.toString());
    return r.ok ? r.data?.loads || [] : [];
  },

  async getMyLoads(){
    const r = await apiRequest('GET', '/api/loads/my/loads');
    return r.ok ? r.data?.loads || [] : [];
  },

  async createLoad(load){
    const body = {
      from_city: load.from,
      from_address: load.from2 || load.from,
      to_city: load.to,
      to_address: load.to2 || load.to,
      scope: load.scope || 'local',
      weight_kg: load.kg,
      truck_type: load.type || 'tent',
      cargo_desc: load.desc,
      price_gel: load.cur === '₾' ? load.price : null,
      price_usd: load.cur === '$' ? load.price : null,
      payment_type: load.pay,
      is_urgent: load.urgent || false,
      company_name: load.co,
      load_date: new Date().toISOString(),
    };
    const r = await apiRequest('POST', '/api/loads/', body);
    if(r.ok && r.data?.id){
      return { ok: true, load: { ...load, id: r.data.id, serverId: r.data.id } };
    }
    return { ok: false, error: 'Ошибка сохранения' };
  },

  async updateLoad(serverId, updates){
    const body = {};
    if(updates.from)  body.from_city    = updates.from;
    if(updates.to)    body.to_city      = updates.to;
    if(updates.kg)    body.weight_kg    = updates.kg;
    if(updates.desc)  body.cargo_desc   = updates.desc;
    if(updates.type)  body.truck_type   = updates.type;
    if(updates.pay)   body.payment_type = updates.pay;
    if(updates.urgent !== undefined) body.is_urgent = updates.urgent;
    if(updates.price && updates.cur === '₾') body.price_gel = updates.price;
    if(updates.price && updates.cur === '$') body.price_usd = updates.price;
    const r = await apiRequest('PUT', `/api/loads/${serverId}`, body);
    return { ok: r.ok };
  },

  async deleteLoad(serverId){
    const r = await apiRequest('DELETE', `/api/loads/${serverId}`);
    return { ok: r.ok };
  },

  async forgotPassword(email){
    const r = await apiRequest('POST', '/api/auth/forgot-password', { email });
    return r.data || { ok: false };
  },

  async resetPassword(email, code, new_password){
    const r = await apiRequest('POST', '/api/auth/reset-password', { email, code, new_password });
    return { ok: r.ok, data: r.data };
  },

};

// ── Расшифровка JWT → user_id ─────────────────────────
function decodeJwtUserId(token){
  try {
    const p = token.split('.')[1];
    const d = JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));
    const sub = d.sub !== undefined ? d.sub : (d.user_id || d.id);
    return sub !== undefined ? Number(sub) : null;
  } catch(e){ return null; }
}

// ── SYNC: загружаем грузы с сервера при старте ────────
async function syncLoadsFromServer(){
  try {
    // Определяем currentUserId из токена
    const tok = getToken();
    if(tok){
      currentUserId = decodeJwtUserId(tok);
    } else {
      currentUserId = null;
    }

    // Загружаем публичные грузы с сервера (для всех, не только залогиненных)
    const serverLoads = await CaucasAPI.getLoads({ scope: scope });
    if(serverLoads && serverLoads.length > 0){
      const mapped = serverLoads.map(l => mapServerLoad(l));
      if(scope === 'local'){
        LOCAL.length = 0;
        mapped.forEach(l => LOCAL.push(l));
      } else {
        INTL.length = 0;
        mapped.forEach(l => INTL.push(l));
      }
      window.allLoads = [...LOCAL, ...INTL];
      if(typeof renderLoads === 'function') renderLoads(scope === 'local' ? LOCAL : INTL);
      console.log('[API] Loaded', serverLoads.length, 'loads from server');
    }

    // Загружаем свои грузы если залогинен
    if(tok && currentUserId){
      const myLoads = await CaucasAPI.getMyLoads();
      if(myLoads && myLoads.length){
        // Очищаем серверные грузы из _myLoads (оставляем только локальные)
        _myLoads = _myLoads.filter(l => !l.fromServer);
        myLoads.forEach(l => {
          const mapped = mapServerLoad(l);
          _myLoads.unshift(mapped);
          // Обновляем userId в LOCAL/INTL массиве
          const inLocal = LOCAL.find(x => x.id === l.id);
          if(inLocal) inLocal.userId = l.user_id;
          const inIntl = INTL.find(x => x.id === l.id);
          if(inIntl) inIntl.userId = l.user_id;
        });
        window.allLoads = [...LOCAL, ...INTL];
        // Перерисовываем список грузов чтобы обновить кнопки
        if(typeof renderLoads === 'function') renderLoads(scope === 'local' ? LOCAL : INTL);
        if(typeof _renderOrders === 'function') _renderOrders();
      }
    }
  } catch(e) {
    console.warn('[syncLoads]', e);
  }
}

function mapServerLoad(l){
  const typeClrs = {
    tent:      { typeClr:'#f3e5f5', typeClrT:'#6a1b9a', typeLabel:'Тент'      },
    ref:       { typeClr:'#e3f2fd', typeClrT:'#1565c0', typeLabel:'Рефриж.'   },
    bort:      { typeClr:'#e8f5e9', typeClrT:'#2e7d32', typeLabel:'Борт'       },
    termos:    { typeClr:'#fff3e0', typeClrT:'#bf360c', typeLabel:'Термос'     },
    gazel:     { typeClr:'#fce4ec', typeClrT:'#880e4f', typeLabel:'Фургон'     },
    container: { typeClr:'#f0f2f5', typeClrT:'#555',    typeLabel:'Контейнер'  },
    auto:      { typeClr:'#e8eaf6', typeClrT:'#283593', typeLabel:'Автовоз'   },
    other:     { typeClr:'#f0f2f5', typeClrT:'#555',    typeLabel:'Другой'    },
  };
  const tc = typeClrs[l.type] || typeClrs.tent;
  return {
    id:        l.id,
    serverId:  l.id,
    userId:    l.user_id || null,   // ← владелец груза
    from:      l.from  || '',
    from2:     l.from2 || l.from || '',
    to:        l.to    || '',
    to2:       l.to2   || l.to || '',
    scope:     l.scope || 'local',
    kg:        l.kg    || 0,
    type:      l.type  || 'tent',
    ...tc,
    price:     l.price || 0,
    cur:       l.cur   || '₾',
    desc:      l.desc  || '',
    pay:       l.pay   || 'Нал',
    urgent:    l.urgent || false,
    date:      l.date  || '',
    date2:     null,
    km:        '—',
    co:        l.co    || 'CaucasHub',
    rat:       l.rat   || '5.0',
    trips:     l.trips || 0,
    badge:     l.urgent ? 'urgent' : (l.badge || null),
    fromServer: true,
  };
}
