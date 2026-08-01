// api/mapbox-token.js
// Serve o token público do Mapbox a partir de uma variável de ambiente,
// pra ele nunca precisar ficar escrito no código-fonte / git.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(500).json({ error: 'MAPBOX_TOKEN não configurado no ambiente' });

  return res.status(200).json({ token });
};
