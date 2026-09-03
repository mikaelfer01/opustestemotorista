// api/ssw-diag.js
// Endpoint de diagnóstico TEMPORÁRIO pra explorar o fluxo autenticado do
// sistema interno da SSW (sistema.ssw.inf.br) sem precisar de captura
// manual via DevTools a cada passo — faz o login de verdade e devolve
// informação crua (status, cookies, trecho do corpo) pra confirmar o que
// está acontecendo antes de automatizar de vez.
//
// Credencial NÃO fica no código — login e senha de verdade são uma coisa
// sensível demais (acesso ao painel operacional de um parceiro) pra virar
// texto puro commitado no git, então vêm de variável de ambiente
// configurada direto no painel da Vercel (Project Settings -> Environment
// Variables): SSW_RCS_USUARIO e SSW_RCS_SENHA.
const SSW_CREDENCIAIS = {
  RCS: { usuario: process.env.SSW_RCS_USUARIO, senha: process.env.SSW_RCS_SENHA }
};
const SSW_BASE = 'https://sistema.ssw.inf.br';
const NAVEGADOR_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

function extrairCookies(resp) {
  let setCookies = [];
  if (typeof resp.headers.getSetCookie === 'function') setCookies = resp.headers.getSetCookie();
  else { const raw = resp.headers.get('set-cookie'); if (raw) setCookies = [raw]; }
  return setCookies.map(c => c.split(';')[0]).filter(Boolean);
}

async function login(dominio) {
  const cred = SSW_CREDENCIAIS[dominio];
  if (!cred) throw new Error('Domínio não configurado no servidor: ' + dominio);
  if (!cred.usuario || !cred.senha) {
    throw new Error('Credencial da SSW (domínio ' + dominio + ') não configurada — falta SSW_' + dominio + '_USUARIO / SSW_' + dominio + '_SENHA nas Environment Variables do projeto na Vercel.');
  }

  // Campos exatos do <form name=frm action=/bin/ssw0422> capturado no
  // código-fonte real da página de login: f1=domínio, f2=CPF (vazio),
  // f3=usuário, f4=senha, f6=checkbox "lembrar" (value="" no HTML),
  // backimg=campo oculto com o valor cru visto no HTML, act=L (login).
  const body = new URLSearchParams();
  body.set('f1', dominio);
  body.set('f2', '');
  body.set('f3', cred.usuario);
  body.set('f4', cred.senha);
  body.set('f6', '');
  body.set('backimg', 'ssw07%2Ejpg%3Fdummy%3D260902');
  body.set('act', 'L');

  const resp = await fetch(SSW_BASE + '/bin/ssw0422', {
    method: 'POST',
    headers: {
      'User-Agent': NAVEGADOR_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': SSW_BASE,
      'Referer': SSW_BASE + '/bin/ssw0422',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Upgrade-Insecure-Requests': '1'
    },
    body: body.toString(),
    redirect: 'manual'
  });

  const cookies1 = extrairCookies(resp);
  const etapa1 = { status: resp.status, tipo: resp.type, location: resp.headers.get('location'), cookies: cookies1 };

  // Se for redirect (3xx), segue manualmente com os cookies recebidos pra
  // ver a página final de verdade.
  if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
    const destino = new URL(resp.headers.get('location'), SSW_BASE).toString();
    const resp2 = await fetch(destino, {
      headers: {
        'User-Agent': NAVEGADOR_UA,
        'Cookie': cookies1.join('; '),
        'Referer': SSW_BASE + '/bin/ssw0422'
      },
      redirect: 'manual'
    });
    const cookies2 = extrairCookies(resp2);
    const text2 = await resp2.text().catch(() => '');
    return {
      etapa1,
      etapa2: { url: destino, status: resp2.status, cookies: cookies2, bodySnippet: text2.slice(0, 1500) },
      cookiesFinais: [...cookies1, ...cookies2],
      sucesso: /Menu Principal/i.test(text2)
    };
  }

  const text1 = await resp.text().catch(() => '');
  return {
    etapa1,
    bodySnippet: text1.slice(0, 1500),
    cookiesFinais: cookies1,
    sucesso: /Menu Principal/i.test(text1)
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const dominio = (req.query && req.query.dominio) || 'RCS';
    const resultado = await login(dominio);
    return res.status(200).json(resultado);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
