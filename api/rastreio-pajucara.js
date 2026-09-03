// api/rastreio-pajucara.js
// Rastreio da Via Pajuçara — API própria deles (não é SSW), capturada ao
// vivo via DevTools em cliente.viapajucara.com.br/rastrear/resultado.
// A página em si é SSR (Next.js) e só traz o FAQ no __NEXT_DATA__; o
// histórico de rastreio real vem de uma chamada XHR separada, feita pelo
// navegador depois que a página carrega:
// POST https://cliente.viapajucara.com.br/api/rastreamento/cnpj/remetente
// body (JSON): {"cnpj":"XXXXXXXXXXXXXX","notaFiscal":"NNN"} — cnpj em
// dígitos puros, sem pontuação (diferente da Eureka, que formata).
//
// A requisição real capturada no navegador tinha um cookie de sessão
// (_vcrcs=...) que só existe depois de a página GET ter sido carregada —
// chamando a POST direto, sem esse cookie, o site nunca achava a NF (não
// dava erro, só devolvia "não encontrado" mesmo pra pedido que existe).
// Por isso o rastreio primeiro faz um GET na própria página de resultado
// pra pegar o(s) Set-Cookie da resposta, e só depois faz a POST carregando
// esse cookie junto.
const PAJUCARA_PAGE = 'https://cliente.viapajucara.com.br/rastrear/resultado';
const PAJUCARA_ENDPOINT = 'https://cliente.viapajucara.com.br/api/rastreamento/cnpj/remetente';
// Cabeçalhos completos copiados da requisição real capturada no DevTools —
// a primeira tentativa (só User-Agent/Origin/Referer) levou um 403, sinal
// de bloqueio por WAF/anti-bot; muita proteção desse tipo checa
// especificamente a ausência de sec-fetch-*/sec-ch-ua, que navegador de
// verdade sempre manda e um fetch() simples não manda por padrão.
const NAVEGADOR_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const NAVEGADOR_HEADERS_BASE = {
  'User-Agent': NAVEGADOR_UA,
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'sec-ch-ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"'
};

async function obterCookieSessao(cnpj, numero) {
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cnpjDigits = String(body.cnpj || '').replace(/\D/g, '');
    // Sem zero à esquerda — mesmo cuidado tomado com o SSW/Eureka, por
    // consistência (não confirmado se a Pajuçara exige isso, mas nenhum
    // caso testado usou zero à esquerda).
    const numero = String(body.numero || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!cnpjDigits || !numero) {
      return res.status(400).json({ error: 'cnpj e numero são obrigatórios' });
    }
    if (cnpjDigits.length !== 14) {
      return res.status(400).json({ error: 'cnpj inválido' });
    }

    const cookie = await obterCookieSessao(cnpjDigits, numero).catch(() => '');

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
      // Pedido/NF não encontrado costuma vir como erro HTTP aqui (não como
      // um corpo de sucesso vazio) — trata como "não encontrado", não como
      // falha real. _debug fica temporário pra diagnosticar em produção.
      return res.status(200).json({ ok: true, resultados: [], encontrado: false, _debug: { teveCookie: !!cookie, statusPajucara: pajResp.status } });
    }
    const data = await pajResp.json().catch(() => null);
    if (!data || !data.ocorrenciaMaisRecente) {
      return res.status(200).json({ ok: true, resultados: [], encontrado: false, _debug: { teveCookie: !!cookie, statusPajucara: pajResp.status, corpo: data } });
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
    return res.status(200).json({
      ok: true,
      resultados,
      encontrado: true,
      remetente: data.remetente,
      destinatario: data.destinatario
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
