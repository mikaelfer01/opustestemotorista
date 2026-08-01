// api/firebase-write.js
// Escreve no Firebase Realtime Database via REST API (sem firebase-admin, zero dependências)
const DB_SECRET = 'XCLrY4sIS8xul6sIgYAro1UpfnuXPFCJvXsQ4Cum';
const DATABASE_URL = 'https://mfparis-bd054-default-rtdb.firebaseio.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { path, data, method } = req.body;
    if (!path) return res.status(400).json({ error: 'path obrigatorio' });

    // Monta URL da REST API do Firebase
   const url = `${DATABASE_URL}/${path}.json?auth=${DB_SECRET}`;
    let fetchMethod = 'PUT'; // PUT = set (default)
    if (method === 'update') fetchMethod = 'PATCH';
    if (method === 'remove') fetchMethod = 'DELETE';

    const fetchOptions = {
      method: fetchMethod,
      headers: { 'Content-Type': 'application/json' },
    };

    if (fetchMethod !== 'DELETE') {
      fetchOptions.body = JSON.stringify(data);
    }

    const firebaseResp = await fetch(url, fetchOptions);

    if (!firebaseResp.ok) {
      const txt = await firebaseResp.text();
      return res.status(500).json({ error: 'Firebase erro: ' + txt });
    }

    const result = await firebaseResp.json();
    return res.status(200).json({ ok: true, result });

  } catch (e) {
    console.error('[firebase-write]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
