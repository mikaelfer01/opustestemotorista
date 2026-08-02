// api/omie-seguro.js
// Mesma coisa que api/omie.js, mas as credenciais da empresa ficam só no
// servidor — o cliente manda apenas {endpoint, call, param, empresa} e a
// função resolve app_key/app_secret aqui, sem expor no código-fonte que
// roda no navegador. Usado por roteirizador.html (omieCallRot).
const CREDENCIAIS = {
  MFP:   { key: '952260381072',  secret: '8300b385eeec583c71439709ab866fc7' },
  DMS:   { key: '1340821992510', secret: 'dac287f9b3ec422dc93da6cdbcc3e0b2' },
  PROFI: { key: '6625695374298', secret: '588e34aa9429edcae86f5e87c47a65df' },
  PRF:   { key: '6625695374298', secret: '588e34aa9429edcae86f5e87c47a65df' },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { endpoint, call, param, empresa } = body;

    if (!endpoint || !call || !param) {
      return res.status(400).json({ error: 'endpoint, call e param são obrigatórios' });
    }
    const cred = CREDENCIAIS[String(empresa || '').toUpperCase()];
    if (!cred) return res.status(400).json({ error: 'empresa não reconhecida: ' + empresa });

    const omieResp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call, app_key: cred.key, app_secret: cred.secret, param }),
    });

    const text = await omieResp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(omieResp.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
};
