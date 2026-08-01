// api/firebase-read.js
const DATABASE_URL = 'https://mfparis-bd054-default-rtdb.firebaseio.com';
const DB_SECRET = 'XCLrY4sIS8xul6sIgYAro1UpfnuXPFCJvXsQ4Cum';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: 'path obrigatorio' });
    const url = `${DATABASE_URL}/${path}.json?auth=${DB_SECRET}`;
    const firebaseResp = await fetch(url);
    if (!firebaseResp.ok) {
      const txt = await firebaseResp.text();
      return res.status(500).json({ error: 'Firebase erro: ' + txt });
    }
    const result = await firebaseResp.json();
    return res.status(200).json(result);
  } catch (e) {
    console.error('[firebase-read]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
