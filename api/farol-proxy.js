export const config = {
  api: {
    bodyParser: {
      bodySize: '10mb'
    }
  }
};

export default async function handler(req, res) {
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyEqpQlic7vAcjwjXzqCQo5mDxD1cg2l271iRHGdThptrbzKiuYvnUL-VnjzNn91P5UCQ/exec';

  if (req.method === 'POST') {
    try {
      const resp = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      const text = await resp.text();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(text);
    } catch(err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).send(JSON.stringify({ ok: false, erro: err.message }));
    }
    return;
  }

  // GET: mantém o comportamento original (leitura via JSONP)
  const params = new URLSearchParams();
  Object.keys(req.query).forEach(function(k) {
    params.set(k, req.query[k]);
  });
  try {
    const resp = await fetch(`${SCRIPT_URL}?${params.toString()}`);
    const text = await resp.text();
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(text);
  } catch(err) {
    const cb = req.query.callback;
    const errJson = JSON.stringify({ ok: false, erro: err.message });
    const out = cb ? `${cb}(${errJson})` : errJson;
    res.setHeader('Content-Type', 'application/javascript');
    res.send(out);
  }
}
