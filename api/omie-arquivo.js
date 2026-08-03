// Baixa um arquivo (DANFE em PDF ou XML) a partir de uma URL devolvida pela
// API do Omie e devolve em base64. Existe porque o navegador não consegue ler
// o conteúdo desses arquivos direto (bloqueio de CORS) — só abrir em outra aba.
// Com o base64, a página consegue montar ZIP e juntar os PDFs num arquivo só.

const DOMINIOS_LIBERADOS = [
  'omie.com.br',
  'omieapp.com.br',
  'amazonaws.com',   // o Omie serve parte dos arquivos por S3
];

function dominioPermitido(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DOMINIOS_LIBERADOS.some(d => host === d || host.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Abrir esta URL no navegador (GET) confirma que a função está publicada.
  // Se aparecer este JSON, está no ar. Se aparecer a página de erro 404 da
  // hospedagem, o arquivo não chegou ao deploy.
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, funcao: 'omie-arquivo', metodo: 'use POST com { url }' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const url = body.url;

    if (!url) return res.status(400).json({ error: 'url é obrigatória' });
    if (!/^https:\/\//i.test(url) || !dominioPermitido(url)) {
      return res.status(400).json({ error: 'Domínio não autorizado para download' });
    }

    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ error: 'Falha ao baixar o arquivo: HTTP ' + r.status });

    const buf = Buffer.from(await r.arrayBuffer());

    // Limite de segurança: 12 MB por arquivo.
    if (buf.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: 'Arquivo maior que 12 MB' });
    }

    return res.status(200).json({
      base64: buf.toString('base64'),
      contentType: r.headers.get('content-type') || 'application/octet-stream',
      tamanho: buf.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
};
