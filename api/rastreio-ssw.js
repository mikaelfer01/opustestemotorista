// api/rastreio-ssw.js
// Consulta o SSW Sistemas — TMS usado por várias transportadoras (confirmado
// com TG Transportes e Camilo dos Santos; possivelmente Eureka e Via
// Pajuçara também, já que é um sistema compartilhado por muita empresa do
// setor). Mesmo endpoint público que o site de qualquer cliente do SSW
// embute pra rastreamento: POST em https://ssw.inf.br/2/ssw_resultSSW,
// form-urlencoded, campos NR (número da NF/pedido) e cnpj (do remetente —
// aqui, sempre uma das nossas empresas MFP/DMS/PROFI). Não tem campo
// identificando a transportadora nessa requisição — o SSW parece resolver
// sozinho quem transportou, então essa mesma consulta pode achar entregas
// de qualquer transportadora que usa o sistema, não só uma específica.
//
// A resposta vem em HTML (não JSON) — o parser abaixo foi validado contra
// uma resposta real (rastreamento pelo remetente, TG Transportes,
// 02/09/2026). Se o SSW mudar o HTML no futuro, isso pode parar de achar
// resultado — nesse caso os campos vêm todos vazios, não trava a página.
const SSW_ENDPOINT = 'https://ssw.inf.br/2/ssw_resultSSW';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cnpj = String(body.cnpj || '').replace(/\D/g, '');
    // NF sem zero à esquerda — o Omie devolve numero_nfe com 8 dígitos
    // zero-padded (ex.: "00012243"), mas o campo NR do SSW espera o número
    // puro (a requisição real capturada usava NR=12225, não 00012225) —
    // com zero à esquerda o SSW simplesmente não acha o resultado.
    const numero = String(body.numero || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const chave = String(body.chave || '').replace(/\D/g, '');
    if (!cnpj || (!numero && !chave)) {
      return res.status(400).json({ error: 'cnpj e (numero ou chave) são obrigatórios' });
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

    if (!sswResp.ok) {
      return res.status(502).json({ error: 'SSW respondeu HTTP ' + sswResp.status });
    }
    const html = await sswResp.text();
    const resultados = parseSSW(html);
    return res.status(200).json({ ok: true, resultados, encontrado: resultados.length > 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};

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
