import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ── CONFIG ── */
const URL_SB = 'https://vpvehwkylysltsvtxdwu.supabase.co';
const KEY_SB = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwdmVod2t5bHlzbHRzdnR4ZHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NzU2ODQsImV4cCI6MjA5MTA1MTY4NH0.hHhoW-jxItOt8uP_k1G5vCRUGUSDUzvX6BBMm2qviIc';
const FID    = '4320e401-3c67-47b0-9e8f-826ce4d0343f';
const LS_KEY = 'family_erp_v3';
const sb = createClient(URL_SB, KEY_SB);

/* ── STATIC DATA ── */
const PAL = ['#28C248','#0A84FF','#E8413A','#E8356A','#F5C842','#A855F7','#2DC9C9','#F97316','#38BDF8','#AC8E68'];
const CURS = [
  {code:'RUB',sym:'₽',name:'Рубль'}, {code:'USD',sym:'$',name:'Доллар'},
  {code:'EUR',sym:'€',name:'Евро'},  {code:'GBP',sym:'£',name:'Фунт'},
  {code:'CNY',sym:'¥',name:'Юань'},  {code:'TRY',sym:'₺',name:'Лира'},
  {code:'AED',sym:'د.إ',name:'Дирхам'},{code:'CHF',sym:'₣',name:'Франк'},
  {code:'JPY',sym:'¥',name:'Иена'},  {code:'KZT',sym:'₸',name:'Тенге'},
];
const DCATS = [
  {id:'c1',name:'Еда',type:'expense',emoji:'🍔'}, {id:'c2',name:'Дом',type:'expense',emoji:'🏠'},
  {id:'c3',name:'Ребенок',type:'expense',emoji:'👶'},{id:'c4',name:'Транспорт',type:'expense',emoji:'🚗'},
  {id:'c5',name:'Зарплата',type:'income',emoji:'💼'},{id:'c6',name:'Фриланс',type:'income',emoji:'💻'},
  {id:'c7',name:'Прочее',type:'income',emoji:'🎁'},
];

/* ── STATE ── */
let S = {
  user: 'Вова', txType: 'expense', currency: 'RUB',
  selCat: null, filters: new Set(['all']),
  pie: {type:'expense', who:'all'},
  cats: [...DCATS], txs: [],
  eId: null, eUser: 'Вова', eType: 'expense', eCat: null,
};

/* ── CONFIRM DIALOG ── */
let _cr = null;
window.confirmResolve = v => {
  el('confirm-overlay').classList.remove('is-open');
  if (_cr) { _cr(v); _cr = null; }
};
function showConfirm(title, msg, okLabel = 'Удалить') {
  return new Promise(resolve => {
    _cr = resolve;
    el('confirm-title').textContent  = title;
    el('confirm-msg').textContent    = msg;
    el('confirm-ok-btn').textContent = okLabel;
    el('confirm-overlay').classList.add('is-open');
  });
}

/* ── SYNC STATUS ── */
function setSyncStatus(state, msg) {
  const configs = [
    { wrap:'sync-mobile',  spin:'sync-spinner-m', txt:'sync-text-m' },
    { wrap:'sync-desktop', spin:'sync-spinner-d', txt:'sync-text-d' },
  ];
  configs.forEach(({ wrap, spin, txt }) => {
    const w = el(wrap); if (!w) return;
    w.className = 'sync ' + (state === 'ok' ? 'is-ok' : state === 'loading' ? 'is-loading' : 'is-err');
    if (wrap.includes('desktop')) w.classList.add('sidebar__sync');
    const sp = el(spin);
    if (sp) sp.classList.toggle('is-hidden', state !== 'loading');
    const t = el(txt);
    if (t) t.textContent = state === 'ok' ? '☁️ Синхронизировано' : state === 'loading' ? 'Загрузка...' : '⚠️ ' + (msg || 'Офлайн');
  });
}

function showErr(msg) {
  const b = el('err-banner'); if (!b) return;
  b.textContent = msg; b.classList.add('is-visible');
  setTimeout(() => b.classList.remove('is-visible'), 7000);
}

/* ── LOCAL CACHE ── */
function lsave() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ cats:S.cats, txs:S.txs, user:S.user, currency:S.currency })); } catch(_) {}
}
function lload() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (p.cats?.length) S.cats = p.cats;
    if (p.txs)      S.txs = p.txs;
    if (p.user)     S.user = p.user;
    if (p.currency) S.currency = p.currency;
  } catch(_) {}
}

/* ── SUPABASE LOAD ── */
async function loadCloud() {
  setSyncStatus('loading');
  try {
    const [cRes, tRes] = await Promise.all([
      sb.from('categories').select('*').eq('family_id', FID).order('created_at'),
      sb.from('transactions').select('*').eq('family_id', FID).order('date', { ascending: false }),
    ]);
    if (cRes.error) throw new Error('categories: ' + cRes.error.message);
    if (tRes.error) throw new Error('transactions: ' + tRes.error.message);

    if (cRes.data.length === 0) {
      const rows = DCATS.map(c => ({ id:c.id, name:c.name, type:c.type, emoji:c.emoji, family_id:FID }));
      const { error: se } = await sb.from('categories').upsert(rows, { onConflict: 'id' });
      if (se) throw new Error('seed: ' + se.message);
      S.cats = [...DCATS];
    } else {
      S.cats = cRes.data.map(r => ({ id:r.id, name:r.name, type:r.type, emoji:r.emoji||'📌' }));
    }
    S.txs = tRes.data.map(r => ({
      id: r.id, amount: Number(r.amount), type: r.type,
      cat: r.category_id, by: r.created_by,
      date: r.date, comment: r.comment||'', cur: r.currency||'RUB',
    }));
    lsave(); setSyncStatus('ok');
  } catch (e) {
    console.error(e); setSyncStatus('err', e.message.slice(0,35));
    showErr('Ошибка Supabase: ' + e.message);
    lload(); if (!S.cats.length) S.cats = [...DCATS];
  }
  rChips(); rHome();
  if (el('screen-list').classList.contains('is-active')) rList();
}

/* ── HELPERS ── */
const el = id => document.getElementById(id);
function getCurr(code) { return CURS.find(c => c.code === (code || S.currency)) || CURS[0]; }
function fmtN(n, code) {
  const c = getCurr(code);
  return c.sym + '\u00A0' + Math.round(Math.abs(n)).toLocaleString('ru-RU');
}
function todayS()  { return new Date().toISOString().slice(0,10); }
function yestS()   { return new Date(Date.now()-86400000).toISOString().slice(0,10); }
function tomorrowS(){ return new Date(Date.now()+86400000).toISOString().slice(0,10); }
function fmtD(d) {
  if (d === todayS())    return 'Сегодня';
  if (d === yestS())     return 'Вчера';
  if (d === tomorrowS()) return 'Завтра';
  const [yr,mo,dy] = d.split('-');
  const ms = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const suf = parseInt(yr) !== new Date().getFullYear() ? ' ' + yr : '';
  return `${parseInt(dy)} ${ms[parseInt(mo)-1]}${suf}`;
}
function toast(m) {
  const t = el('toast'); t.textContent = m; t.classList.add('is-visible');
  setTimeout(() => t.classList.remove('is-visible'), 1800);
}
window.soon = n => toast('⏳ ' + n + ' — скоро!');
function getC(id) { return S.cats.find(x => x.id === id); }

/* ── NAV — class-based, no style mutations ── */
function setNav(name) {
  // mobile
  ['home','add','list','settings','calendar'].forEach(n => {
    el('mnav-'+n)?.classList.toggle('is-active', n === name);
  });
  // desktop
  ['home','add','list','settings','calendar'].forEach(n => {
    el('dnav-'+n)?.classList.toggle('is-active', n === name);
  });
}

const TITLES = { home:'Сводка', add:'Добавить', list:'Операции', settings:'Настройки', calendar:'Календарь' };

window.go = function(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  el('screen-'+name).classList.add('is-active');
  el('page-title').textContent = TITLES[name] || '';
  setNav(name);

  if (name === 'home')     rHome();
  if (name === 'list')     { updateFilterUI(); rList(); }
  if (name === 'settings') rSettings();
  if (name === 'calendar') calInit();
  if (name === 'add') {
    S.selCat = null; rChips();
    el('curr-sym').textContent = getCurr().sym;
    el('date-input').value = todayS();
    el('amount-input').value = '';
    el('comment-input').value = '';
  }
};

/* ── USER / TYPE ── */
window.setUser = function(u) {
  S.user = u;
  el('form-vova').className  = 'chip' + (u === 'Вова' ? ' is-blue' : '');
  el('form-yulia').className = 'chip' + (u === 'Юля'  ? ' is-pink' : '');
  lsave();
};
window.setType = function(t) {
  S.txType = t; S.selCat = null;
  el('btn-expense').className = 'chip' + (t === 'expense' ? ' is-red'   : '');
  el('btn-income').className  = 'chip' + (t === 'income'  ? ' is-green' : '');
  rChips();
};

/* ── CATEGORY CHIPS ── */
function rChips() {
  const cats = S.cats.filter(c => c.type === S.txType);
  el('cat-chips').innerHTML = cats.length
    ? cats.map(c => `<button class="chip${S.selCat===c.id?' is-sel':''}" onclick="selCat('${c.id}')">${c.emoji} ${c.name}</button>`).join('')
    : '<span class="chips__empty-hint">Нет категорий — добавьте в Настройках</span>';
}
window.selCat = id => { S.selCat = id; rChips(); };

/* ── ADD TX ── */
window.addTx = async function() {
  const amt = parseFloat(el('amount-input').value);
  if (!amt || amt <= 0) { toast('Введите сумму'); return; }
  if (!S.selCat)        { toast('Выберите категорию'); return; }
  const comment = el('comment-input').value.trim();
  const date    = el('date-input').value || todayS();
  const id = 'tx' + Date.now();
  const btn = el('save-btn');
  btn.disabled = true; btn.textContent = 'Сохраняем...';
  S.txs.unshift({ id, amount:amt, type:S.txType, cat:S.selCat, by:S.user, date, comment, cur:S.currency });
  lsave(); rHome(); setSyncStatus('loading');
  try {
    const { error } = await sb.from('transactions').insert({
      id, amount:amt, type:S.txType, category_id:S.selCat,
      created_by:S.user, date, comment, currency:S.currency, family_id:FID,
    });
    if (error) throw new Error(error.message);
    setSyncStatus('ok'); toast('✅ Сохранено!');
  } catch(e) { setSyncStatus('err'); showErr('Ошибка сохранения: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Сохранить';
  S.selCat = null; go('home');
};

/* ── DELETE TX ── */
window.delTx = async function(id) {
  const ok = await showConfirm('Удалить операцию?', 'Это действие нельзя отменить.');
  if (!ok) return;
  S.txs = S.txs.filter(t => t.id !== id); lsave(); rList(); rHome();
  try {
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setSyncStatus('ok'); toast('🗑 Удалено');
  } catch(e) { setSyncStatus('err'); showErr('Ошибка: ' + e.message); }
};

/* ── EDIT TX ── */
window.openEdit = function(id) {
  const tx = S.txs.find(t => t.id === id); if (!tx) return;
  S.eId = id; S.eUser = tx.by; S.eType = tx.type; S.eCat = tx.cat;
  el('edit-amount').value  = tx.amount;
  el('edit-date').value    = tx.date;
  el('edit-comment').value = tx.comment || '';
  el('edit-curr-sym').textContent = getCurr().sym;
  eSetUser(tx.by); eSetType(tx.type, false); rEditChips();
  el('modal-edit').classList.add('is-open');
};
window.closeEdit = () => el('modal-edit').classList.remove('is-open');
window.eSetUser = function(u) {
  S.eUser = u;
  el('edit-vova').className  = 'chip' + (u === 'Вова' ? ' is-blue' : '');
  el('edit-yulia').className = 'chip' + (u === 'Юля'  ? ' is-pink' : '');
};
window.eSetType = function(t, re = true) {
  S.eType = t;
  el('edit-exp').className = 'chip' + (t === 'expense' ? ' is-red'   : '');
  el('edit-inc').className = 'chip' + (t === 'income'  ? ' is-green' : '');
  if (re) rEditChips();
};
function rEditChips() {
  el('edit-cat-chips').innerHTML = S.cats.filter(c => c.type === S.eType)
    .map(c => `<button class="chip chip--sm${S.eCat===c.id?' is-sel':''}" onclick="eSelCat('${c.id}')">${c.emoji} ${c.name}</button>`)
    .join('');
}
window.eSelCat = id => { S.eCat = id; rEditChips(); };
window.saveEdit = async function() {
  const amt = parseFloat(el('edit-amount').value);
  if (!amt || amt <= 0) { toast('Введите сумму'); return; }
  if (!S.eCat) { toast('Выберите категорию'); return; }
  const date    = el('edit-date').value || todayS();
  const comment = el('edit-comment').value.trim();
  const idx = S.txs.findIndex(t => t.id === S.eId);
  if (idx !== -1) S.txs[idx] = { ...S.txs[idx], amount:amt, type:S.eType, cat:S.eCat, by:S.eUser, date, comment };
  lsave(); closeEdit(); rList(); rHome(); setSyncStatus('loading');
  try {
    const { error } = await sb.from('transactions').update({ amount:amt, type:S.eType, category_id:S.eCat, created_by:S.eUser, date, comment }).eq('id', S.eId);
    if (error) throw new Error(error.message);
    setSyncStatus('ok'); toast('✅ Изменено!');
  } catch(e) { setSyncStatus('err'); showErr('Ошибка: ' + e.message); }
};

/* ── TX ROW HTML ── */
function txHTML(tx, showActions) {
  const cat = getC(tx.cat);
  const sign = tx.type === 'income' ? '+ ' : '− ';
  const who  = tx.by === 'Вова' ? '🙋‍♂️ Вова' : '🙋‍♀️ Юля';
  const cmt  = tx.comment ? ' · ' + tx.comment : '';
  const actions = showActions ? `
    <div class="tx-actions">
      <button class="tx-action-btn" onclick="openEdit('${tx.id}')">✏️</button>
      <button class="tx-action-btn tx-action-btn--del" onclick="delTx('${tx.id}')">🗑</button>
    </div>` : '';
  const row = `<div class="tx-item">
    <div class="tx-icon">${cat?.emoji||'📌'}</div>
    <div class="tx-info">
      <div class="tx-cat">${cat?.name||'Удалённая категория'}${cmt}</div>
      <div class="tx-meta">${fmtD(tx.date)}</div>
    </div>
    <div class="tx-right">
      <div class="tx-amount tx-amount--${tx.type}">${sign}${fmtN(tx.amount, tx.cur)}</div>
      <div class="tx-who">${who}</div>
      ${actions}
    </div>
  </div>`;

  if (!showActions) return row; // home screen — no swipe
  // list screen — wrap in swipe container (mobile swipe-to-delete)
  return `<div class="tx-swipe-wrap" data-id="${tx.id}">
    <div class="tx-swipe-bg">🗑</div>
    <div class="tx-swipe-item">${row}</div>
  </div>`;
}

/* ── DELTA ── */
function renderDelta(elId, cur, prev, type, suffix) {
  const e = el(elId); if (!e) return;
  if (cur === 0 && prev === 0) { e.innerHTML = ''; return; }
  const diff = cur - prev;
  if (Math.abs(diff) < 0.5) { e.innerHTML = `<span class="delta delta--muted">= как ${suffix}</span>`; return; }
  const abs = Math.round(Math.abs(diff)), sym = getCurr().sym, sign = diff > 0 ? '▲ ' : '▼ ';
  const mod = type === 'expense' ? (diff > 0 ? 'bad' : 'good') : (diff > 0 ? 'good' : 'muted');
  e.innerHTML = `<span class="delta delta--${mod}">${sign}${sym}\u00A0${abs.toLocaleString('ru-RU')} ${suffix}</span>`;
}

/* ── HOME ── */
let _period = 'today'; // 'today' | 'month'
window.setPeriod = function(p) {
  _period = p;
  el('period-today').classList.toggle('is-active', p === 'today');
  el('period-month').classList.toggle('is-active', p === 'month');
  rHome();
};

function rHome() {
  const tod = todayS(), yes = yestS(), mo = tod.slice(0,7);
  const lm = new Date(); lm.setMonth(lm.getMonth()-1); const lmStr = lm.toISOString().slice(0,7);
  let ti=0,te=0,mi=0,me=0,yi=0,ye=0,lmi=0,lme=0;
  S.txs.forEach(tx => {
    if (tx.date===tod) { tx.type==='income' ? ti+=tx.amount : te+=tx.amount; }
    if (tx.date===yes) { tx.type==='income' ? yi+=tx.amount : ye+=tx.amount; }
    if (tx.date.startsWith(mo))   { tx.type==='income' ? mi+=tx.amount : me+=tx.amount; }
    if (tx.date.startsWith(lmStr)){ tx.type==='income' ? lmi+=tx.amount : lme+=tx.amount; }
  });

  // Balance card — always shows month balance
  const bal = mi - me;
  const lmBal = lmi - lme;
  const bv = el('balance-val');
  bv.textContent = fmtN(bal);
  bv.className = 'balance-card__value' + (bal > 0 ? ' balance-card__value--pos' : bal < 0 ? ' balance-card__value--neg' : '');

  // Balance delta vs last month
  const bd = el('balance-delta');
  if (bd) {
    const diff = bal - lmBal;
    if (Math.abs(diff) < 0.5) {
      bd.innerHTML = `<span class="delta delta--muted">= как в прошлом</span>`;
    } else {
      const sign = diff > 0 ? '▲ ' : '▼ ';
      const mod  = diff > 0 ? 'good' : 'bad';
      bd.innerHTML = `<span class="delta delta--${mod}">${sign}${fmtN(Math.abs(diff))} vs прошлый месяц</span>`;
    }
  }

  // Period cards
  const inc = _period === 'today' ? ti : mi;
  const exp = _period === 'today' ? te : me;
  const pInc = _period === 'today' ? yi : lmi;
  const pExp = _period === 'today' ? ye : lme;
  const suffix = _period === 'today' ? 'к вчера' : 'к пр.мес.';

  el('period-inc').textContent = fmtN(inc);
  el('period-exp').textContent = fmtN(exp);
  renderDelta('d-period-inc', inc, pInc, 'income', suffix);
  renderDelta('d-period-exp', exp, pExp, 'expense', suffix);

  const limit = window.innerWidth >= 1024 ? 8 : 6;
  el('home-txlist').innerHTML = S.txs.slice(0,limit).length
    ? S.txs.slice(0,limit).map(t => txHTML(t, false)).join('')
    : '<div class="empty"><div class="empty__icon">💸</div>Пока нет операций<br><span class="empty__hint">Добавь первую — займёт 3 секунды 👇</span></div>';

  rHomeUpcoming();
}

/* ── UPCOMING EVENTS (home screen, next 12h) ── */
function rHomeUpcoming() {
  const wrap = el('home-upcoming-wrap');
  if (!wrap) return;
  if (!CAL.events || !CAL.events.length) { wrap.innerHTML = ''; return; }

  const now   = new Date();
  const limit = new Date(now.getTime() + 12 * 60 * 60 * 1000); // +12h

  const upcoming = CAL.events
    .filter(ev => {
      if (ev.is_all_day) return false; // skip all-day on home screen
      const start = new Date(ev.start_at);
      return start >= now && start <= limit;
    })
    .sort((a,b) => new Date(a.start_at) - new Date(b.start_at))
    .slice(0, 4);

  if (!upcoming.length) { wrap.innerHTML = ''; return; }

  const rows = upcoming.map(ev => {
    const color   = calEventColor(ev);
    const startT  = calLocalTime(ev.start_at);
    const endT    = calLocalTime(ev.end_at);
    const who     = calWhoLabel(ev);
    // Time until event
    const diffMs  = new Date(ev.start_at) - now;
    const diffMin = Math.round(diffMs / 60000);
    const soon    = diffMin < 60
      ? `через ${diffMin} мин`
      : `через ${Math.floor(diffMin/60)} ч`;

    return `<div class="upcoming-event-row" onclick="calOpenFromHome('${ev.id}','${calLocalDate(ev.start_at)}')">
      <div class="upcoming-event-dot" style="background:${color}"></div>
      <div class="upcoming-event-info">
        <div class="upcoming-event-title">${ev.title || ''}</div>
        <div class="upcoming-event-time">${startT} – ${endT} · ${soon}</div>
      </div>
      <div class="upcoming-event-who">${who}</div>
    </div>`;
  }).join('');

  wrap.innerHTML = `<div class="upcoming-card">
    <div class="upcoming-card__header">
      <span class="upcoming-card__title">📅 Ближайшие события</span>
      <button class="upcoming-card__link" onclick="calOpenFromHome(null, null)">Все →</button>
    </div>
    ${rows}
  </div>`;
}

/* Open calendar from home screen, optionally jumping to a specific date+event */
window.calOpenFromHome = function(eventId, dateStr) {
  go('calendar'); // switches screen and calls calInit()
  // After calInit runs (async), navigate to date and highlight event
  if (dateStr || eventId) {
    const targetDate = dateStr || todayS();
    // Wait for calInit to finish loading, then navigate
    setTimeout(async () => {
      // Switch to day view for better focus
      if (dateStr) {
        CAL.view = 'day';
        ['month','week','day'].forEach(n => el('calv-'+n)?.classList.toggle('is-active', n === 'day'));
        const d = calDateAt(targetDate);
        CAL.dayDate   = d;
        CAL.year      = d.getFullYear();
        CAL.month     = d.getMonth();
        CAL.weekStart = calMonday(d);
        CAL.selDate   = targetDate;
        await calLoadEvents();
        calRender();
        calUpdateAside(targetDate);
      }
      // Highlight the specific event in aside
      if (eventId) {
        setTimeout(() => {
          const item = document.querySelector(`.cal-event-item[onclick*="${eventId}"], [data-event-id="${eventId}"]`);
          if (item) {
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            item.classList.add('is-highlighted');
            setTimeout(() => item.classList.remove('is-highlighted'), 2000);
          }
        }, 100);
      }
    }, 400);
  }
};

/* ── FILTERS ── */
function updateFilterUI() {
  const map = { all:'is-white', income:'is-green', expense:'is-red', vova:'is-blue', yulia:'is-pink' };
  ['all','income','expense','vova','yulia'].forEach(x => {
    const cls = 'chip' + (S.filters.has(x) ? ' ' + map[x] : '');
    // mobile
    const m = el('f-'+x);   if (m) m.className = cls;
    // desktop panel
    const d = el('fd-'+x);  if (d) d.className = cls;
  });
}
window.togF = function(f) {
  if (f === 'all') { S.filters = new Set(['all']); }
  else {
    S.filters.delete('all');
    S.filters.has(f) ? S.filters.delete(f) : S.filters.add(f);
    if (!S.filters.size) S.filters.add('all');
  }
  updateFilterUI(); rList();
};
function filt(txs) {
  if (S.filters.has('all')) return txs;
  return txs.filter(t => {
    const tOk = (!S.filters.has('income') && !S.filters.has('expense')) || S.filters.has(t.type);
    const wOk = (!S.filters.has('vova') && !S.filters.has('yulia')) ||
      (S.filters.has('vova') && t.by === 'Вова') || (S.filters.has('yulia') && t.by === 'Юля');
    return tOk && wOk;
  });
}
function rList() {
  const txs = filt(S.txs);
  el('main-txlist').innerHTML = txs.length
    ? txs.map(t => txHTML(t, true)).join('')
    : '<div class="empty"><div class="empty__icon">🔍</div>Нет операций по фильтру</div>';
}

/* ── SETTINGS ── */
function rSettings() {
  el('currency-grid').innerHTML = CURS.map(c =>
    `<div class="currency-opt${c.code===S.currency?' is-selected':''}" onclick="setCur('${c.code}')">
      <span class="currency-opt__sym">${c.sym}</span>
      <span class="currency-opt__name">${c.name}</span>
      <span class="currency-opt__code">${c.code}</span>
    </div>`).join('');

  ['expense','income'].forEach(type => {
    el('cat-'+type+'-list').innerHTML = S.cats.filter(c => c.type === type).map(c => {
      const used = S.txs.filter(t => t.cat === c.id).length;
      return `<div class="cat-row">
        <div class="cat-row__left">
          <div class="cat-row__icon">${c.emoji}</div>
          <span class="cat-row__name">${c.name}</span>
          ${used > 0 ? `<span class="cat-hint">${used} опер.</span>` : ''}
        </div>
        <div class="cat-row__right">
          <span class="badge badge--${type === 'income' ? 'inc' : 'exp'}">${type==='income'?'Доход':'Расход'}</span>
          <button class="btn-delete" onclick="delCat('${c.id}',${used})">✕</button>
        </div>
      </div>`;
    }).join('') || '<div class="empty empty--sm">Нет категорий</div>';
  });
}
window.setCur = code => {
  S.currency = code; lsave(); rSettings();
  el('curr-sym').textContent = getCurr().sym; toast('✅ Валюта сохранена');
};
window.delCat = async function(id, used) {
  const cat = getC(id), name = cat?.name || 'категорию';
  let msg = `Удалить категорию "${name}"?`;
  if (used > 0) msg += ` В ${used} операциях она останется как "Удалённая категория".`;
  if (!await showConfirm('Удалить категорию?', msg)) return;
  S.cats = S.cats.filter(c => c.id !== id); lsave(); rSettings();
  try { await sb.from('categories').delete().eq('id', id); } catch(e) { showErr('Ошибка: ' + e.message); }
  toast('🗑 Категория удалена');
};
window.addCat = async function() {
  const name  = el('new-cat-name').value.trim();
  const emoji = el('new-cat-emoji').value.trim() || '📌';
  const type  = el('new-cat-type').value;
  if (!name) { toast('Введите название'); return; }
  if (S.cats.some(c => c.name.toLowerCase() === name.toLowerCase() && c.type === type)) { toast('Такая категория уже есть'); return; }
  const id = 'c' + Date.now();
  S.cats.push({ id, name, type, emoji }); lsave(); rSettings();
  try {
    const { error } = await sb.from('categories').insert({ id, name, type, emoji, family_id: FID });
    if (error) throw new Error(error.message); setSyncStatus('ok');
  } catch(e) { setSyncStatus('err'); showErr('Ошибка: ' + e.message); }
  el('new-cat-name').value = ''; el('new-cat-emoji').value = '';
  toast('✅ Категория добавлена');
};

/* ── PIE CHART ── */
// pie state: type/who already in S.pie; add range
S.pie.range  = 1;
S.pie.offset = 0;

/* Returns local YYYY-MM strings for selected range */
function pieGetMonths() {
  const months = [];
  const now = new Date();
  const baseY = now.getFullYear();
  const baseM = now.getMonth(); // 0-based
  for (let i = 0; i < S.pie.range; i++) {
    // offset 0 = current month, -1 = prev, etc; iterate back from offset
    const totalOffset = S.pie.offset - i;
    const d = new Date(baseY, baseM + totalOffset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  return months;
}
function pieUpdateRangeLabel() {
  const RU_MO = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const months = pieGetMonths();
  const lbl = el('pie-range-label');
  if (!lbl) return;
  if (months.length === 1) {
    const [y,m] = months[0].split('-');
    lbl.textContent = RU_MO[parseInt(m)-1] + ' ' + y;
  } else {
    const first = months[months.length-1], last = months[0];
    const [y1,m1] = first.split('-'); const [y2,m2] = last.split('-');
    lbl.textContent = RU_MO[parseInt(m1)-1] + (y1!==y2?' '+y1:'') + ' — ' + RU_MO[parseInt(m2)-1] + ' ' + y2;
  }
  const nextBtn = el('pie-next');
  if (nextBtn) nextBtn.disabled = S.pie.offset >= 0;
}

window.setPieRange = function(r) {
  S.pie.range = r; S.pie.offset = 0;
  ['1','3','12'].forEach(n => {
    const b = el('pie-r'+n);
    if (b) b.classList.toggle('is-active', parseInt(n) === r);
  });
  pieUpdateRangeLabel(); drawPie();
};
window.pieMonthShift = function(d) {
  const newOff = S.pie.offset + d;
  if (newOff > 0) return; // can't go into future
  S.pie.offset = newOff;
  pieUpdateRangeLabel(); drawPie();
};

window.setPie = function(k, v) {
  S.pie[k] = v;
  if (k === 'type') {
    el('ptab-exp').className = 'chip' + (v==='expense' ? ' is-red' : '');
    el('ptab-inc').className = 'chip' + (v==='income'  ? ' is-green' : '');
  }
  if (k === 'who') {
    el('ptab-all').className  = 'chip' + (v==='all'  ? ' is-white' : '');
    el('ptab-vova').className = 'chip' + (v==='Вова' ? ' is-blue'  : '');
    el('ptab-yulia').className= 'chip' + (v==='Юля'  ? ' is-pink'  : '');
  }
  drawPie();
};
window.openAnalytics = function() {
  el('modal-analytics').classList.add('is-open');
  // reset type/who but keep range/offset so user doesn't lose their period selection
  S.pie.type = 'expense';
  S.pie.who  = 'all';
  if (S.pie.range  === undefined) S.pie.range  = 1;
  if (S.pie.offset === undefined) S.pie.offset = 0;
  el('ptab-exp').className  = 'chip is-red';
  el('ptab-inc').className  = 'chip';
  el('ptab-all').className  = 'chip is-white';
  el('ptab-vova').className = 'chip';
  el('ptab-yulia').className= 'chip';
  // sync range tab UI
  ['1','3','12'].forEach(n => {
    const b = el('pie-r'+n); if (b) b.classList.toggle('is-active', parseInt(n) === S.pie.range);
  });
  pieUpdateRangeLabel();
  drawPie();
};
window.closeAnalytics = () => el('modal-analytics').classList.remove('is-open');

function drawPie() {
  const canvas = el('pie-canvas'), ctx = canvas.getContext('2d');
  const months = pieGetMonths();
  let txs = S.txs.filter(t => t.type === S.pie.type && months.some(mo => t.date.startsWith(mo)));
  if (S.pie.who !== 'all') txs = txs.filter(t => t.by === S.pie.who);
  const tots = {};
  txs.forEach(tx => { tots[tx.cat] = (tots[tx.cat]||0) + tx.amount; });
  const entries = Object.entries(tots).sort((a,b) => b[1]-a[1]);
  const total = entries.reduce((s,[,v]) => s+v, 0);
  ctx.clearRect(0,0,200,200);
  if (!entries.length) {
    ctx.fillStyle='#555'; ctx.font='13px Inter,sans-serif'; ctx.textAlign='center';
    ctx.fillText('Нет данных',100,100); ctx.fillText('за выбранный период',100,118);
    el('pie-legend').innerHTML=''; return;
  }
  let angle = -Math.PI/2;
  entries.forEach(([cid,val],i) => {
    const sl = (val/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(100,100); ctx.arc(100,100,90,angle,angle+sl); ctx.closePath();
    ctx.fillStyle = PAL[i%PAL.length]; ctx.fill(); angle += sl;
  });
  ctx.beginPath(); ctx.arc(100,100,48,0,Math.PI*2);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-surface').trim() || '#111117';
  ctx.fill();
  ctx.fillStyle='#777'; ctx.font='600 11px Inter,sans-serif'; ctx.textAlign='center';
  ctx.fillText(fmtN(total),100,96); ctx.font='10px Inter,sans-serif'; ctx.fillText('итого',100,111);
  el('pie-legend').innerHTML = entries.map(([cid,val],i) => {
    const cat=getC(cid), pct=Math.round(val/total*100);
    return `<div class="pie-legend-row">
      <div class="pie-legend-dot" style="background:${PAL[i%PAL.length]}"></div>
      <span class="pie-legend__name">${cat ? cat.emoji+' '+cat.name : '—'}</span>
      <span class="pie-legend__val">${fmtN(val,S.currency)} <span class="pie-legend__pct">${pct}%</span></span>
    </div>`;
  }).join('');
}


/* ════════════════════════════════════════════════════════
   CALENDAR MODULE — fixed & cleaned
   Fixes: grid UTC bug, creator logic, all-day, time picker
   race condition, view switching, DnD, null safety, class-
   based state, event sorting, loading lifecycle
════════════════════════════════════════════════════════ */

/* ── CONSTANTS ── */
const MEMBER_IDS = {
  vova:  'a1000000-0000-0000-0000-000000000001',
  yulia: 'a2000000-0000-0000-0000-000000000002',
};
const MEMBER_COLORS = { vova: '#3B82F6', yulia: '#E8356A', both: '#2ECC52' };
const RU_MONTHS     = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const RU_MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const RU_WD_SHORT   = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const RU_WD_FULL    = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

/* ── CALENDAR STATE ── */
let CAL = {
  year:      new Date().getFullYear(),
  month:     new Date().getMonth(),       // 0-based
  view:      'month',                     // 'month'|'week'|'day'
  weekStart: null,                        // Date — Monday of displayed week
  dayDate:   null,                        // Date — displayed day
  events:    [],                          // loaded from Supabase
  selDate:   null,                        // YYYY-MM-DD
  editId:    null,                        // UUID of event being edited
  participants: { vova: true, yulia: false },
};

/* ── LOCAL DATE HELPERS ── */
// UTC ISO → local YYYY-MM-DD (avoids UTC-offset day shift)
function calLocalDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
// UTC ISO → local HH:MM
function calLocalTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n) { return String(n).padStart(2,'0'); }
// Date string YYYY-MM-DD → Date at noon local (avoids DST edge cases)
function calDateAt(ymd) { return new Date(ymd + 'T12:00:00'); }
// Get Monday of the week containing `date`
function calMonday(date) {
  const dow = date.getDay(); // 0=Sun
  const off = dow === 0 ? -6 : 1 - dow;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + off);
}
// YYYY-MM-DD from Date
function calYMD(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

/* ── LOAD EVENTS ── */
// Load for a date range — called by month/week/day renders
async function calLoadEvents() {
  // Build range: always cover displayed period + buffer for week/day
  let rangeStart, rangeEnd;
  if (CAL.view === 'week' && CAL.weekStart) {
    rangeStart = new Date(CAL.weekStart);
    rangeEnd   = new Date(CAL.weekStart.getFullYear(), CAL.weekStart.getMonth(), CAL.weekStart.getDate() + 6, 23, 59, 59);
  } else if (CAL.view === 'day' && CAL.dayDate) {
    rangeStart = new Date(CAL.dayDate.getFullYear(), CAL.dayDate.getMonth(), CAL.dayDate.getDate());
    rangeEnd   = new Date(CAL.dayDate.getFullYear(), CAL.dayDate.getMonth(), CAL.dayDate.getDate(), 23, 59, 59);
  } else {
    // month view — also load prev/next week's visible days
    rangeStart = new Date(CAL.year, CAL.month, 1);
    rangeEnd   = new Date(CAL.year, CAL.month+1, 0, 23, 59, 59);
  }

  try {
    const { data, error } = await sb
      .from('calendar_events')
      .select('id,title,description,start_at,end_at,is_all_day,location,status,calendar_event_participants(member_id)')
      .eq('family_id', FID)
      .is('deleted_at', null)
      .eq('status', 'active')
      .lte('start_at', rangeEnd.toISOString())
      .gte('end_at', rangeStart.toISOString())
      .order('start_at');
    if (error) throw error;
    CAL.events = (data || []).map(e => ({
      ...e,
      participants: (e.calendar_event_participants || []).map(p => p.member_id),
    }));
  } catch(err) {
    console.error('calLoadEvents:', err);
    // Don't clear existing events on network error — keep stale data
  }
}

/* ── INIT ── */
async function calInit() {
  const now = new Date();
  CAL.dayDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  CAL.weekStart = calMonday(CAL.dayDate);
  await calLoadEvents();
  calRender();
  calSelectDate(todayS());
  // Update home screen upcoming events widget
  rHomeUpcoming();
}

/* ── VIEW SWITCHER ── */
window.calSetView = async function(v) {
  CAL.view = v;
  ['month','week','day'].forEach(n => el('calv-'+n)?.classList.toggle('is-active', n === v));
  // Sync period from selDate so selected day is still visible
  if (CAL.selDate) {
    const d    = calDateAt(CAL.selDate);
    CAL.year   = d.getFullYear();
    CAL.month  = d.getMonth();
    CAL.dayDate  = d;
    CAL.weekStart = calMonday(d);
  }
  await calLoadEvents();
  calRender();
  // Re-render aside for selected date
  if (CAL.selDate) calUpdateAside(CAL.selDate);
};

/* ── NAVIGATION ── */
window.calShiftMonth = async function(dir) {
  if (CAL.view === 'week') {
    CAL.weekStart = new Date(CAL.weekStart.getFullYear(), CAL.weekStart.getMonth(), CAL.weekStart.getDate() + dir * 7);
    CAL.year  = CAL.weekStart.getFullYear();
    CAL.month = CAL.weekStart.getMonth();
  } else if (CAL.view === 'day') {
    CAL.dayDate = new Date(CAL.dayDate.getFullYear(), CAL.dayDate.getMonth(), CAL.dayDate.getDate() + dir);
    CAL.year    = CAL.dayDate.getFullYear();
    CAL.month   = CAL.dayDate.getMonth();
    CAL.selDate = calYMD(CAL.dayDate);
  } else {
    CAL.month += dir;
    if (CAL.month > 11) { CAL.month = 0; CAL.year++; }
    if (CAL.month < 0)  { CAL.month = 11; CAL.year--; }
    // Keep selDate only if it falls in new month
    if (CAL.selDate) {
      const [sy,sm] = CAL.selDate.split('-').map(Number);
      if (sy !== CAL.year || sm - 1 !== CAL.month) CAL.selDate = null;
    }
  }
  await calLoadEvents();
  calRender();
  if (CAL.selDate) calUpdateAside(CAL.selDate);
  else calAsideClear();
};

window.calGoToday = async function() {
  const now = new Date();
  CAL.year      = now.getFullYear();
  CAL.month     = now.getMonth();
  CAL.dayDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  CAL.weekStart = calMonday(CAL.dayDate);
  CAL.selDate   = todayS();
  await calLoadEvents();
  calRender();
  // Update aside without triggering mobile drawer
  calUpdateAside(todayS());
};

/* ── RENDER DISPATCHER ── */
function calRender() {
  const wd = el('cal-weekdays-row');
  if (CAL.view === 'week') {
    wd?.classList.add('is-hidden');
    calRenderWeek(); return;
  }
  if (CAL.view === 'day') {
    wd?.classList.add('is-hidden');
    calRenderDay(); return;
  }
  wd?.classList.remove('is-hidden');
  calRenderMonth();
}

/* ── MONTH VIEW ── */
function calRenderMonth() {
  el('cal-month-title').textContent = RU_MONTHS[CAL.month] + ' ' + CAL.year;
  const grid = el('cal-grid');
  if (!grid) return;
  // Reset layout classes from week/day views
  grid.closest('.cal-layout')?.classList.remove('is-week-view', 'is-day-view');

  const firstDay = new Date(CAL.year, CAL.month, 1);
  let startDow = firstDay.getDay();                  // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1;     // Monday-first

  const daysInMonth     = new Date(CAL.year, CAL.month + 1, 0).getDate();
  const daysInPrevMonth = new Date(CAL.year, CAL.month, 0).getDate();
  const todayStr        = todayS();

  // Events map keyed by LOCAL date
  const evMap = {};
  CAL.events.forEach(ev => {
    const d = calLocalDate(ev.start_at);
    (evMap[d] = evMap[d] || []).push(ev);
  });

  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  let cells = '';

  for (let i = 0; i < totalCells; i++) {
    let day, mo, yr, isOther = false;
    if (i < startDow) {
      day = daysInPrevMonth - startDow + i + 1;
      mo  = CAL.month === 0 ? 11 : CAL.month - 1;
      yr  = CAL.month === 0 ? CAL.year - 1 : CAL.year;
      isOther = true;
    } else if (i >= startDow + daysInMonth) {
      day = i - startDow - daysInMonth + 1;
      mo  = CAL.month === 11 ? 0 : CAL.month + 1;
      yr  = CAL.month === 11 ? CAL.year + 1 : CAL.year;
      isOther = true;
    } else {
      day = i - startDow + 1;
      mo  = CAL.month;
      yr  = CAL.year;
    }

    const dateStr   = `${yr}-${pad(mo+1)}-${pad(day)}`;
    const dayEvents = (evMap[dateStr] || []).sort(calSortEvents);
    let cls = 'cal-cell';
    if (isOther)            cls += ' is-other-month';
    if (dateStr === todayStr) cls += ' is-today';
    if (dateStr === CAL.selDate) cls += ' is-selected';
    if (dayEvents.length)   cls += ' has-events';

    const MAX = 3;
    let pillsHTML = dayEvents.slice(0, MAX).map(ev => calPillHTML(ev, dateStr)).join('');
    if (dayEvents.length > MAX) {
      pillsHTML += `<div class="cal-more-link" onclick="calSelectDate('${dateStr}');event.stopPropagation()">+${dayEvents.length - MAX} ещё</div>`;
    }
    // Mobile: colored dots per participant type
    const mobileDots = dayEvents.slice(0, 2).map(ev => {
      const c = calEventColorClass(ev);
      return `<div class="cal-mobile-dot cal-mobile-dot--${c}"></div>`;
    }).join('');
    const mobileHTML = dayEvents.length ? `<div class="cal-mobile-dots">${mobileDots}</div>` : '';

    cells += `<div class="${cls}" data-date="${dateStr}" onclick="calSelectDate('${dateStr}')">
      <div class="cal-day-num">${day}</div>${pillsHTML}${mobileHTML}
    </div>`;
  }
  grid.innerHTML = cells;
}

/* ── WEEK VIEW ── */
function calRenderWeek() {
  const grid = el('cal-grid');
  if (!grid || !CAL.weekStart) return;
  // Add class to layout for full-width mode
  el('cal-grid')?.closest('.cal-layout')?.classList.add('is-week-view');
  el('cal-grid')?.closest('.cal-layout')?.classList.remove('is-day-view');

  const ws   = CAL.weekStart;
  const days = Array.from({length:7}, (_,i) => new Date(ws.getFullYear(), ws.getMonth(), ws.getDate()+i));
  const todayStr = todayS();

  const d0 = days[0], d6 = days[6];
  const titleEnd   = `${d6.getDate()} ${RU_MONTHS_GEN[d6.getMonth()]} ${d6.getFullYear()}`;
  const titleStart = d0.getMonth() === d6.getMonth()
    ? String(d0.getDate())
    : `${d0.getDate()} ${RU_MONTHS_GEN[d0.getMonth()]}`;
  el('cal-month-title').textContent = `${titleStart} – ${titleEnd}`;

  const evMap = {};
  CAL.events.forEach(ev => {
    const d = calLocalDate(ev.start_at);
    (evMap[d] = evMap[d] || []).push(ev);
  });

  let cols = '';
  days.forEach(d => {
    const dateStr = calYMD(d);
    const isToday = dateStr === todayStr;
    const isSel   = dateStr === CAL.selDate;
    const dayEvs  = (evMap[dateStr] || []).sort(calSortEvents);
    cols += `<div class="cal-week-col${isToday?' is-today':''}${isSel?' is-selected':''}" data-date="${dateStr}" onclick="calSelectDate('${dateStr}')">
      <div class="cal-week-header">
        <span class="cal-week-wd">${RU_WD_SHORT[d.getDay()]}</span>
        <span class="cal-week-num${isToday?' is-today-num':''}">${d.getDate()}</span>
      </div>
      <div class="cal-week-events">${dayEvs.map(ev => calPillHTML(ev, dateStr)).join('')}</div>
    </div>`;
  });
  // Wrap in scrollable container for mobile
  grid.innerHTML = `<div class="cal-week-wrap"><div class="cal-week-view">${cols}</div></div>`;
}

/* ── DAY VIEW — time slot grid ── */
function calRenderDay() {
  const grid = el('cal-grid');
  if (!grid || !CAL.dayDate) return;
  // Update layout class
  el('cal-grid')?.closest('.cal-layout')?.classList.add('is-day-view');
  el('cal-grid')?.closest('.cal-layout')?.classList.remove('is-week-view');

  const d       = CAL.dayDate;
  const dateStr = calYMD(d);
  CAL.selDate   = dateStr;
  el('cal-month-title').textContent = `${RU_WD_FULL[d.getDay()]}, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;

  const dayEvs = CAL.events.filter(ev => calLocalDate(ev.start_at) === dateStr).sort(calSortEvents);
  calUpdateAside(dateStr);

  if (!dayEvs.length) {
    grid.innerHTML = `<div class="cal-day-empty"><div class="empty__icon">📅</div>Нет событий в этот день<br><span style="font-size:11px">Нажмите + в боковой панели чтобы добавить</span></div>`;
    return;
  }

  // Build hourly slots — show all hours from first to last event + buffer
  const allHours = dayEvs.filter(ev => !ev.is_all_day).map(ev => new Date(ev.start_at).getHours());
  const minH = allHours.length ? Math.max(0, Math.min(...allHours) - 1) : 8;
  const maxH = allHours.length ? Math.min(23, Math.max(...allHours) + 2) : 20;

  const evByHour = {};
  dayEvs.forEach(ev => {
    if (ev.is_all_day) { (evByHour['allday'] = evByHour['allday']||[]).push(ev); return; }
    const h = new Date(ev.start_at).getHours();
    (evByHour[h] = evByHour[h]||[]).push(ev);
  });

  const allDayEvs = evByHour['allday'] || [];
  let html = '<div class="cal-day-wrap"><div class="cal-day-slot-grid">';

  if (allDayEvs.length) {
    html += `<div class="cal-day-slot" data-date="${dateStr}" data-hour="allday">
      <div class="cal-day-slot-time" style="font-size:9px;padding-top:12px">Весь<br>день</div>
      <div class="cal-day-slot-events">${allDayEvs.map(ev => calDayEventBlockHTML(ev)).join('')}</div>
    </div>`;
  }

  for (let h = minH; h <= maxH; h++) {
    const slotEvs = evByHour[h] || [];
    html += `<div class="cal-day-slot" data-date="${dateStr}" data-hour="${h}">
      <div class="cal-day-slot-time">${pad(h)}:00</div>
      <div class="cal-day-slot-events">${slotEvs.map(ev => calDayEventBlockHTML(ev)).join('')}</div>
    </div>`;
  }
  html += '</div></div>';
  grid.innerHTML = html;
}

function calDayEventBlockHTML(ev) {
  const pc       = calEventColorClass(ev);
  const startT   = ev.is_all_day ? 'Весь день' : calLocalTime(ev.start_at);
  const endT     = ev.is_all_day ? '' : ` – ${calLocalTime(ev.end_at)}`;
  const safe     = (ev.title||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  return `<div class="cal-day-event-block cal-day-event-block--${pc}" draggable="true"
    data-event-id="${ev.id}" data-date="${calLocalDate(ev.start_at)}" data-title="${safe}"
    onclick="calClickEvent(event,'${ev.id}')" title="${ev.title||''}">
    <div class="cal-day-event-info">
      <div class="cal-day-event-title">${ev.title||''}</div>
      <div class="cal-day-event-time">${startT}${endT}</div>
    </div>
  </div>`;
}

/* ── SORT: all-day first, then by start_at ── */
function calSortEvents(a, b) {
  if (a.is_all_day && !b.is_all_day) return -1;
  if (!a.is_all_day && b.is_all_day) return 1;
  return new Date(a.start_at) - new Date(b.start_at);
}

/* ── PILL HTML ── */
function calPillHTML(ev, dateStr) {
  const pc        = calEventColorClass(ev);
  const timeLabel = ev.is_all_day ? 'Весь день' : calLocalTime(ev.start_at);
  const safe      = (ev.title || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const allDayCls = ev.is_all_day ? ' is-allday' : '';
  return `<div class="cal-event-pill cal-event-pill--${pc}${allDayCls}" draggable="true" data-event-id="${ev.id}" data-date="${dateStr}" data-title="${safe}" onclick="calClickEvent(event,'${ev.id}')" title="${ev.title || ''}">${timeLabel} ${ev.title || ''}</div>`;
}

function calEventColorClass(ev) {
  const v = ev.participants?.includes(MEMBER_IDS.vova);
  const y = ev.participants?.includes(MEMBER_IDS.yulia);
  if (v && y) return 'both';
  if (y) return 'yulia';
  return 'vova';
}
function calEventColor(ev) { return MEMBER_COLORS[calEventColorClass(ev)]; }

/* ── SELECT DATE ── */
window.calSelectDate = function(dateStr) {
  if (!dateStr) return;
  CAL.selDate   = dateStr;
  const d       = calDateAt(dateStr);
  CAL.dayDate   = d;
  CAL.weekStart = calMonday(d);

  calRender(); // re-render to update .is-selected highlight
  if (window.innerWidth >= 1024) {
    calUpdateAside(dateStr);
  } else {
    calOpenDrawer(dateStr);
  }
};

/* ── ASIDE (desktop right panel) ── */
function calUpdateAside(dateStr) {
  if (!dateStr) return;
  const [y,m,dv] = dateStr.split('-');
  el('cal-aside-date').textContent = `${parseInt(dv)} ${RU_MONTHS_GEN[parseInt(m)-1]} ${y}`;
  const dayEvs = CAL.events.filter(ev => calLocalDate(ev.start_at) === dateStr).sort(calSortEvents);
  el('cal-aside-events').innerHTML = calEventListHTML(dayEvs, true);
  el('cal-add-btn')?.classList.remove('is-hidden');
}

function calAsideClear() {
  el('cal-aside-date').textContent = 'Выберите день';
  el('cal-aside-events').innerHTML = '<div class="cal-aside__empty">Нажмите на день чтобы увидеть события</div>';
  el('cal-add-btn')?.classList.add('is-hidden');
}

/* ── MOBILE DRAWER ── */
function calOpenDrawer(dateStr) {
  const [y,m,dv] = dateStr.split('-');
  el('cal-drawer-date').textContent = `${parseInt(dv)} ${RU_MONTHS_GEN[parseInt(m)-1]} ${y}`;
  const dayEvs = CAL.events.filter(ev => calLocalDate(ev.start_at) === dateStr).sort(calSortEvents);
  el('cal-drawer-events').innerHTML = calEventListHTML(dayEvs, true);
  el('cal-drawer').classList.add('is-open');
}

window.closeCalDrawer = () => el('cal-drawer').classList.remove('is-open');

/* ── EVENT LIST HTML ── */
function calEventListHTML(events, showActions) {
  if (!events.length) {
    return '<div class="cal-aside__empty">Нет событий<br><span style="font-size:11px">Нажмите + чтобы добавить</span></div>';
  }
  return events.map(ev => {
    const color  = calEventColor(ev);
    const startT = calLocalTime(ev.start_at);
    const endT   = calLocalTime(ev.end_at);
    const time   = ev.is_all_day ? '🗓 Весь день' : `${startT} – ${endT}`;
    const who    = calWhoLabel(ev);
    const acts   = showActions
      ? `<div class="cal-event-actions">
           <button class="tx-action-btn" onclick="calEditEvent('${ev.id}');event.stopPropagation()">✏️</button>
           <button class="tx-action-btn tx-action-btn--del" onclick="calDeleteEvent('${ev.id}');event.stopPropagation()">🗑</button>
         </div>`
      : '';
    const loc = ev.location ? `<div class="cal-event-loc">📍 ${ev.location}</div>` : '';
    return `<div class="cal-event-item" onclick="calEditEvent('${ev.id}')">
      <div class="cal-event-color" style="background:${color}"></div>
      <div class="cal-event-body">
        <div class="cal-event-title">${ev.title || ''}</div>
        <div class="cal-event-time">${time}</div>
        <div class="cal-event-who">${who}</div>${loc}
      </div>
      ${acts}
    </div>`;
  }).join('');
}

function calWhoLabel(ev) {
  const v = ev.participants?.includes(MEMBER_IDS.vova);
  const y = ev.participants?.includes(MEMBER_IDS.yulia);
  if (v && y) return '🙋‍♂️ Вова · 🙋‍♀️ Юля';
  if (y) return '🙋‍♀️ Юля';
  return '🙋‍♂️ Вова';
}

window.calClickEvent = function(e, id) {
  e.stopPropagation();
  calEditEvent(id);
};

/* ── MODAL: CREATE / EDIT ── */
window.openCalEventModal = function(prefillDate) {
  CAL.editId = null;
  el('cal-modal-title').textContent = 'Новое событие';

  const base = prefillDate || CAL.selDate || todayS();
  const now  = new Date();
  // Snap to nearest 30-min boundary
  const rawM = now.getMinutes();
  const snM  = rawM < 15 ? 0 : rawM < 45 ? 30 : 0;
  const sH   = (now.getHours() + (rawM >= 45 ? 1 : 0)) % 24;

  el('cal-ev-title').value      = '';
  el('cal-ev-start-date').value = base;
  el('cal-ev-start-time').value = `${pad(sH)}:${pad(snM)}`;
  el('cal-ev-end-date').value   = base;
  el('cal-ev-end-time').value   = `${pad((sH + 1) % 24)}:${pad(snM)}`;
  el('cal-ev-allday').checked   = false;
  el('cal-ev-location').value   = '';
  el('cal-ev-desc').value       = '';

  // Show time inputs (might be hidden from previous all-day)
  el('cal-ev-start-time').classList.remove('is-hidden');
  el('cal-ev-end-time').classList.remove('is-hidden');
  document.querySelectorAll('.cal-time-row').forEach(r => r.classList.remove('is-allday'));

  CAL.participants = { vova: true, yulia: false };
  calUpdateParticipantUI();

  el('modal-cal-event').classList.add('is-open');
  el('cal-modal-del-btn').classList.add('is-hidden');
  setTimeout(() => el('cal-ev-title')?.focus(), 80);
};

window.closeCalEventModal = () => el('modal-cal-event').classList.remove('is-open');

window.calDeleteFromModal = async function() {
  if (!CAL.editId) return;
  closeCalEventModal();
  await calDeleteEvent(CAL.editId);
};

window.calToggleParticipant = function(code) {
  CAL.participants[code] = !CAL.participants[code];
  // At least one must always be selected
  if (!CAL.participants.vova && !CAL.participants.yulia) CAL.participants[code] = true;
  calUpdateParticipantUI();
};

function calUpdateParticipantUI() {
  el('cal-part-vova').className  = 'chip' + (CAL.participants.vova  ? ' is-blue' : '');
  el('cal-part-yulia').className = 'chip' + (CAL.participants.yulia ? ' is-pink' : '');
}

window.calToggleAllDay = function() {
  const checked = el('cal-ev-allday').checked;
  // Toggle is-allday class on the time row — CSS hides time inputs
  el('cal-ev-start-time')?.classList.toggle('is-hidden', checked);
  el('cal-ev-end-time')?.classList.toggle('is-hidden', checked);
  // Also toggle class on time row for container-level styling
  document.querySelectorAll('.cal-time-row').forEach(r => r.classList.toggle('is-allday', checked));
  if (checked) {
    const sd = el('cal-ev-start-date')?.value;
    if (sd && el('cal-ev-end-date')) el('cal-ev-end-date').value = sd;
  }
};

/* ── TIME PICKER ── */
function calBuildTimeOptions() {
  return Array.from({length:48}, (_,i) => `${pad(Math.floor(i/2))}:${i%2===0?'00':'30'}`);
}

window.calTimeInput = function(inp) {
  let v = inp.value.replace(/[^0-9:]/g,'');
  if (v.length === 2 && !v.includes(':') && inp._prevLen < 2) v += ':';
  inp._prevLen = v.length;
  inp.value = v;
};

window.calShowTimeDropdown = function(which) {
  const dropId = `cal-${which}-dropdown`;
  const inp    = el(`cal-ev-${which}-time`);
  const drop   = el(dropId);
  if (!drop || !inp) return;
  const cur = inp.value;
  drop.innerHTML = calBuildTimeOptions().map(t =>
    `<div class="cal-time-opt${t===cur?' is-active':''}" onmousedown="calPickTime('${which}','${t}')">${t}</div>`
  ).join('');
  drop.classList.add('is-open');
  setTimeout(() => {
    const active = drop.querySelector('.is-active');
    if (active) { active.scrollIntoView({block:'center'}); return; }
    const h = parseInt(cur||'09') || 9;
    drop.children[h*2]?.scrollIntoView({block:'center'});
  }, 10);
};

window.calPickTime = function(which, t) {
  const inp = el(`cal-ev-${which}-time`);
  if (inp) inp.value = t;
  // Auto-advance end time when start is picked
  if (which === 'start') {
    const [hh, mm] = t.split(':').map(Number);
    const et = el('cal-ev-end-time');
    if (et && !et.value) et.value = `${pad((hh+1)%24)}:${pad(mm)}`;
    const sd = el('cal-ev-start-date'), ed = el('cal-ev-end-date');
    if (sd && ed && !ed.value) ed.value = sd.value;
  }
};

// Use mousedown (not blur) to hide — avoids race condition where blur fires before click
window.calHideDropdown = function(id) {
  // Small delay allows onmousedown on option to fire first
  setTimeout(() => el(id)?.classList.remove('is-open'), 120);
};

/* ── HELPERS: read split date+time fields ── */
function calGetISO(dateId, timeId) {
  const dv = el(dateId)?.value;
  if (!dv) return null;
  const isHidden = el(timeId)?.classList.contains('is-hidden');
  if (isHidden) {
    // all-day: use midnight local
    return new Date(dv + 'T00:00:00').toISOString();
  }
  const tv = (el(timeId)?.value || '00:00').trim();
  // Validate HH:MM
  if (!/^\d{1,2}:\d{2}$/.test(tv)) return null;
  const [hh, mm] = tv.split(':').map(Number);
  if (hh > 23 || mm > 59) return null;
  const d = new Date(dv + 'T00:00:00');
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

function calSetFields(dateId, timeId, isoStr) {
  if (!isoStr) return;
  if (el(dateId)) el(dateId).value = calLocalDate(isoStr);
  if (el(timeId)) el(timeId).value = calLocalTime(isoStr);
}

/* ── CREATOR: use current app user (S.user), not first participant ── */
function calCurrentMemberId() {
  return S.user === 'Юля' ? MEMBER_IDS.yulia : MEMBER_IDS.vova;
}

/* ── SAVE EVENT ── */
window.saveCalEvent = async function() {
  const title = el('cal-ev-title').value.trim();
  if (!title) { toast('Введите название'); return; }

  const isAllDay = el('cal-ev-allday').checked;
  let start_at   = calGetISO('cal-ev-start-date', 'cal-ev-start-time');
  let end_at     = calGetISO('cal-ev-end-date',   'cal-ev-end-time');

  if (!start_at) { toast('Укажите дату начала'); return; }
  if (!end_at)   { toast('Укажите дату окончания'); return; }

  // All-day: set end to end-of-day (23:59:59)
  if (isAllDay) {
    const endDate = el('cal-ev-end-date').value || el('cal-ev-start-date').value;
    const d = new Date(endDate + 'T00:00:00');
    d.setHours(23, 59, 59, 0);
    end_at = d.toISOString();
    // Also normalise start to midnight
    start_at = new Date(el('cal-ev-start-date').value + 'T00:00:00').toISOString();
  }

  if (new Date(end_at) <= new Date(start_at)) {
    toast('Конец должен быть после начала'); return;
  }

  const desc     = el('cal-ev-desc').value.trim() || null;
  const location = el('cal-ev-location').value.trim() || null;
  // creator = current app user; participants are independent
  const creatorId = calCurrentMemberId();

  const btn = el('modal-cal-event').querySelector('.btn-modal-save');
  btn.disabled = true; btn.textContent = 'Сохраняем...';

  try {
    if (CAL.editId) {
      const { error } = await sb.from('calendar_events').update({
        title, description: desc, start_at, end_at, is_all_day: isAllDay,
        location, updated_by_member_id: creatorId,
      }).eq('id', CAL.editId);
      if (error) throw error;
      // Replace participants atomically
      await sb.from('calendar_event_participants').delete().eq('event_id', CAL.editId);
      await calInsertParticipants(CAL.editId, creatorId);
      toast('✅ Событие обновлено');
    } else {
      const id = crypto.randomUUID();
      const { error } = await sb.from('calendar_events').insert({
        id, family_id: FID, title, description: desc, start_at, end_at,
        is_all_day: isAllDay, location,
        created_by_member_id: creatorId, updated_by_member_id: creatorId,
        status: 'active', source: 'internal',
      });
      if (error) throw error;
      await calInsertParticipants(id, creatorId);
      toast('✅ Событие создано');
    }
    closeCalEventModal();
    // Reload and refresh — navigate to event's date
    const evDate = calLocalDate(start_at);
    await calLoadEvents();
    calRender();
    // Update aside for the event's actual date (may differ from selDate)
    CAL.selDate = evDate;
    calUpdateAside(evDate);
    // Refresh drawer if open on mobile
    if (el('cal-drawer').classList.contains('is-open')) calOpenDrawer(evDate);
  } catch(err) {
    console.error(err);
    toast('Ошибка: ' + (err.message || 'неизвестная ошибка'));
  }
  btn.disabled = false; btn.textContent = 'Сохранить';
};

async function calInsertParticipants(eventId, creatorId) {
  const rows = [];
  if (CAL.participants.vova)  rows.push({ event_id: eventId, member_id: MEMBER_IDS.vova,  role: MEMBER_IDS.vova  === creatorId ? 'owner' : 'participant' });
  if (CAL.participants.yulia) rows.push({ event_id: eventId, member_id: MEMBER_IDS.yulia, role: MEMBER_IDS.yulia === creatorId ? 'owner' : 'participant' });
  if (!rows.length) return; // guard: should never happen due to UI constraint
  const { error } = await sb.from('calendar_event_participants').insert(rows);
  if (error) throw error;
}

/* ── EDIT EVENT ── */
window.calEditEvent = function(id) {
  const ev = CAL.events.find(e => e.id === id);
  if (!ev) return;
  CAL.editId = id;
  el('cal-modal-title').textContent = 'Редактировать событие';
  el('cal-ev-title').value    = ev.title || '';
  el('cal-ev-desc').value     = ev.description || '';
  el('cal-ev-location').value = ev.location || '';
  el('cal-ev-allday').checked = !!ev.is_all_day;

  if (ev.is_all_day) {
    el('cal-ev-start-date').value = calLocalDate(ev.start_at);
    el('cal-ev-end-date').value   = calLocalDate(ev.end_at);
    el('cal-ev-start-time').classList.add('is-hidden');
    el('cal-ev-end-time').classList.add('is-hidden');
    document.querySelectorAll('.cal-time-row').forEach(r => r.classList.add('is-allday'));
  } else {
    calSetFields('cal-ev-start-date', 'cal-ev-start-time', ev.start_at);
    calSetFields('cal-ev-end-date',   'cal-ev-end-time',   ev.end_at);
    el('cal-ev-start-time').classList.remove('is-hidden');
    el('cal-ev-end-time').classList.remove('is-hidden');
    document.querySelectorAll('.cal-time-row').forEach(r => r.classList.remove('is-allday'));
  }

  CAL.participants = {
    vova:  !!(ev.participants?.includes(MEMBER_IDS.vova)),
    yulia: !!(ev.participants?.includes(MEMBER_IDS.yulia)),
  };
  if (!CAL.participants.vova && !CAL.participants.yulia) CAL.participants.vova = true;
  calUpdateParticipantUI();

  el('modal-cal-event').classList.add('is-open');
  el('cal-modal-del-btn').classList.remove('is-hidden');
};

/* ── DELETE EVENT (soft delete) ── */
window.calDeleteEvent = async function(id) {
  const ev    = CAL.events.find(e => e.id === id);
  const title = ev?.title || 'событие';
  const ok    = await showConfirm('Удалить событие?', `"${title}" будет удалено.`);
  if (!ok) return;
  try {
    const { error } = await sb.from('calendar_events').update({
      deleted_at: new Date().toISOString(), status: 'deleted',
    }).eq('id', id);
    if (error) throw error;
    toast('🗑 Событие удалено');
    // Optimistic local removal
    CAL.events = CAL.events.filter(e => e.id !== id);
    calRender();
    if (CAL.selDate) calUpdateAside(CAL.selDate);
    if (el('cal-drawer').classList.contains('is-open') && CAL.selDate) calOpenDrawer(CAL.selDate);
  } catch(err) {
    toast('Ошибка: ' + err.message);
    await calLoadEvents(); calRender();
  }
};

/* ── DRAG AND DROP ── */
(function initCalDnD() {
  let dragging   = null;
  let touchId    = null;
  let longTimer  = null;
  let isDragging = false;
  const ghost    = document.getElementById('cal-drag-ghost');

  function showGhost(title, x, y) {
    if (!ghost) return;
    ghost.textContent = '📅 ' + (title||'…');
    ghost.style.display = 'block';
    ghost.style.left = (x + 12) + 'px';
    ghost.style.top  = (y - 10) + 'px';
  }
  function hideGhost() { if (ghost) ghost.style.display = 'none'; }
  function clearAll() {
    document.querySelectorAll('.is-dragging').forEach(p => p.classList.remove('is-dragging'));
    document.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
    dragging = null; touchId = null; isDragging = false;
    hideGhost();
  }

  function getDropTarget(el) {
    return el?.closest('.cal-day-slot[data-date][data-hour], .cal-cell[data-date], .cal-week-col[data-date]');
  }

  /* ── Mouse DnD ── */
  document.addEventListener('dragstart', e => {
    const pill = e.target.closest('[data-event-id][draggable]');
    if (!pill) return;
    const slot = pill.closest('.cal-day-slot[data-hour]');
    dragging = {
      id:       pill.dataset.eventId,
      origDate: pill.dataset.date,
      origHour: slot ? slot.dataset.hour : null,
      title:    pill.dataset.title || pill.textContent.trim().slice(0, 30),
    };
    pill.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragging.id);
    if (ghost) {
      ghost.textContent = '📅 ' + dragging.title;
      ghost.style.left = '-9999px'; ghost.style.display = 'block';
      try { e.dataTransfer.setDragImage(ghost, -10, 20); } catch(_) {}
      setTimeout(hideGhost, 0);
    }
  });

  document.addEventListener('dragover', e => {
    const target = getDropTarget(e.target);
    if (!target || !dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!target.classList.contains('drag-over')) {
      document.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
      target.classList.add('drag-over');
    }
  });

  document.addEventListener('dragleave', e => {
    const t = getDropTarget(e.target);
    if (t && !t.contains(e.relatedTarget)) t.classList.remove('drag-over');
  });

  document.addEventListener('drop', async e => {
    e.preventDefault();
    document.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
    const target = getDropTarget(e.target);
    if (!target || !dragging) { clearAll(); return; }
    const newDate = target.dataset.date;
    const rawHour = target.dataset.hour;
    const newHour = (rawHour !== undefined && rawHour !== 'allday') ? parseInt(rawHour) : null;
    const origHourInt = (dragging.origHour !== null && dragging.origHour !== 'allday') ? parseInt(dragging.origHour) : null;
    if (newDate !== dragging.origDate || newHour !== origHourInt) {
      await calMoveEventToDateHour(dragging.id, newDate, newHour);
    }
    clearAll();
  });

  document.addEventListener('dragend', clearAll);

  /* ── Touch DnD — long press 600ms, separate from swipe-to-delete ── */
  document.addEventListener('touchstart', e => {
    const pill = e.target.closest('[data-event-id][draggable]');
    if (!pill || e.target.closest('.tx-swipe-wrap')) return;
    const touch = e.touches[0];
    longTimer = setTimeout(() => {
      isDragging = true;
      const slot = pill.closest('.cal-day-slot[data-hour]');
      dragging = {
        id:       pill.dataset.eventId,
        origDate: pill.dataset.date,
        origHour: slot ? slot.dataset.hour : null,
        title:    pill.dataset.title || pill.textContent.trim().slice(0, 30),
      };
      touchId = touch.identifier;
      pill.classList.add('is-dragging');
      showGhost(dragging.title, touch.clientX, touch.clientY);
      try { navigator.vibrate && navigator.vibrate([40]); } catch(_) {}
    }, 600);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!isDragging) { clearTimeout(longTimer); longTimer = null; return; }
    if (!dragging) return;
    const t = Array.from(e.touches).find(x => x.identifier === touchId);
    if (!t) return;
    showGhost(dragging.title, t.clientX, t.clientY);
    document.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
    getDropTarget(document.elementFromPoint(t.clientX, t.clientY))?.classList.add('drag-over');
  }, { passive: true });

  document.addEventListener('touchend', async e => {
    clearTimeout(longTimer); longTimer = null;
    if (!isDragging || !dragging) { isDragging = false; return; }
    e.preventDefault();
    const t = Array.from(e.changedTouches).find(x => x.identifier === touchId);
    document.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
    if (t) {
      const target = getDropTarget(document.elementFromPoint(t.clientX, t.clientY));
      if (target?.dataset.date) {
        const newDate = target.dataset.date;
        const rawHour = target.dataset.hour;
        const newHour = (rawHour !== undefined && rawHour !== 'allday') ? parseInt(rawHour) : null;
        const origHourInt = (dragging.origHour !== null && dragging.origHour !== 'allday') ? parseInt(dragging.origHour) : null;
        if (newDate !== dragging.origDate || newHour !== origHourInt) {
          await calMoveEventToDateHour(dragging.id, newDate, newHour);
        }
      }
    }
    clearAll();
  }, { passive: false });

  document.addEventListener('touchcancel', () => {
    clearTimeout(longTimer); longTimer = null; clearAll();
  }, { passive: true });
})();


/* Move event to new date and optionally new hour */
async function calMoveEventToDateHour(eventId, newDate, newHour) {
  const ev = CAL.events.find(e => e.id === eventId);
  if (!ev) return;

  const origStart = new Date(ev.start_at);
  const dur       = new Date(ev.end_at) - origStart;
  const [ny,nm,nd] = newDate.split('-').map(Number);

  // Determine target hour: if newHour given use it, else keep original
  const targetH = (newHour !== null && newHour !== undefined) ? newHour : origStart.getHours();
  const targetM = origStart.getMinutes(); // preserve minutes

  const newStart = new Date(ny, nm-1, nd, targetH, targetM, 0, 0);
  const newEnd   = new Date(newStart.getTime() + dur);

  // Build toast message
  const timeInfo = newHour !== null ? ` → ${pad(targetH)}:${pad(targetM)}` : '';
  const dateInfo = newDate !== calLocalDate(ev.start_at) ? ` (${newDate.slice(5)})` : '';

  try {
    const { error } = await sb.from('calendar_events').update({
      start_at: newStart.toISOString(),
      end_at:   newEnd.toISOString(),
    }).eq('id', eventId);
    if (error) throw error;
    toast(`✅ Перенесено${dateInfo}${timeInfo}`);
    // Optimistic local update
    const idx = CAL.events.findIndex(e => e.id === eventId);
    if (idx !== -1) CAL.events[idx] = { ...CAL.events[idx], start_at: newStart.toISOString(), end_at: newEnd.toISOString() };
    calRender();
    if (CAL.selDate) calUpdateAside(CAL.selDate);
  } catch(err) {
    toast('Ошибка переноса: ' + err.message);
    await calLoadEvents(); calRender();
  }
}

/* ── INIT ── */
lload();
go('home');
loadCloud();

/* ── ENTER KEY on amount input ── */
el('amount-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addTx(); }
});

/* ── SWIPE-TO-DELETE (mobile, list screen only) ── */
(function initSwipe() {
  const THRESHOLD = 60; // px to trigger delete
  let startX = 0, startY = 0, wrap = null, inner = null, dragging = false, locked = false;

  function getWrap(target) {
    return target.closest('.tx-swipe-wrap');
  }

  function resetAll(except) {
    document.querySelectorAll('.tx-swipe-item.snapped').forEach(el => {
      if (el.closest('.tx-swipe-wrap') !== except) {
        el.classList.remove('snapped');
        el.closest('.tx-swipe-wrap')?.classList.remove('swiping');
      }
    });
  }

  document.addEventListener('touchstart', e => {
    if (window.innerWidth >= 1024) return;
    wrap = getWrap(e.target);
    if (!wrap) { resetAll(null); return; }
    inner = wrap.querySelector('.tx-swipe-item');
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = false;
    locked = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!wrap || !inner || window.innerWidth >= 1024) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!locked) {
      if (Math.abs(dy) > Math.abs(dx)) { wrap = null; return; } // vertical scroll
      locked = true;
    }
    if (dx > 0) { // swiping right — snap back
      inner.style.transform = 'translateX(0)';
      inner.classList.remove('snapped');
      wrap.classList.remove('swiping');
      return;
    }
    dragging = true;
    const x = Math.max(-90, dx);
    inner.style.transform = `translateX(${x}px)`;
    wrap.classList.toggle('swiping', x < -20);
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (!wrap || !inner || !dragging || window.innerWidth >= 1024) return;
    const dx = e.changedTouches[0].clientX - startX;
    inner.style.transform = '';

    if (dx < -THRESHOLD) {
      inner.classList.add('snapped');
      wrap.classList.add('swiping');
      resetAll(wrap);
    } else {
      inner.classList.remove('snapped');
      wrap.classList.remove('swiping');
    }
    dragging = false;
  }, { passive: true });

  // tap on the red bg to confirm delete
  document.addEventListener('click', e => {
    const bg = e.target.closest('.tx-swipe-bg');
    if (!bg) return;
    const w = bg.closest('.tx-swipe-wrap');
    if (!w) return;
    const id = w.dataset.id;
    if (id) delTx(id);
  });
})();
