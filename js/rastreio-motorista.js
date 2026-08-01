/* ───────────────────────────────────────────────────────────────────────────
   rastreio-motorista.js
   Complemento do motorista.html — não substitui nada, só acrescenta.

   COMO INSTALAR
   Coloque este arquivo junto do motorista.html e adicione UMA linha, logo
   antes do </body> (depois do <script> grandão que já existe):

       <script src="rastreio-motorista.js"></script>

   Pronto. Nenhuma outra alteração no motorista.html.

   O QUE ELE FAZ
   1) Registra a placa do veículo no índice do Firebase, apontando pro token da
      rota do dia. É isso que permite ao /api/rastreio saber onde gravar os
      pontos que chegam do app Traccar Client.

          rastreio_index/{PLACA} = { token, motorista, rota, iniciou,
                                     concluido, ts }

   2) Mostra no cabeçalho se o rastreio em segundo plano está vivo, pra você
      descobrir na hora do despacho — e não no meio da estrada — que o
      motorista esqueceu de ligar o app.

   Por que não dá pra resolver só com JavaScript: quando a tela apaga ou o
   motorista abre o Waze, o navegador congela a página inteira. Android e iOS
   fazem isso por bateria e não há permissão que libere. Por isso a posição
   precisa vir de um app nativo rodando em paralelo.
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var PING_OK_MS    = 5 * 60 * 1000;   // ping recente = rastreio saudável
  var INTERVALO_MS  = 3000;            // com que frequência reavaliamos o estado
  var ultimoEstado  = '';              // evita reescrever o índice sem necessidade
  var ultimoRefresh = 0;               // último carimbo de tempo enviado ao índice
  var placaChave    = null;
  var pillEl        = null;
  var ouvindoPing   = false;

  function normalizarPlaca(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // ── Pílula de status no cabeçalho ──────────────────────────────────────────
  function garantirPill() {
    if (pillEl && document.body.contains(pillEl)) return pillEl;
    // Entramos no bloco da direita do cabeçalho — o que já tem o botão 🔄 e o
    // indicador de GPS —, não no bloco da marca à esquerda.
    var gps  = document.querySelector('.hdr-top .hdr-gps');
    var alvo = gps && gps.parentNode;
    if (!alvo) return null;

    pillEl = document.createElement('div');
    pillEl.id = 'pill-rastreio';
    pillEl.style.cssText =
      'display:flex;align-items:center;gap:4px;font-size:9px;font-weight:800;' +
      'padding:3px 7px;border-radius:6px;white-space:nowrap;cursor:pointer;' +
      'letter-spacing:.3px';
    pillEl.onclick = explicarRastreio;
    alvo.insertBefore(pillEl, alvo.firstChild);
    return pillEl;
  }

  function pintarPill(estado, detalhe) {
    var el = garantirPill();
    if (!el) return;
    var cores = {
      ok:      ['rgba(34,197,94,.18)',  '#4ade80', 'rgba(34,197,94,.45)'],
      velho:   ['rgba(245,158,11,.18)', '#fbbf24', 'rgba(245,158,11,.45)'],
      ausente: ['rgba(220,38,38,.18)',  '#f87171', 'rgba(220,38,38,.45)']
    }[estado] || ['rgba(255,255,255,.1)', 'rgba(255,255,255,.6)', 'rgba(255,255,255,.2)'];

    el.style.background   = cores[0];
    el.style.color        = cores[1];
    el.style.border       = '1px solid ' + cores[2];
    el.textContent        = detalhe;
  }

  function explicarRastreio() {
    var placa = (window.rotaData && window.rotaData.motoristaPlaca) || '—';
    alert(
      'RASTREIO EM SEGUNDO PLANO\n\n' +
      'Esta tela só envia sua posição enquanto está aberta na frente. Se você ' +
      'travar o celular ou abrir o Waze, a torre perde seu sinal.\n\n' +
      'Para a torre te acompanhar o dia inteiro, instale o app "Traccar Client" ' +
      '(Play Store ou App Store), configure conforme o guia que o despachante ' +
      'enviou e deixe ligado.\n\n' +
      'O identificador do dispositivo no app tem que ser exatamente: ' + placa + '\n\n' +
      'No iPhone, a permissão de localização precisa estar em "Sempre".'
    );
  }

  // ── Índice placa → token ───────────────────────────────────────────────────
  function sincronizar() {
    var d = window.rotaData;
    if (!d || !window.db || !window.token) return;

    var chave = normalizarPlaca(d.motoristaPlaca);
    if (!chave) {
      pintarPill('ausente', '📡 SEM PLACA');
      return;
    }

    // Placa nova (ou primeira execução): passa a escutar o ping desse veículo.
    if (chave !== placaChave) {
      placaChave  = chave;
      ouvindoPing = false;
    }

    // Reescrevemos o índice quando o estado muda e, além disso, de hora em hora
    // enquanto a rota está viva. Sem esse refresh, uma jornada longa faria o
    // carimbo de tempo envelhecer e a API passaria a recusar os pontos.
    var estado  = [window.token, !!d.iniciou, !!d.concluido].join('|');
    var venceu  = d.iniciou && !d.concluido && (Date.now() - ultimoRefresh > 60 * 60 * 1000);

    if (estado !== ultimoEstado || venceu) {
      ultimoEstado  = estado;
      ultimoRefresh = Date.now();
      window.db.ref('rastreio_index/' + chave).update({
        token:     window.token,
        motorista: d.motoristaNome || '',
        rota:      d.nomeRota || '',
        iniciou:   !!d.iniciou,
        concluido: !!d.concluido,
        ts:        Date.now()
      }).catch(function () { /* offline: tenta de novo no próximo ciclo */ });
    }

    if (!ouvindoPing) {
      ouvindoPing = true;
      window.db.ref('rastreio_index/' + chave + '/ultimoPing').on('value', function (snap) {
        avaliarPing(snap.val());
      });
    }
  }

  function avaliarPing(ultimoPing) {
    if (!ultimoPing) {
      pintarPill('ausente', '📡 APP OFF');
      return;
    }
    var idade = Date.now() - ultimoPing;
    if (idade < PING_OK_MS) {
      pintarPill('ok', '📡 RASTREIO OK');
    } else {
      var min = Math.round(idade / 60000);
      pintarPill('velho', '📡 ' + (min < 60 ? min + ' MIN' : Math.round(min / 60) + ' H'));
    }
  }

  // Reavalia a idade do ping mesmo sem evento novo do Firebase, senão a pílula
  // fica congelada em "OK" depois que o app do motorista morre.
  function revalidar() {
    if (!placaChave || !window.db) return;
    window.db.ref('rastreio_index/' + placaChave + '/ultimoPing').once('value')
      .then(function (s) { avaliarPing(s.val()); })
      .catch(function () {});
  }

  setInterval(sincronizar, INTERVALO_MS);
  setInterval(revalidar, 60000);
  sincronizar();

  // Ao voltar pra aba, reconfere na hora.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { sincronizar(); revalidar(); }
  });
})();
