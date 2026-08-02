module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { endpoint, payload } = body;

    if (!endpoint || !payload) {
      return res.status(400).json({ error: 'endpoint e payload são obrigatórios' });
    }
    // Trava de SSRF: este proxy só pode ser usado para chamar a API da Omie,
    // nunca uma URL arbitrária escolhida pelo cliente.
    if (!/^https:\/\/app\.omie\.com\.br\//.test(endpoint)) {
      return res.status(400).json({ error: 'endpoint não permitido' });
    }

    const omieResp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await omieResp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(omieResp.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
};
