let sb, user = null;
let casas = [], grupos = [], apostas = [], editandoId = null;
let filtroDe = null, filtroAte = null, menuApostaId = null;

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
  const [c, g, a] = await Promise.all([
    sb.from('casas').select('*').order('nome'),
    sb.from('grupos').select('*').order('nome'),
    sb.from('apostas').select('*, casas(nome), grupos(nome)').order('data_aposta', { ascending: false }).order('criado_em', { ascending: false })
  ]);
  if (c.error || g.error || a.error) { toast('Erro ao carregar dados.'); return; }
  casas = c.data; grupos = g.data; apostas = a.data;
  preencherSelects(); renderCasas(); renderGrupos(); renderApostas(); renderPainel();
}

function preencherSelects() {
  $('aCasa').innerHTML = casas.length ? casas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('') : '<option value="">— cadastre uma casa —</option>';
  $('aGrupo').innerHTML = '<option value="">— sem grupo —</option>' + grupos.map(g => `<option value="${g.id}">${g.nome}</option>`).join('');
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
  $('kpiSaldo').textContent = brl(saldo);
  $('bancaTotal').textContent = brl(saldo);
  $('kpiQtd').textContent = lista.length;
  $('kpiTaxa').textContent = taxa + '%';
  $('kpiRoi').textContent = roi + '%'; $('kpiRoi').className = 'big num ' + (roi >= 0 ? 'pos' : 'neg');
  $('kpiPendentes').textContent = pendentes;

  $('porCasa').innerHTML = agrupar(lista, 'casa_id', casas) || '<div class="empty">Sem apostas no período.</div>';
  $('porGrupo').innerHTML = agrupar(lista, 'grupo_id', grupos, true) || '<div class="empty">Sem apostas com grupo no período.</div>';
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
function renderApostas() {
  const lista = apostas;
  if (!lista.length) { $('tabelaApostas').innerHTML = '<div class="empty">Registre sua primeira aposta acima.</div>'; return; }
  $('tabelaApostas').innerHTML = `<table><thead><tr>
    <th>Data</th><th>Casa</th><th>Grupo</th><th>Descrição</th><th>Valor</th><th>Odd</th><th>Resultado</th><th>Lucro</th><th></th></tr></thead><tbody>${lista.map(a => {
      const d = a.data_aposta.split('-').reverse().join('/');
      const lc = Number(a.lucro) > 0 ? 'pos' : Number(a.lucro) < 0 ? 'neg' : '';
      const label = { ganhou: 'green', perdeu: 'red', devolvida: 'devolvida', pendente: 'pendente' }[a.resultado];
      return `<tr>
        <td class="num">${d}</td><td>${a.casas?.nome || '—'}</td><td>${a.grupos?.nome || '—'}</td>
        <td>${a.descricao || '—'}</td><td class="num">${brl(a.valor)}</td><td class="num">${a.odd || '—'}</td>
        <td><span class="tag t-${a.resultado}" onclick="abrirMenu(event,'${a.id}')">${label} ▾</span></td>
        <td class="num ${lc}"><strong>${brl(a.lucro)}</strong></td>
        <td style="white-space:nowrap"><button class="mini" style="color:var(--dourado)" onclick="editar('${a.id}')">editar</button><button class="mini" onclick="excluirAposta('${a.id}')">excluir</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

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
