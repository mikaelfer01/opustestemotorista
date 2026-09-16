// api/rastreio-transportadora.js
// Consolida rastreio-ssw.js + rastreio-eureka.js + rastreio-pajucara.js num
// único arquivo — cada um virava uma Serverless Function separada na
// Vercel, e o plano Hobby só permite 12 por deployment. A lógica de cada
// transportadora foi mantida igual, só a seleção de qual rodar passou a
// vir no corpo da requisição (campo "transportadora").
//
// Uso: POST /api/rastreio-transportadora
//   body: { transportadora: 'ssw'|'eureka'|'pajucara', cnpj, numero, chave? }

const SSW_ENDPOINT = 'https://ssw.inf.br/2/ssw_resultSSW';
const EUREKA_ENDPOINT = 'https://eurekatransportes.com.br/api/rastreio';
const PAJUCARA_PAGE = 'https://cliente.viapajucara.com.br/rastrear/resultado';
const PAJUCARA_ENDPOINT = 'https://cliente.viapajucara.com.br/api/rastreamento/cnpj/remetente';
const NAVEGADOR_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const NAVEGADOR_HEADERS_BASE = {
  'User-Agent': NAVEGADOR_UA,
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'sec-ch-ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"'
};

/* ── SSW — TMS usado por várias transportadoras (TG, Camilo dos Santos, etc) ── */
async function rastrearSSW(body) {
  const cnpj = String(body.cnpj || '').replace(/\D/g, '');
  const numero = String(body.numero || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const chave = String(body.chave || '').replace(/\D/g, '');
  if (!cnpj || (!numero && !chave)) {
    return { status: 400, json: { error: 'cnpj e (numero ou chave) são obrigatórios' } };
  }

  const form = new URLSearchParams();
  form.set('NR', numero);
  form.set('cnpj', cnpj);
  form.set('chave', chave);
  form.set('Enviar', 'Buscar');
  form.set('urlori', 'https://ssw.inf.br/ajuda/rastreamento.html');

  const sswResp = await fetch(SSW_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://www.tgtransportes.com.br',
      'Referer': 'https://www.tgtransportes.com.br/',
      'User-Agent': 'Mozilla/5.0 (compatible; OPUS-Rastreio/1.0)'
    },
    body: form.toString()
  });
  if (!sswResp.ok) return { status: 502, json: { error: 'SSW respondeu HTTP ' + sswResp.status } };
  const html = await sswResp.text();
  const resultados = parseSSW(html);
  return { status: 200, json: { ok: true, resultados, encontrado: resultados.length > 0 } };
}

function parseSSW(html) {
  if (/Informa..o n.o dispon.vel/i.test(html)) return [];
  const linhas = [];
  const blocos = html.split(/<tr style="background-color:#FFFFFF;cursor:pointer;"/).slice(1);
  blocos.forEach(bloco => {
    const numeroM = bloco.match(/<label class=rastreamento>\s*([\s\S]*?)<br>/);
    const localM = bloco.match(/width=190[^>]*>\s*<p class=tdb>\s*([\s\S]*?)<\/p>/);
    const tituloM = bloco.match(/<p class=titulo>([\s\S]*?)<\/p>/);
    const detalheM = bloco.match(/<\/b>\s*<p class=tdb>([\s\S]*?)<\/p>/);
    const linkM = bloco.match(/onclick="opx\('([^']+)'\)"/);
    const limpa = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    let cidadeUf = '', dataHora = '';
    if (localM) {
      const partes = localM[1].split('<br>');
      cidadeUf = limpa(partes[0]);
      dataHora = limpa(partes[1]);
    }
    linhas.push({
      numero: limpa(numeroM && numeroM[1]),
      cidadeUf,
      dataHora,
      situacao: limpa(tituloM && tituloM[1]),
      detalhe: limpa(detalheM && detalheM[1]),
      link: linkM ? 'https://ssw.inf.br' + linkM[1] : null
    });
  });
  return linhas;
}

/* ── Eureka Transportes — API própria deles ── */
async function rastrearEureka(body) {
  const cnpjDigits = String(body.cnpj || '').replace(/\D/g, '');
  const numero = String(body.numero || '').replace(/\D/g, '');
  if (!cnpjDigits || !numero) return { status: 400, json: { error: 'cnpj e numero são obrigatórios' } };
  if (cnpjDigits.length !== 14) return { status: 400, json: { error: 'cnpj inválido' } };
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
  if (!eurekaResp.ok) return { status: 502, json: { error: 'Eureka respondeu HTTP ' + eurekaResp.status } };
  const data = await eurekaResp.json().catch(() => ({}));

  if (!data || data.success !== true) {
    return { status: 200, json: { ok: true, resultados: [], encontrado: false } };
  }
  const eventos = data.tracking || [];
  const ultimo = eventos[eventos.length - 1] || null;
  const resultados = ultimo ? [{
    numero,
    cidadeUf: ultimo.cidade || '',
    dataHora: formatarDataHoraEureka(ultimo.data_hora),
    situacao: ultimo.ocorrencia || '',
    detalhe: ultimo.descricao || '',
    link: null
  }] : [];
  return {
    status: 200,
    json: {
      ok: true,
      resultados,
      encontrado: resultados.length > 0,
      remetente: data.header && data.header.remetente,
      destinatario: data.header && data.header.destinatario
    }
  };
}

function formatarDataHoraEureka(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(-2) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/* ── Via Pajuçara — API própria deles, precisa de cookie de sessão ── */
async function obterCookieSessaoPajucara(cnpj, numero) {
  const url = PAJUCARA_PAGE + '?cnpj=' + cnpj + '&tipo=remetente&notaFiscal=' + numero;
  const resp = await fetch(url, {
    headers: {
      ...NAVEGADOR_HEADERS_BASE,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    }
  });
  let setCookies = [];
  if (typeof resp.headers.getSetCookie === 'function') {
    setCookies = resp.headers.getSetCookie();
  } else {
    const raw = resp.headers.get('set-cookie');
    if (raw) setCookies = [raw];
  }
  return setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

async function rastrearPajucara(body) {
  const cnpjDigits = String(body.cnpj || '').replace(/\D/g, '');
  const numero = String(body.numero || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!cnpjDigits || !numero) return { status: 400, json: { error: 'cnpj e numero são obrigatórios' } };
  if (cnpjDigits.length !== 14) return { status: 400, json: { error: 'cnpj inválido' } };

  const cookie = await obterCookieSessaoPajucara(cnpjDigits, numero).catch(() => '');

  const pajResp = await fetch(PAJUCARA_ENDPOINT, {
    method: 'POST',
    headers: {
      ...NAVEGADOR_HEADERS_BASE,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Content-Type': 'application/json',
      'Origin': 'https://cliente.viapajucara.com.br',
      'Referer': PAJUCARA_PAGE + '?cnpj=' + cnpjDigits + '&tipo=remetente&notaFiscal=' + numero,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      ...(cookie ? { 'Cookie': cookie } : {})
    },
    body: JSON.stringify({ cnpj: cnpjDigits, notaFiscal: numero })
  });
  if (!pajResp.ok) {
    return { status: 200, json: { ok: true, resultados: [], encontrado: false, _debug: { teveCookie: !!cookie, statusPajucara: pajResp.status } } };
  }
  const data = await pajResp.json().catch(() => null);
  if (!data || !data.ocorrenciaMaisRecente) {
    return { status: 200, json: { ok: true, resultados: [], encontrado: false, _debug: { teveCookie: !!cookie, statusPajucara: pajResp.status, corpo: data } } };
  }

  const ocorrencia = data.ocorrenciaMaisRecente.ocorrencia || {};
  const etapaAtual = data.ocorrenciaMaisRecente.etapa;
  const etapaInfo = (data.etapas || []).find(e => e.etapa === etapaAtual);
  const situacao = (etapaInfo && etapaInfo.nome) || ocorrencia.titulo || '';

  const resultados = [{
    numero,
    cidadeUf: [ocorrencia.cidade, ocorrencia.estado].filter(Boolean).join(' / '),
    dataHora: [ocorrencia.data, ocorrencia.hora].filter(Boolean).join(' '),
    situacao,
    detalhe: ocorrencia.descricao || '',
    link: null
  }];
  return {
    status: 200,
    json: {
      ok: true,
      resultados,
      encontrado: true,
      remetente: data.remetente,
      destinatario: data.destinatario
    }
  };
}

/* ── Handler ── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const transportadora = String(body.transportadora || '').toLowerCase();

    let resultado;
    if (transportadora === 'ssw') resultado = await rastrearSSW(body);
    else if (transportadora === 'eureka') resultado = await rastrearEureka(body);
    else if (transportadora === 'pajucara') resultado = await rastrearPajucara(body);
    else return res.status(400).json({ error: 'transportadora deve ser "ssw", "eureka" ou "pajucara"' });

    return res.status(resultado.status).json(resultado.json);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
