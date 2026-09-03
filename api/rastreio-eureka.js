// api/rastreio-eureka.js
// Rastreio da Eureka Transportes — API própria deles (não é SSW), capturada
// ao vivo via DevTools em eurekatransportes.com.br/rastreamento?data=...
// POST https://eurekatransportes.com.br/api/rastreio
// body (texto puro, content-type text/plain): {"nro_Nf":N,"tipo":"1","cnpj":"XX.XXX.XXX/XXXX-XX","url":"tracking"}
const EUREKA_ENDPOINT = 'https://eurekatransportes.com.br/api/rastreio';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cnpjDigits = String(body.cnpj || '').replace(/\D/g, '');
    const numero = String(body.numero || '').replace(/\D/g, '');
    if (!cnpjDigits || !numero) {
      return res.status(400).json({ error: 'cnpj e numero são obrigatórios' });
    }
    if (cnpjDigits.length !== 14) {
      return res.status(400).json({ error: 'cnpj inválido' });
    }
    const cnpjFmt = cnpjDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

    const payload = JSON.stringify({ nro_Nf: parseInt(numero, 10), tipo: '1', cnpj: cnpjFmt, url: 'tracking' });
    const eurekaResp = await fetch(EUREKA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Origin': 'https://eurekatransportes.com.br',
        'Referer': 'https://eurekatransportes.com.br/rastreamento',
        'User-Agent': 'Mozilla/5.0 (compatible; OPUS-Rastreio/1.0)'
      },
      body: payload
    });
    if (!eurekaResp.ok) return res.status(502).json({ error: 'Eureka respondeu HTTP ' + eurekaResp.status });
    const data = await eurekaResp.json().catch(() => ({}));

    if (!data || data.success !== true) {
      return res.status(200).json({ ok: true, resultados: [], encontrado: false });
    }
    const eventos = data.tracking || [];
    const ultimo = eventos[eventos.length - 1] || null;
    const resultados = ultimo ? [{
      numero,
      cidadeUf: ultimo.cidade || '',
      dataHora: formatarDataHora(ultimo.data_hora),
      situacao: ultimo.ocorrencia || '',
      detalhe: ultimo.descricao || '',
      link: null
    }] : [];
    return res.status(200).json({
      ok: true,
      resultados,
      encontrado: resultados.length > 0,
      remetente: data.header && data.header.remetente,
      destinatario: data.header && data.header.destinatario
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};

function formatarDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(-2) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
