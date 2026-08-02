// ─────────────────────────────────────────────────────────────────────────────
//  /api/rastreio  —  Ponte entre o app Traccar Client (celular) e o Firebase
//
//  ⚠️  SALVE ESTE ARQUIVO COMO:  api/rastreio.js  no seu projeto da Vercel
// ─────────────────────────────────────────────────────────────────────────────
//
//  POR QUE ISSO EXISTE
//  O motorista.html é uma página web. Navegador (Android e iPhone) suspende a
//  geolocalização quando a tela apaga ou o motorista abre o Waze/WhatsApp.
//  Não existe plug-in que resolva — é regra do sistema operacional.
//
//  A solução é um app nativo com permissão de localização em segundo plano.
//  O Traccar Client é gratuito, open-source, está na Play Store e na App Store,
//  e sabe mandar a posição pra qualquer URL. Esta função recebe essas posições
//  e grava no MESMO lugar que a torre já lê:
//
//      Traccar Client  ──HTTP──▶  /api/rastreio  ──▶  despachos/{token}/gps
//
//  A torre.html não precisa de nenhuma alteração.
//
//  COMO O TOKEN É DESCOBERTO
//  O motorista configura no Traccar o "identificador do dispositivo" = a PLACA
//  do veículo. Isso é fixo, ele configura uma vez na vida.
//  Quando ele abre o link da rota do dia, o motorista.html grava:
//
//      rastreio_index/{PLACA} = { token, motorista, iniciou, concluido, ts }
//
//  Esta função lê esse nó (leitura minúscula, rápida) e descobre em qual
//  despacho gravar o ponto.
//
// ─────────────────────────────────────────────────────────────────────────────
//  VARIÁVEIS DE AMBIENTE (Vercel → Settings → Environment Variables)
//  Use a OPÇÃO A ou a OPÇÃO B, não precisa das duas.
//
//    FIREBASE_DB_URL     https://mfparis-bd054-default-rtdb.firebaseio.com
//
//    OPÇÃO A (recomendada) — conta de serviço:
//    FIREBASE_SA_EMAIL   firebase-adminsdk-xxxxx@mfparis-bd054.iam.gserviceaccount.com
//    FIREBASE_SA_KEY     -----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
//
//    OPÇÃO B (mais simples, legado) — segredo do banco:
//    FIREBASE_DB_SECRET  Console Firebase → Config do projeto → Contas de
//                        serviço → Segredos do banco de dados
//
//    RASTREIO_KEY        (opcional, mas recomendado) senha que vai na URL que
//                        o motorista configura. Impede que estranhos gravem
//                        posições falsas no seu banco.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';

const DB_URL    = (process.env.FIREBASE_DB_URL || 'https://mfparis-bd054-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const SA_EMAIL  = process.env.FIREBASE_SA_EMAIL || '';
const SA_KEY    = (process.env.FIREBASE_SA_KEY || '').replace(/\\n/g, '\n');
// Mesmo segredo legado já usado em api/firebase-write.js — evita depender de
// configurar FIREBASE_DB_SECRET na Vercel pra o rastreio funcionar.
const DB_SECRET = process.env.FIREBASE_DB_SECRET || 'XCLrY4sIS8xul6sIgYAro1UpfnuXPFCJvXsQ4Cum';
const CHAVE     = process.env.RASTREIO_KEY || '';

// Trava de segurança: se o índice daquela placa está parado há muito tempo,
// paramos de aceitar pontos — evita gravar o deslocamento de fim de semana do
// motorista dentro do despacho da sexta-feira.
// O rastreio-motorista.js renova esse carimbo de hora em hora enquanto a rota
// está ativa, então 20h cobre com folga qualquer jornada real.
const INDICE_VALIDO_MS = 20 * 60 * 60 * 1000;

// ── Autenticação no Firebase ─────────────────────────────────────────────────
let cacheToken = { valor: null, expira: 0 };

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function pegarAccessToken() {
  if (DB_SECRET) return null;                         // Opção B não usa OAuth
  if (cacheToken.valor && Date.now() < cacheToken.expira) return cacheToken.valor;
  if (!SA_EMAIL || !SA_KEY) {
    throw new Error('Firebase sem credencial: configure FIREBASE_SA_EMAIL + FIREBASE_SA_KEY ou FIREBASE_DB_SECRET');
  }

  const agora  = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim  = b64url(JSON.stringify({
    iss:   SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   agora,
    exp:   agora + 3600
  }));

  const assinador = crypto.createSign('RSA-SHA256');
  assinador.update(header + '.' + claim);
  const jwt = header + '.' + claim + '.' + b64url(assinador.sign(SA_KEY));

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt)
  });
  const json = await resp.json();
  if (!json.access_token) throw new Error('OAuth Google falhou: ' + JSON.stringify(json));

  cacheToken = { valor: json.access_token, expira: Date.now() + 50 * 60 * 1000 };
  return json.access_token;
}

async function urlDb(caminho) {
  const auth = DB_SECRET
    ? 'auth=' + encodeURIComponent(DB_SECRET)
    : 'access_token=' + encodeURIComponent(await pegarAccessToken());
  return `${DB_URL}/${caminho}.json?${auth}`;
}

async function lerDb(caminho) {
  const r = await fetch(await urlDb(caminho));
  if (!r.ok) throw new Error(`Leitura ${caminho} falhou (${r.status}): ${await r.text()}`);
  return r.json();
}

async function gravarDb(caminho, dados, metodo = 'PUT') {
  const r = await fetch(await urlDb(caminho), {
    method:  metodo,
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(dados)
  });
  if (!r.ok) throw new Error(`Gravação ${caminho} falhou (${r.status}): ${await r.text()}`);
  return r.json();
}

// ── Leitura dos parâmetros do Traccar ────────────────────────────────────────
// O Traccar Client usa o protocolo OsmAnd. Dependendo da versão e da
// plataforma ele manda GET ou POST, e os campos podem vir na query string ou
// no corpo. Lemos os três lugares e ficamos com o primeiro valor que aparecer.
function extrairParametros(req) {
  const params = {};
  const absorver = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      if (params[k] === undefined && obj[k] !== undefined && obj[k] !== '') params[k] = obj[k];
    }
  };

  absorver(req.query);

  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      absorver(JSON.parse(req.body));
    } catch {
      absorver(Object.fromEntries(new URLSearchParams(req.body)));
    }
  } else {
    absorver(req.body);
  }

  return params;
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// Placa vira chave: "ABC-1D23" e "abc1d23" viram "ABC1D23".
const normalizar = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const p = extrairParametros(req);

    // Teste de saúde: abrir /api/rastreio?ping=1 no navegador deve responder ok.
    if (p.ping !== undefined) {
      return res.status(200).json({
        ok:    true,
        banco: DB_URL,
        auth:  DB_SECRET ? 'segredo' : (SA_EMAIL ? 'conta de serviço' : 'NÃO CONFIGURADO'),
        chave: CHAVE ? 'exigida' : 'aberta (configure RASTREIO_KEY)'
      });
    }

    if (CHAVE && p.key !== CHAVE) {
      return res.status(401).json({ ok: false, erro: 'chave inválida' });
    }

    const idBruto = p.id || p.deviceid || p.device_id;
    const lat = num(p.lat ?? p.latitude);
    const lng = num(p.lon ?? p.lng ?? p.longitude);

    if (!idBruto || lat === null || lng === null) {
      return res.status(400).json({ ok: false, erro: 'faltou id, lat ou lon' });
    }

    const chaveVeiculo = normalizar(idBruto);

    // O Traccar manda timestamp em segundos. Se vier maluco, usamos a hora do
    // servidor — a torre calcula "GPS parado" em cima desse campo, então ele
    // precisa ser confiável.
    let ts = num(p.timestamp);
    ts = ts && ts > 1e9 && ts < 1e11 ? Math.round(ts * 1000) : Date.now();
    if (Math.abs(Date.now() - ts) > 24 * 60 * 60 * 1000) ts = Date.now();

    // Descobre em qual despacho gravar.
    const indice = await lerDb('rastreio_index/' + chaveVeiculo);

    if (!indice || !indice.token) {
      // Guarda o ponto órfão pra você conseguir diagnosticar: se aparecer algo
      // aqui, é porque a placa configurada no celular não bate com a do sistema.
      await gravarDb('rastreio_orfaos/' + chaveVeiculo, { ts, lat, lng }, 'PUT');
      return res.status(200).json({ ok: true, gravado: false, motivo: 'placa sem rota ativa' });
    }
    if (indice.concluido) {
      return res.status(200).json({ ok: true, gravado: false, motivo: 'rota concluída' });
    }
    if (indice.ts && Date.now() - indice.ts > INDICE_VALIDO_MS) {
      return res.status(200).json({ ok: true, gravado: false, motivo: 'rota antiga' });
    }

    const velocidadeNos = num(p.speed);   // protocolo OsmAnd manda em nós
    const bateria       = num(p.batt);

    const ponto = {
      lat,
      lng,
      acc:      num(p.accuracy) ?? 0,
      ts,
      speedKmh: velocidadeNos !== null ? Math.round(velocidadeNos * 1.852) : null,
      bearing:  num(p.bearing),
      alt:      num(p.altitude),
      batt:     bateria !== null ? Math.round(bateria) : null,
      fonte:    'traccar',
      placa:    chaveVeiculo
    };

    await gravarDb('despachos/' + indice.token + '/gps', ponto, 'PUT');

    // Batimento cardíaco: se o ponto não estiver aparecendo na torre, dá pra
    // olhar aqui e saber se o problema é o celular ou o mapeamento da placa.
    await gravarDb('rastreio_index/' + chaveVeiculo, {
      ultimoPing: Date.now(),
      ultimaBat:  ponto.batt
    }, 'PATCH');

    return res.status(200).json({ ok: true, gravado: true, token: indice.token });

  } catch (e) {
    console.error('[rastreio]', e);
    // Devolvemos 200 de propósito. Com erro 5xx o Traccar Client acumula os
    // pontos na fila e reenvia em rajada; com 200 ele segue em frente e o
    // próximo ponto (60s depois) já entra normal.
    return res.status(200).json({ ok: false, erro: String(e.message || e) });
  }
}
