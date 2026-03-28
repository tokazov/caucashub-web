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
    // Конвертируем формат фронтенда в формат API
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
      // Обновляем id груза серверным
      return { ok: true, load: { ...load, id: r.data.id, serverId: r.data.id } };
    }
    return { ok: false, error: 'Ошибка сохранения' };
  },

  async updateLoad(serverId, updates){
    const body = {};
    if(updates.from) body.from_city = updates.from;
    if(updates.to)   body.to_city   = updates.to;
    if(updates.kg)   body.weight_kg = updates.kg;
    if(updates.desc) body.cargo_desc = updates.desc;
    if(updates.price && updates.cur === '₾') body.price_gel = updates.price;
    if(updates.price && updates.cur === '$') body.price_usd = updates.price;
    if(updates.pay)  body.payment_type = updates.pay;
    const r = await apiRequest('PUT', `/api/loads/${serverId}`, body);
    return { ok: r.ok };
  },

  async deleteLoad(serverId){
    const r = await apiRequest('DELETE', `/api/loads/${serverId}`);
    return { ok: r.ok };
  },

};

// ── SYNC: при старте загружаем грузы с сервера ────────
async function syncLoadsFromServer(){
  if(!getToken()) return;
  try {
    // Получаем свои грузы
    const myLoads = await CaucasAPI.getMyLoads();
    if(myLoads.length){
      // Добавляем в _myLoads и LOCAL если их там нет
      myLoads.forEach(l => {
        l.fromServer = true;
        if(!_myLoads.find(m=>m.serverId===l.id)){
          const mapped = mapServerLoad(l);
          _myLoads.unshift(mapped);
          if(!LOCAL.find(x=>x.id===l.id)) LOCAL.unshift(mapped);
        }
      });
      window.allLoads = [...LOCAL, ...INTL];
      if(typeof renderLoads === 'function') renderLoads(scope==='local'?LOCAL:INTL);
      if(typeof _renderOrders === 'function') _renderOrders();
    }

    // Загружаем все активные грузы
    const allLoads = await CaucasAPI.getLoads({ scope: scope });
    if(allLoads.length){
      // Заменяем демо-данные серверными если их достаточно
      console.log('[API] Loaded', allLoads.length, 'loads from server');
    }
  } catch(e) {
    console.warn('[syncLoads]', e);
  }
}

function mapServerLoad(l){
  // Маппинг серверного формата во фронтенд формат
  const typeClrs = {
    tent:      {typeClr:'#f3e5f5',typeClrT:'#6a1b9a',typeLabel:'Тент'},
    ref:       {typeClr:'#e3f2fd',typeClrT:'#1565c0',typeLabel:'Рефриж.'},
    bort:      {typeClr:'#e8f5e9',typeClrT:'#2e7d32',typeLabel:'Борт'},
    termos:    {typeClr:'#fff3e0',typeClrT:'#bf360c',typeLabel:'Термос'},
    gazel:     {typeClr:'#fce4ec',typeClrT:'#880e4f',typeLabel:'Фургон'},
    container: {typeClr:'#f0f2f5',typeClrT:'#555',   typeLabel:'Контейнер'},
  };
  const tc = typeClrs[l.type] || typeClrs.tent;
  return {
    id: l.id,
    serverId: l.id,
    from: l.from,
    from2: l.from2 || l.from,
    to: l.to,
    to2: l.to2 || l.to,
    scope: l.scope || 'local',
    kg: l.kg,
    type: l.type || 'tent',
    ...tc,
    price: l.price || 0,
    cur: l.cur || '₾',
    desc: l.desc || '',
    pay: l.pay || 'Нал',
    urgent: l.urgent || false,
    date: l.date || '',
    co: l.co || user?.name || 'CaucasHub',
    rat: '5.0',
    trips: 0,
    badge: l.urgent ? 'urgent' : null,
    fromServer: true,
  };
}
