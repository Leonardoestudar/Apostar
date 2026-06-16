// Entrega ao navegador apenas a URL e a ANON key (seguras para o cliente).
// A proteção real dos dados é feita pela RLS no Supabase.
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(
    `window.SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_URL || '')};` +
    `window.SUPABASE_ANON_KEY=${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')};`
  );
}
