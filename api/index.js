import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Calcula o lucro líquido conforme o resultado
function calcularLucro({ resultado, valor, retorno_potencial }) {
  const v = Number(valor) || 0;
  const ret = Number(retorno_potencial) || 0;
  if (resultado === 'ganhou') return +(ret - v).toFixed(2);   // lucro líquido
  if (resultado === 'perdeu') return +(-v).toFixed(2);         // perde o valor
  return 0;                                                    // devolvida / pendente = neutro
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || (req.body && req.body.action);

  try {
    switch (action) {
      // ---------- CASAS ----------
      case 'listar_casas': {
        const { data, error } = await supabase
          .from('casas').select('*').order('nome');
        if (error) throw error;
        return res.json({ ok: true, casas: data });
      }
      case 'criar_casa': {
        const { nome, saldo } = req.body;
        const { data, error } = await supabase
          .from('casas')
          .insert({ nome: nome.trim(), saldo: Number(saldo) || 0 })
          .select().single();
        if (error) throw error;
        return res.json({ ok: true, casa: data });
      }
      case 'atualizar_saldo': {
        const { id, saldo } = req.body;
        const { data, error } = await supabase
          .from('casas').update({ saldo: Number(saldo) || 0 })
          .eq('id', id).select().single();
        if (error) throw error;
        return res.json({ ok: true, casa: data });
      }
      case 'excluir_casa': {
        const { id } = req.body;
        const { error } = await supabase.from('casas').delete().eq('id', id);
        if (error) throw error;
        return res.json({ ok: true });
      }

      // ---------- GRUPOS ----------
      case 'listar_grupos': {
        const { data, error } = await supabase
          .from('grupos').select('*').order('nome');
        if (error) throw error;
        return res.json({ ok: true, grupos: data });
      }
      case 'criar_grupo': {
        const { nome } = req.body;
        const { data, error } = await supabase
          .from('grupos').insert({ nome: nome.trim() }).select().single();
        if (error) throw error;
        return res.json({ ok: true, grupo: data });
      }
      case 'excluir_grupo': {
        const { id } = req.body;
        const { error } = await supabase.from('grupos').delete().eq('id', id);
        if (error) throw error;
        return res.json({ ok: true });
      }

      // ---------- APOSTAS ----------
      case 'listar_apostas': {
        const { data, error } = await supabase
          .from('apostas')
          .select('*, casas(nome), grupos(nome)')
          .order('data_aposta', { ascending: false })
          .order('criado_em', { ascending: false });
        if (error) throw error;
        return res.json({ ok: true, apostas: data });
      }
      case 'criar_aposta': {
        const b = req.body;
        const lucro = calcularLucro(b);
        const { data, error } = await supabase
          .from('apostas')
          .insert({
            casa_id: b.casa_id,
            grupo_id: b.grupo_id || null,
            valor: Number(b.valor) || 0,
            odd: b.odd ? Number(b.odd) : null,
            retorno_potencial: b.retorno_potencial ? Number(b.retorno_potencial) : null,
            resultado: b.resultado || 'pendente',
            lucro,
            descricao: b.descricao || null,
            data_aposta: b.data_aposta || new Date().toISOString().slice(0, 10)
          })
          .select().single();
        if (error) throw error;
        return res.json({ ok: true, aposta: data });
      }
      case 'atualizar_aposta': {
        const b = req.body;
        const lucro = calcularLucro(b);
        const { data, error } = await supabase
          .from('apostas')
          .update({
            casa_id: b.casa_id,
            grupo_id: b.grupo_id || null,
            valor: Number(b.valor) || 0,
            odd: b.odd ? Number(b.odd) : null,
            retorno_potencial: b.retorno_potencial ? Number(b.retorno_potencial) : null,
            resultado: b.resultado,
            lucro,
            descricao: b.descricao || null,
            data_aposta: b.data_aposta
          })
          .eq('id', b.id).select().single();
        if (error) throw error;
        return res.json({ ok: true, aposta: data });
      }
      case 'excluir_aposta': {
        const { id } = req.body;
        const { error } = await supabase.from('apostas').delete().eq('id', id);
        if (error) throw error;
        return res.json({ ok: true });
      }

      default:
        return res.status(400).json({ ok: false, error: 'Ação inválida: ' + action });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
