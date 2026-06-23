let sb, user = null;
let casas = [], grupos = [], apostas = [], editandoId = null;
let filtroDe = null, filtroAte = null, menuApostaId = null;
let config = { banco: 0, limite_perda_dia: 0 };
let selecionadas = new Set();

const $ = (id) => document.getElementById(id);
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = () => new Date().toISOString().slice(0, 10);

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// lucro líquido conforme resultado
function calcLucro({ resultado, valor, retorno_potencial }) {
  const v = Number(valor) || 0, ret = Number(retorno_potencial) || 0;
  if (resultado === 'ganhou') return +(ret - v).toFixed(2);
  if (resultado === 'perdeu') return +(-v).toFixed(2);
  return 0;
}

// ============ AUTENTICAÇÃO ============
function initSupabase() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    $('authMsg').textContent = 'Configuração do Supabase ausente. Verifique as variáveis no Vercel.';
    $('authMsg').className = 'auth-msg erro';
    return false;
  }
  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  return true;
}

async function checarSessao() {
  const { data } = await sb.auth.getSession();
  if (data.session) { user = data.session.user; entrarApp(); }
}

$('btnEntrar').onclick = async () => {
  const email = $('authEmail').value.trim(), senha = $('authSenha').value;
  if (!email || !senha) return setAuthMsg('Preencha e-mail e senha.', 'erro');
  setAuthMsg('Entrando...', '');
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) return setAuthMsg('E-mail ou senha incorretos.', 'erro');
  user = data.user; entrarApp();
};

$('btnCadastrar').onclick = async () => {
  const email = $('authEmail').value.trim(), senha = $('authSenha').value;
  if (!email || !senha) return setAuthMsg('Preencha e-mail e senha.', 'erro');
  if (senha.length < 6) return setAuthMsg('A senha precisa ter ao menos 6 caracteres.', 'erro');
  setAuthMsg('Criando conta...', '');
  const { data, error } = await sb.auth.signUp({ email, password: senha });
  if (error) return setAuthMsg('Erro: ' + error.message, 'erro');
  if (data.session) { user = data.user; entrarApp(); }
  else setAuthMsg('Conta criada! Confirme pelo e-mail (se exigido) e clique em Entrar.', 'ok');
};

$('btnSair').onclick = async () => { await sb.auth.signOut(); location.reload(); };

function setAuthMsg(msg, cls) { const m = $('authMsg'); m.textContent = msg; m.className = 'auth-msg ' + cls; }

function entrarApp() {
  document.body.classList.add('logado');
  setPeriodo('mes');
  carregar();
}

// ============ ABAS ============
document.querySelectorAll('nav.tabs button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('nav.tabs button').forEach(x => x.classList.remove('ativo'));
    b.classList.add('ativo');
    ['painel', 'apostas', 'casas', 'grupos'].forEach(t => $('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
  };
});

// ============ FILTROS DE DATA ============
function setPeriodo(p) {
  const d = new Date();
  if (p === 'tudo') { filtroDe = null; filtroAte = null; }
  else if (p === 'hoje') { filtroDe = hoje(); filtroAte = hoje(); }
  else if (p === '7') { const x = new Date(d.getTime() - 6 * 864e5); filtroDe = x.toISOString().slice(0, 10); filtroAte = hoje(); }
  else if (p === 'mes') { filtroDe = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; filtroAte = hoje(); }
  $('fDe').value = filtroDe || ''; $('fAte').value = filtroAte || '';
  document.querySelectorAll('.chips-periodo button').forEach(x => x.classList.toggle('ativo', x.dataset.p === p));
}
document.querySelectorAll('.chips-periodo button').forEach(b => {
  b.onclick = () => { setPeriodo(b.dataset.p); renderPainel(); };
});
$('fDe').onchange = () => { filtroDe = $('fDe').value || null; limparChips(); renderPainel(); };
$('fAte').onchange = () => { filtroAte = $('fAte').value || null; limparChips(); renderPainel(); };
function limparChips() { document.querySelectorAll('.chips-periodo button').forEach(x => x.classList.remove('ativo')); }

function apostasFiltradas() {
  return apostas.filter(a => {
    if (filtroDe && a.data_aposta < filtroDe) return false;
    if (filtroAte && a.data_aposta > filtroAte) return false;
    return true;
  });
}

// ============ CARREGAR ============
async function carregar() {
  const [c, g, a, cf] = await Promise.all([
    sb.from('casas').select('*').order('nome'),
    sb.from('grupos').select('*').order('nome'),
    sb.from('apostas').select('*, casas(nome), grupos(nome)').order('data_aposta', { ascending: false }).order('criado_em', { ascending: false }),
    sb.from('config').select('*').eq('user_id', user.id).maybeSingle()
  ]);
  if (c.error || g.error || a.error) { toast('Erro ao carregar dados.'); return; }
  casas = c.data; grupos = g.data; apostas = a.data;
  config = (cf && !cf.error && cf.data) ? cf.data : { banco: 0, limite_perda_dia: 0 };
  preencherSelects(); renderBanco(); renderCasas(); renderGrupos(); renderApostas(); renderPainel();
}

function preencherSelects() {
  $('aCasa').innerHTML = casas.length ? casas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('') : '<option value="">— cadastre uma casa —</option>';
  $('aGrupo').innerHTML = '<option value="">— sem grupo —</option>' + grupos.map(g => `<option value="${g.id}">${g.nome}</option>`).join('');
  // filtros da aba apostas (preserva seleção atual)
  const fc = $('filCasa'), fg = $('filGrupo');
  if (fc) { const v = fc.value; fc.innerHTML = '<option value="">Todas</option>' + casas.map(c => `<option value="${c.id}">${c.nome}</option>`).join(''); fc.value = v; }
  if (fg) { const v = fg.value; fg.innerHTML = '<option value="">Todos</option>' + grupos.map(g => `<option value="${g.id}">${g.nome}</option>`).join(''); fg.value = v; }
}

// ============ PAINEL ============
function renderPainel() {
  const lista = apostasFiltradas();
  const lucro = lista.reduce((s, a) => s + Number(a.lucro), 0);
  const apostado = lista.reduce((s, a) => s + Number(a.valor), 0);
  const saldo = casas.reduce((s, c) => s + Number(c.saldo), 0);
  const estimado = lista.filter(a => a.resultado === 'pendente').reduce((s, a) => s + (Number(a.retorno_potencial) || 0), 0);
  const fechadas = lista.filter(a => a.resultado === 'ganhou' || a.resultado === 'perdeu');
  const ganhas = lista.filter(a => a.resultado === 'ganhou').length;
  const taxa = fechadas.length ? Math.round(ganhas / fechadas.length * 100) : 0;
  const roi = apostado ? Math.round(lucro / apostado * 1000) / 10 : 0;
  const pendentes = lista.filter(a => a.resultado === 'pendente').length;

  $('kpiLucro').textContent = brl(lucro); $('kpiLucro').className = 'big num ' + (lucro >= 0 ? 'pos' : 'neg');
  $('kpiApostado').textContent = brl(apostado);
  $('kpiEstimado').textContent = brl(estimado);
  $('kpiSaldo').textContent = brl(patrimonio());
  $('bancaTotal').textContent = brl(patrimonio());
  $('kpiQtd').textContent = lista.length;
  $('kpiTaxa').textContent = taxa + '%';
  $('kpiRoi').textContent = roi + '%'; $('kpiRoi').className = 'big num ' + (roi >= 0 ? 'pos' : 'neg');
  $('kpiPendentes').textContent = pendentes;

  $('porCasa').innerHTML = agrupar(lista, 'casa_id', casas) || '<div class="empty">Sem apostas no período.</div>';
  $('porGrupo').innerHTML = agrupar(lista, 'grupo_id', grupos, true) || '<div class="empty">Sem apostas com grupo no período.</div>';

  renderAlertaLimite();
  renderGrafico(lista);
  renderComparativos();
}

// inclui o saldo do Banco no total exibido no topo
function patrimonio() {
  return casas.reduce((s, c) => s + Number(c.saldo), 0) + Number(config.banco || 0);
}

// ===== Alerta de limite de perda diário =====
function renderAlertaLimite() {
  const el = $('alertaLimite'); if (!el) return;
  const limite = Number(config.limite_perda_dia) || 0;
  if (limite <= 0) { el.classList.add('hidden'); return; }
  const hojeStr = hoje();
  const perdaHoje = apostas.filter(a => a.data_aposta === hojeStr).reduce((s, a) => s + Number(a.lucro), 0);
  if (perdaHoje >= 0) { el.classList.add('hidden'); return; }
  const perda = Math.abs(perdaHoje);
  el.classList.remove('hidden');
  if (perda >= limite) {
    el.className = 'alerta-limite estouro';
    el.innerHTML = `⚠ Você atingiu seu limite de perda do dia (${brl(perda)} de ${brl(limite)}). Considere parar por hoje.`;
  } else if (perda >= limite * 0.8) {
    el.className = 'alerta-limite aviso';
    el.innerHTML = `⚠ Atenção: perda de hoje em ${brl(perda)}, perto do limite de ${brl(limite)}.`;
  } else {
    el.classList.add('hidden');
  }
}

// ===== Gráfico de evolução da banca (lucro acumulado por dia) =====
function renderGrafico(lista) {
  const cont = $('grafico'); if (!cont) return;
  const fechadas = lista.filter(a => a.resultado !== 'pendente');
  if (fechadas.length < 2) { cont.innerHTML = '<div class="empty">Registre apostas com resultado para ver a curva.</div>'; return; }
  // soma lucro por dia
  const porDia = {};
  fechadas.forEach(a => { porDia[a.data_aposta] = (porDia[a.data_aposta] || 0) + Number(a.lucro); });
  const dias = Object.keys(porDia).sort();
  let acc = 0;
  const pts = dias.map(d => { acc += porDia[d]; return { d, v: acc }; });

  const W = 760, H = 240, pad = { t: 16, r: 16, b: 28, l: 56 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const vals = pts.map(p => p.v).concat([0]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const x = i => pad.l + (pts.length === 1 ? iw / 2 : i / (pts.length - 1) * iw);
  const y = v => pad.t + ih - ((v - min) / range) * ih;
  const linha = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${linha} L${x(pts.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;
  const zeroY = y(0);
  const cor = acc >= 0 ? 'var(--verde)' : 'var(--vermelho)';
  const fmtData = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  // rótulos do eixo X (no máx 6)
  const passo = Math.ceil(pts.length / 6);
  const labelsX = pts.map((p, i) => (i % passo === 0 || i === pts.length - 1)
    ? `<text x="${x(i)}" y="${H - 8}" fill="var(--cinza)" font-size="11" text-anchor="middle" font-family="Oswald">${fmtData(p.d)}</text>` : '').join('');

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="graf-svg" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad.l}" y1="${zeroY}" x2="${W - pad.r}" y2="${zeroY}" stroke="var(--linha)" stroke-dasharray="4 4"/>
    <text x="${pad.l - 8}" y="${y(max) + 4}" fill="var(--cinza)" font-size="11" text-anchor="end" font-family="Oswald">${brl(max)}</text>
    <text x="${pad.l - 8}" y="${y(min) + 4}" fill="var(--cinza)" font-size="11" text-anchor="end" font-family="Oswald">${brl(min)}</text>
    <path d="${area}" fill="${cor}" opacity="0.12"/>
    <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3" fill="${cor}"/>`).join('')}
    ${labelsX}
  </svg>
  <div style="text-align:center;font-size:13px;color:var(--cinza);margin-top:6px">Lucro acumulado no período: <strong class="${acc >= 0 ? 'pos' : 'neg'}">${brl(acc)}</strong></div>`;
}

// ===== Comparativos: dia, semana e mês contra o período anterior =====
function somaLucroEntre(de, ate) {
  return apostas.filter(a => a.data_aposta >= de && a.data_aposta <= ate)
    .reduce((acc, a) => { acc.lucro += Number(a.lucro); acc.qtd++; if (a.resultado === 'ganhou') acc.g++; if (a.resultado === 'ganhou' || a.resultado === 'perdeu') acc.f++; return acc; },
      { lucro: 0, qtd: 0, g: 0, f: 0 });
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

function renderComparativos() {
  const cont = $('comparativos'); if (!cont) return;
  const hj = new Date();
  // DIA
  const ontem = new Date(hj.getTime() - 864e5);
  const dia = somaLucroEntre(isoDate(hj), isoDate(hj));
  const diaAnt = somaLucroEntre(isoDate(ontem), isoDate(ontem));
  // SEMANA (segunda a domingo)
  const diaSem = (hj.getDay() + 6) % 7; // 0 = segunda
  const ini = new Date(hj.getTime() - diaSem * 864e5);
  const iniAnt = new Date(ini.getTime() - 7 * 864e5);
  const fimAnt = new Date(ini.getTime() - 864e5);
  const sem = somaLucroEntre(isoDate(ini), isoDate(hj));
  const semAnt = somaLucroEntre(isoDate(iniAnt), isoDate(fimAnt));
  // MÊS
  const iniMes = new Date(hj.getFullYear(), hj.getMonth(), 1);
  const iniMesAnt = new Date(hj.getFullYear(), hj.getMonth() - 1, 1);
  const fimMesAnt = new Date(hj.getFullYear(), hj.getMonth(), 0);
  const mes = somaLucroEntre(isoDate(iniMes), isoDate(hj));
  const mesAnt = somaLucroEntre(isoDate(iniMesAnt), isoDate(fimMesAnt));

  cont.innerHTML = [
    cardComp('Hoje', dia, diaAnt, 'ontem'),
    cardComp('Esta semana', sem, semAnt, 'semana passada'),
    cardComp('Este mês', mes, mesAnt, 'mês passado')
  ].join('');
}
function cardComp(titulo, atual, anterior, refLabel) {
  const cls = atual.lucro >= 0 ? 'pos' : 'neg';
  const diff = atual.lucro - anterior.lucro;
  const seta = diff > 0 ? '▲' : diff < 0 ? '▼' : '–';
  const dcls = diff > 0 ? 'pos' : diff < 0 ? 'neg' : '';
  const taxa = atual.f ? Math.round(atual.g / atual.f * 100) : 0;
  return `<div class="comp-card">
    <div class="titulo">${titulo}</div>
    <div class="valor num ${cls}">${brl(atual.lucro)}</div>
    <div class="delta ${dcls}">${seta} ${brl(Math.abs(diff))} vs ${refLabel}</div>
    <div class="sub">${atual.qtd} aposta(s) · ${taxa}% acerto</div>
  </div>`;
}

function agrupar(lista, campo, ref, incluirSem) {
  const map = {};
  lista.forEach(a => {
    const k = a[campo] || 'sem';
    if (k === 'sem' && !incluirSem) return;
    if (!map[k]) map[k] = { lucro: 0, qtd: 0 };
    map[k].lucro += Number(a.lucro); map[k].qtd++;
  });
  const ent = Object.entries(map);
  if (!ent.length) return '';
  const maxAbs = Math.max(...ent.map(([, v]) => Math.abs(v.lucro)), 1);
  return ent.sort((a, b) => b[1].lucro - a[1].lucro).map(([k, v]) => {
    const nome = k === 'sem' ? 'Sem grupo' : (ref.find(x => x.id === k)?.nome || '—');
    const pct = Math.abs(v.lucro) / maxAbs * 100;
    const cls = v.lucro >= 0 ? 'pos' : 'neg', fill = v.lucro >= 0 ? 'fill-pos' : 'fill-neg';
    return `<div class="barra-casa"><div class="lbl"><span>${nome} <span style="color:var(--cinza)">· ${v.qtd}</span></span><strong class="num ${cls}">${brl(v.lucro)}</strong></div><div class="track"><div class="${fill}" style="width:${pct}%"></div></div></div>`;
  }).join('');
}

// ============ APOSTAS ============
function apostasDaAba() {
  const fCasa = $('filCasa')?.value || '';
  const fGrupo = $('filGrupo')?.value || '';
  const fRes = $('filResultado')?.value || '';
  const vMin = $('filValMin')?.value !== '' ? Number($('filValMin').value) : null;
  const vMax = $('filValMax')?.value !== '' ? Number($('filValMax').value) : null;
  const de = $('filDe')?.value || '';
  const ate = $('filAte')?.value || '';
  const busca = ($('filBusca')?.value || '').toLowerCase().trim();
  return apostas.filter(a => {
    if (fCasa && a.casa_id !== fCasa) return false;
    if (fGrupo && (a.grupo_id || '') !== fGrupo) return false;
    if (fRes && a.resultado !== fRes) return false;
    if (vMin !== null && Number(a.valor) < vMin) return false;
    if (vMax !== null && Number(a.valor) > vMax) return false;
    if (de && a.data_aposta < de) return false;
    if (ate && a.data_aposta > ate) return false;
    if (busca && !((a.descricao || '').toLowerCase().includes(busca) || (a.casas?.nome || '').toLowerCase().includes(busca))) return false;
    return true;
  });
}

function renderApostas() {
  if (!apostas.length) { $('tabelaApostas').innerHTML = '<div class="empty">Registre sua primeira aposta no botão + Nova aposta.</div>'; if ($('filResumo')) $('filResumo').textContent = ''; return; }
  const lista = apostasDaAba();
  if ($('filResumo')) {
    const tot = lista.reduce((s, a) => s + Number(a.lucro), 0);
    $('filResumo').innerHTML = `${lista.length} aposta(s) · resultado <strong class="${tot >= 0 ? 'pos' : 'neg'}">${brl(tot)}</strong>`;
  }
  if (!lista.length) { $('tabelaApostas').innerHTML = '<div class="empty">Nenhuma aposta com esses filtros.</div>'; atualizarBarraLote(); return; }
  $('tabelaApostas').innerHTML = `<table class="tbl-apostas"><thead><tr>
    <th style="width:32px"></th><th>Data</th><th>Casa</th><th>Grupo</th><th>Descrição</th><th>Valor</th><th>Odd</th><th>Resultado</th><th>Lucro</th><th></th></tr></thead><tbody>${lista.map(a => {
      const d = a.data_aposta.split('-').reverse().join('/');
      const lc = Number(a.lucro) > 0 ? 'pos' : Number(a.lucro) < 0 ? 'neg' : '';
      const label = { ganhou: 'green', perdeu: 'red', devolvida: 'devolvida', pendente: 'pendente' }[a.resultado];
      const chk = selecionadas.has(a.id) ? 'checked' : '';
      return `<tr>
        <td data-label="" class="cel-chk"><input type="checkbox" class="chk-aposta" ${chk} onchange="toggleSel('${a.id}',this.checked)"></td>
        <td data-label="Data" class="num">${d}</td>
        <td data-label="Casa" class="cel-casa">${a.casas?.nome || '—'}</td>
        <td data-label="Grupo">${a.grupos?.nome || '—'}</td>
        <td data-label="Descrição">${a.descricao || '—'}</td>
        <td data-label="Valor" class="num">${brl(a.valor)}</td>
        <td data-label="Odd" class="num">${a.odd || '—'}</td>
        <td data-label="Resultado"><span class="tag t-${a.resultado}" onclick="abrirMenu(event,'${a.id}')">${label} ▾</span></td>
        <td data-label="Lucro" class="num ${lc}"><strong>${brl(a.lucro)}</strong></td>
        <td class="cel-acoes" style="white-space:nowrap"><button class="mini" style="color:var(--dourado)" onclick="editar('${a.id}')">editar</button><button class="mini" onclick="excluirAposta('${a.id}')">excluir</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
  atualizarBarraLote();
}

// ===== Seleção em lote =====
window.toggleSel = (id, marcado) => {
  if (marcado) selecionadas.add(id); else selecionadas.delete(id);
  atualizarBarraLote();
};
function atualizarBarraLote() {
  const barra = $('barraLote'); if (!barra) return;
  // mantém só ids que ainda estão visíveis
  const visiveis = new Set(apostasDaAba().map(a => a.id));
  selecionadas = new Set([...selecionadas].filter(id => visiveis.has(id)));
  if (!selecionadas.size) { barra.classList.add('hidden'); return; }
  barra.classList.remove('hidden');
  $('loteContador').textContent = selecionadas.size + ' selecionada(s)';
}
async function aplicarLote(novo) {
  if (!selecionadas.size) return;
  const ids = [...selecionadas];
  for (const id of ids) {
    const a = apostas.find(x => x.id === id); if (!a) continue;
    const novoLucro = calcLucro({ resultado: novo, valor: a.valor, retorno_potencial: a.retorno_potencial });
    await sb.from('apostas').update({ resultado: novo, lucro: novoLucro }).eq('id', id);
    await ajustarSaldoCasa(a.casa_id, novoLucro - Number(a.lucro));
  }
  selecionadas.clear();
  toast(`${ids.length} aposta(s) atualizada(s).`); await carregar();
}
document.querySelectorAll('.lote-acoes button[data-r]').forEach(b => {
  b.onclick = () => aplicarLote(b.dataset.r);
});
$('btnLimparSel') && ($('btnLimparSel').onclick = () => { selecionadas.clear(); renderApostas(); });

// liga os filtros
['filCasa', 'filGrupo', 'filResultado', 'filValMin', 'filValMax', 'filDe', 'filAte', 'filBusca'].forEach(id => {
  const el = $(id); if (!el) return;
  el.addEventListener('input', renderApostas);
  el.addEventListener('change', renderApostas);
});
$('btnLimparFiltros') && ($('btnLimparFiltros').onclick = () => {
  ['filCasa', 'filGrupo', 'filResultado', 'filValMin', 'filValMax', 'filDe', 'filAte', 'filBusca'].forEach(id => { if ($(id)) $(id).value = ''; });
  renderApostas();
});

// cálculo automático valor × odd
function recalcEstimado() {
  const v = Number($('aValor').value) || 0, o = Number($('aOdd').value) || 0;
  if (v && o) $('aRetorno').value = (v * o).toFixed(2);
}
$('aValor').oninput = recalcEstimado;
$('aOdd').oninput = recalcEstimado;

function lerForm() {
  return {
    casa_id: $('aCasa').value, grupo_id: $('aGrupo').value || null,
    valor: $('aValor').value, odd: $('aOdd').value,
    retorno_potencial: $('aRetorno').value, resultado: $('aResultado').value,
    descricao: $('aDescricao').value, data_aposta: $('aData').value || hoje()
  };
}

$('btnSalvarAposta').onclick = async () => {
  const f = lerForm();
  if (!f.casa_id) return toast('Selecione uma casa.');
  if (!f.valor) return toast('Informe o valor apostado.');
  const reg = {
    casa_id: f.casa_id, grupo_id: f.grupo_id,
    valor: Number(f.valor), odd: f.odd ? Number(f.odd) : null,
    retorno_potencial: f.retorno_potencial ? Number(f.retorno_potencial) : null,
    resultado: f.resultado, lucro: calcLucro(f), descricao: f.descricao || null,
    data_aposta: f.data_aposta, user_id: user.id
  };
  if (editandoId) {
    const antiga = apostas.find(a => a.id === editandoId);
    const { error } = await sb.from('apostas').update(reg).eq('id', editandoId);
    if (error) return toast('Erro: ' + error.message);
    await ajustarSaldoCasa(antiga.casa_id, -Number(antiga.lucro));        // desfaz antigo
    await ajustarSaldoCasa(reg.casa_id, reg.lucro);                       // aplica novo
    toast('Aposta atualizada.');
  } else {
    const { error } = await sb.from('apostas').insert(reg);
    if (error) return toast('Erro: ' + error.message);
    await ajustarSaldoCasa(reg.casa_id, reg.lucro);
    toast('Aposta registrada.');
  }
  resetForm(); fecharModal(); await carregar();
};

window.editar = (id) => {
  const a = apostas.find(x => x.id === id); if (!a) return;
  editandoId = id;
  $('aCasa').value = a.casa_id; $('aGrupo').value = a.grupo_id || '';
  $('aValor').value = a.valor; $('aOdd').value = a.odd || '';
  $('aRetorno').value = a.retorno_potencial || ''; $('aResultado').value = a.resultado;
  $('aDescricao').value = a.descricao || ''; $('aData').value = a.data_aposta;
  $('formTitulo').textContent = 'Editar aposta';
  $('btnSalvarAposta').textContent = 'Salvar alterações';
  abrirModal();
};
function resetForm() {
  editandoId = null;
  ['aValor', 'aOdd', 'aRetorno', 'aDescricao'].forEach(i => $(i).value = '');
  $('aResultado').value = 'pendente'; $('aData').value = hoje();
  $('formTitulo').textContent = 'Nova aposta';
  $('btnSalvarAposta').textContent = 'Registrar aposta';
}


// ===== MODAL NOVA APOSTA =====
function abrirModal(){ $('modalAposta').classList.remove('hidden'); }
function fecharModal(){ $('modalAposta').classList.add('hidden'); }
$('btnNovaAposta').onclick = () => { resetForm(); abrirModal(); };
$('btnFecharModal').onclick = fecharModal;
$('btnCancelarModal').onclick = () => { resetForm(); fecharModal(); };
$('modalAposta').onclick = (e) => { if (e.target.id === 'modalAposta') { resetForm(); fecharModal(); } };

window.excluirAposta = async (id) => {
  if (!confirm('Excluir esta aposta?')) return;
  const a = apostas.find(x => x.id === id);
  await sb.from('apostas').delete().eq('id', id);
  if (a) await ajustarSaldoCasa(a.casa_id, -Number(a.lucro));   // reverte efeito na banca
  toast('Aposta excluída.'); await carregar();
};

// ===== Menu de resultado rápido =====
let menuAbrindo = false;
window.abrirMenu = (ev, id) => {
  ev.stopPropagation();
  menuApostaId = id;
  const m = $('menuResultado'), r = ev.target.getBoundingClientRect();
  m.style.top = (window.scrollY + r.bottom + 6) + 'px';
  m.style.left = (window.scrollX + r.left) + 'px';
  m.classList.remove('hidden');
  menuAbrindo = true;
  setTimeout(() => { menuAbrindo = false; }, 0);
};
document.querySelectorAll('#menuResultado button').forEach(b => {
  b.onclick = async (e) => {
    e.stopPropagation();
    const a = apostas.find(x => x.id === menuApostaId); if (!a) return;
    const novo = b.dataset.r;
    const novoLucro = calcLucro({ resultado: novo, valor: a.valor, retorno_potencial: a.retorno_potencial });
    await sb.from('apostas').update({ resultado: novo, lucro: novoLucro }).eq('id', a.id);
    await ajustarSaldoCasa(a.casa_id, novoLucro - Number(a.lucro));  // aplica só a diferença
    $('menuResultado').classList.add('hidden');
    toast('Resultado atualizado.'); await carregar();
  };
});
document.addEventListener('click', () => {
  if (menuAbrindo) return;
  $('menuResultado').classList.add('hidden');
});

// ===== Ajuste de saldo da casa =====
async function ajustarSaldoCasa(casaId, delta) {
  if (!casaId || !delta) return;
  const casa = casas.find(c => c.id === casaId); if (!casa) return;
  const novo = +(Number(casa.saldo) + Number(delta)).toFixed(2);
  await sb.from('casas').update({ saldo: novo }).eq('id', casaId);
}

// ============ CASAS ============
function renderCasas() {
  if (!casas.length) { $('listaCasas').innerHTML = '<div class="empty">Adicione sua primeira casa.</div>'; return; }
  $('listaCasas').innerHTML = casas.map(c => {
    const luc = apostas.filter(a => a.casa_id === c.id).reduce((s, a) => s + Number(a.lucro), 0);
    const lc = luc >= 0 ? 'pos' : 'neg';
    return `<div class="casa-card">
      <div class="nome">${c.nome}</div>
      <div class="row"><span>Saldo atual na casa</span></div>
      <div class="saldo-grande num">${brl(c.saldo)}</div>
      <div class="row"><span>Resultado acumulado</span><strong class="num ${lc}">${brl(luc)}</strong></div>
      <div class="saldo-edit"><input type="number" step="0.01" value="${c.saldo}" id="saldo-${c.id}"><button class="acao" style="padding:7px 14px" onclick="salvarSaldo('${c.id}')">Ajustar</button></div>
      <div style="margin-top:10px"><button class="mini" onclick="excluirCasa('${c.id}')">excluir casa</button></div>
    </div>`;
  }).join('');
}
$('btnAddCasa').onclick = async () => {
  const nome = $('cNome').value.trim(); if (!nome) return toast('Informe o nome da casa.');
  const saldo = Number($('cSaldo').value) || 0;
  const { error } = await sb.from('casas').insert({ nome, saldo, saldo_inicial: saldo, user_id: user.id });
  if (error) return toast('Erro: ' + error.message);
  $('cNome').value = ''; $('cSaldo').value = ''; toast('Casa adicionada.'); await carregar();
};
window.salvarSaldo = async (id) => {
  await sb.from('casas').update({ saldo: Number($('saldo-' + id).value) || 0 }).eq('id', id);
  toast('Saldo ajustado.'); await carregar();
};
window.excluirCasa = async (id) => {
  if (!confirm('Excluir a casa e TODAS as apostas dela?')) return;
  await sb.from('casas').delete().eq('id', id); toast('Casa excluída.'); await carregar();
};

// ============ BANCO / LIMITE / TRANSFERENCIAS ============
async function salvarConfig(campos) {
  const { error } = await sb.from('config').upsert({ user_id: user.id, ...campos, atualizado_em: new Date().toISOString() });
  if (error) { toast('Erro: ' + error.message); return false; }
  return true;
}
function renderBanco() {
  if ($('bancoSaldo')) $('bancoSaldo').textContent = brl(config.banco || 0);
  if ($('limiteAtual')) $('limiteAtual').textContent = brl(config.limite_perda_dia || 0);
  if ($('patrimonioTotal')) $('patrimonioTotal').textContent = brl(patrimonio());
}
$('btnSalvarBanco') && ($('btnSalvarBanco').onclick = async () => {
  const v = Number($('bancoInput').value); if (isNaN(v)) return toast('Valor inválido.');
  if (await salvarConfig({ banco: v, limite_perda_dia: config.limite_perda_dia || 0 })) { $('bancoInput').value = ''; toast('Banco atualizado.'); await carregar(); }
});
$('btnSalvarLimite') && ($('btnSalvarLimite').onclick = async () => {
  const v = Number($('limiteInput').value); if (isNaN(v) || v < 0) return toast('Valor inválido.');
  if (await salvarConfig({ banco: config.banco || 0, limite_perda_dia: v })) { $('limiteInput').value = ''; toast('Limite salvo.'); await carregar(); }
});

// ----- Transferência -----
function opcoesTransf() {
  return '<option value="Banco">🏦 Banco</option>' + casas.map(c => `<option value="casa:${c.id}">${c.nome}</option>`).join('');
}
$('btnAbrirTransf') && ($('btnAbrirTransf').onclick = () => {
  if (!casas.length) return toast('Cadastre ao menos uma casa primeiro.');
  $('tOrigem').innerHTML = opcoesTransf();
  $('tDestino').innerHTML = opcoesTransf();
  $('tDestino').selectedIndex = 1;
  $('tValor').value = '';
  $('modalTransf').classList.remove('hidden');
});
function fecharTransf() { $('modalTransf').classList.add('hidden'); }
$('btnFecharTransf') && ($('btnFecharTransf').onclick = fecharTransf);
$('btnCancelarTransf') && ($('btnCancelarTransf').onclick = fecharTransf);
$('modalTransf') && ($('modalTransf').onclick = (e) => { if (e.target.id === 'modalTransf') fecharTransf(); });

$('btnConfirmarTransf') && ($('btnConfirmarTransf').onclick = async () => {
  const origem = $('tOrigem').value, destino = $('tDestino').value;
  const valor = Number($('tValor').value);
  if (origem === destino) return toast('Origem e destino são iguais.');
  if (!valor || valor <= 0) return toast('Informe um valor válido.');

  // saldo da origem
  const saldoOrigem = origem === 'Banco' ? Number(config.banco || 0) : Number(casas.find(c => c.id === origem.slice(5))?.saldo || 0);
  if (valor > saldoOrigem) return toast('Saldo insuficiente na origem.');

  // aplica
  let novoBanco = Number(config.banco || 0);
  if (origem === 'Banco') novoBanco -= valor;
  if (destino === 'Banco') novoBanco += valor;
  if (origem === 'Banco' || destino === 'Banco') await salvarConfig({ banco: novoBanco, limite_perda_dia: config.limite_perda_dia || 0 });
  if (origem.startsWith('casa:')) await ajustarSaldoCasa(origem.slice(5), -valor);
  if (destino.startsWith('casa:')) await ajustarSaldoCasa(destino.slice(5), valor);

  // registra histórico
  const nomeDe = origem === 'Banco' ? 'Banco' : (casas.find(c => c.id === origem.slice(5))?.nome || '—');
  const nomePara = destino === 'Banco' ? 'Banco' : (casas.find(c => c.id === destino.slice(5))?.nome || '—');
  await sb.from('transferencias').insert({ origem: nomeDe, destino: nomePara, valor, user_id: user.id });

  fecharTransf(); toast(`Transferido ${brl(valor)} de ${nomeDe} para ${nomePara}.`); await carregar();
});

// ============ GRUPOS ============
function renderGrupos() {
  if (!grupos.length) { $('listaGrupos').innerHTML = '<div class="empty">Adicione um grupo ou meio.</div>'; return; }
  $('listaGrupos').innerHTML = grupos.map(g => `<div class="pill">${g.nome}<button class="mini" onclick="excluirGrupo('${g.id}')">✕</button></div>`).join('');
}
$('btnAddGrupo').onclick = async () => {
  const nome = $('gNome').value.trim(); if (!nome) return toast('Informe o nome.');
  const { error } = await sb.from('grupos').insert({ nome, user_id: user.id });
  if (error) return toast('Erro: ' + error.message);
  $('gNome').value = ''; toast('Grupo adicionado.'); await carregar();
};
window.excluirGrupo = async (id) => {
  if (!confirm('Excluir este grupo?')) return;
  await sb.from('grupos').delete().eq('id', id); toast('Grupo excluído.'); await carregar();
};

// ============ INIT ============
$('aData') && ($('aData').value = hoje());
if (initSupabase()) checarSessao();
