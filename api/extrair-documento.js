// api/extrair-documento.js
// Le uma foto/PDF de CNH ou CRLV e devolve os campos extraidos usando a
// API de visao da Anthropic (Claude). A chave fica so no ambiente do
// Vercel (ANTHROPIC_API_KEY) — nunca no codigo. Se a extracao falhar ou
// vier incompleta, o formulario de cadastro de motoristas continua
// aceitando preenchimento manual normalmente (esta rota so preenche o
// que conseguir identificar).
const CAMPOS_POR_TIPO = {
  cnh: ['nome', 'cpf', 'nascimento', 'numeroCnh', 'categoria', 'validade'],
  crlv: ['placa', 'uf', 'modelo', 'renavam', 'proprietarioNome', 'proprietarioDoc', 'proprietarioTerceiro'],
};

function instrucoes(tipo) {
  if (tipo === 'cnh') {
    return 'Este documento e uma Carteira Nacional de Habilitacao (CNH) brasileira. Extraia: ' +
      'nome (nome completo do condutor), cpf (formato 000.000.000-00), nascimento (data de nascimento no formato AAAA-MM-DD), ' +
      'numeroCnh (numero de registro da CNH, so digitos), categoria (ex: A, B, AB, C, D, E), ' +
      'validade (data de validade no formato AAAA-MM-DD).';
  }
  return 'Este documento e um CRLV (Certificado de Registro e Licenciamento de Veiculo) brasileiro. Extraia: ' +
    'placa (formato ABC1D23 ou ABC1234, sem espacos), uf (sigla do estado emplacado), modelo (marca/modelo do veiculo), ' +
    'renavam (so digitos), proprietarioNome (nome/razao social do proprietario no documento), ' +
    'proprietarioDoc (CPF ou CNPJ do proprietario), proprietarioTerceiro (true se o proprietario parecer ser uma empresa ' +
    'de arrendamento/financeira ao inves de pessoa fisica, senao false).';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurado no ambiente' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { tipo, mediaType, imagemBase64 } = body;
    if (!tipo || !CAMPOS_POR_TIPO[tipo]) return res.status(400).json({ erro: 'tipo deve ser "cnh" ou "crlv"' });
    if (!mediaType || !imagemBase64) return res.status(400).json({ erro: 'mediaType e imagemBase64 são obrigatórios' });

    const campos = CAMPOS_POR_TIPO[tipo];
    const ehPdf = mediaType === 'application/pdf';
    const conteudoArquivo = ehPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imagemBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: imagemBase64 } };

    const prompt = instrucoes(tipo) + ' Responda APENAS com um objeto JSON com exatamente estas chaves: ' +
      campos.join(', ') + '. Se algum campo nao estiver legivel ou nao existir no documento, use null nesse campo. ' +
      'Nao inclua nenhum texto antes ou depois do JSON, nem blocos de codigo markdown.';

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: [conteudoArquivo, { type: 'text', text: prompt }] }],
      }),
    });

    const data = await anthropicResp.json().catch(() => ({}));
    if (!anthropicResp.ok) {
      return res.status(anthropicResp.status).json({ erro: (data && data.error && data.error.message) || 'Erro ao consultar API de visão' });
    }

    const textoResp = (data.content || []).map(b => b.text || '').join('').trim();
    const jsonMatch = textoResp.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ campos: {} });

    let extraido;
    try { extraido = JSON.parse(jsonMatch[0]); } catch (e) { return res.status(200).json({ campos: {} }); }

    const resultado = {};
    campos.forEach(c => { if (extraido[c] !== undefined && extraido[c] !== null) resultado[c] = extraido[c]; });

    return res.status(200).json({ campos: resultado });
  } catch (err) {
    return res.status(500).json({ erro: err.message || String(err) });
  }
};
