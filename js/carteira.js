/**
 * carteira.js — Carteira de Pedidos OPUS
 */

import { getUsuarioAtual, onUsuarioPronto } from './auth.js';
import { exigirPerfis } from './auth.js';

// Exige login — admin, logistica e comercial podem ver
exigirPerfis(['admin', 'logistica', 'comercial']);

// ── CONFIGURAÇÃO ──────────────────────────────────────────────────────────────

const EMPRESAS = [
  { nome:'MF Paris', cod:'MFP', key:'952260381072',  secret:'8300b385eeec583c71439709ab866fc7' },
  { nome:'DMS',      cod:'DMS', key:'1340821992510', secret:'dac287f9b3ec422dc93da6cdbcc3e0b2' },
  { nome:'Profi',    cod:'PRF', key:'6625695374298', secret:'588e34aa9429edcae86f5e87c47a65df' },
];

const DEP_LICITACAO = new Set([
  '4407058322','4858738808','4858738881','4858738929','4858739022', // MFP
  '1097661811','9183770623','9183770638','9183770663','9183770678',
  '9183770703','9422013736','9578977933',                          // DMS
  '10973188988','10977160821',                                     // Profi
]);

const SHEETS_ID = '1Z939E63719MpVGnGmJzixKRFToe4-maSpqBsmsfPYnw';

// ── ESTADO ────────────────────────────────────────────────────────────────────

let pedidos    = [];
let estComercial = {}; // { SKU: qtd_disponivel } — aba COMERCIAL
let estLicit   = {}; // { SKU: qtd_disponivel } — aba LICITAÇÃO
let selecionados = new Set();
let pedidoAtual  = null;
let deptoCache   = {};
let sortCol = 'data_inclusao';
let sortDir = -1;

// ── UTILITÁRIOS ───────────────────────────────────────────────────────────────

const fmtData  = s => (!s || s.length < 8) ? '—' : s;
const fmtValor = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const setStatus = msg => { const el = document.getElementById('status-sync'); if(el) el.textContent = msg; };

function dataParaOrdem(s) {
  if (!s) return '';
  const p = String(s).split('/');
  return p.length === 3 ? p[2]+p[1]+p[0] : s;
}

function infoDepartamento(departamentos) {
  if (!departamentos || !departamentos.length) return { tipo:'comercial', label:'Comercial' };
  const cod = departamentos[0].cCodDepto;
  if (DEP_LICITACAO.has(cod)) return { tipo:'licitacao', label:'Licitação' };
  const nome = (deptoCache[cod] || '').toLowerCase();
  if (nome.includes('licit')) return { tipo:'licitacao', label:'Licitação' };
  return { tipo:'comercial', label:'Comercial' };
}

function modalidadeParaFrete(m) {
  return String(m||'') === '2' ? 'FOB' : 'CIF';
}

// Peso do PEDIDO. No segmento Comercial os itens sao vendidos "a peso" -
// o campo quantidade do proprio item (aba "Itens de Venda") ja e o peso em
// kg. Antes isso era multiplicado pelo peso liquido cadastrado no produto
// (o que esta correto na Licitacao, onde quantidade = numero de unidades),
// o que fazia o peso do Comercial vir errado - inflado, e na pratica
// refletindo o peso preenchido manualmente na aba "Frete e Outras
// Despesas" em vez do peso real dos itens do pedido.
function calcularPesoPedido(det, tipoDepto) {
  if (tipoDepto === 'comercial') {
    return (det||[]).reduce((s,d) => s + (d.produto?.quantidade||0), 0);
  }
  return (det||[]).reduce((s,d) => s + ((d.inf_adic?.peso_liquido||0) * (d.produto?.quantidade||0)), 0);
}

function etapaInfo(etapa) {
  const e = String(etapa||'');
  if (e==='10') return { label:'Em digitação', cor:'#92400e', bg:'rgba(251,191,36,.12)', border:'rgba(251,191,36,.3)' };
  if (e==='20') return { label:'Em análise',   cor:'#1d4ed8', bg:'rgba(29,78,216,.09)',  border:'rgba(29,78,216,.2)' };
  if (e==='50') return { label:'Aprovado',     cor:'#166534', bg:'rgba(22,163,74,.09)',  border:'rgba(22,163,74,.2)' };
  return { label:'Etapa '+e, cor:'#7a8fa8', bg:'var(--cream2)', border:'var(--border)' };
}

// ── ESTOQUE ───────────────────────────────────────────────────────────────────

function csvParse(txt) {
  const linhas=[]; let cur=[],val='',dentro=false;
  for(let i=0;i<txt.length;i++){
    const c=txt[i];
    if(dentro){
      if(c==='"'&&txt[i+1]==='"'){val+='"';i++;}
      else if(c==='"')dentro=false;
      else val+=c;
    } else {
      if(c==='"')dentro=true;
      else if(c===','){cur.push(val);val='';}
      else if(c==='\n'){cur.push(val);linhas.push(cur);cur=[];val='';}
      else if(c!=='\r')val+=c;
    }
  }
  if(val.length||cur.length){cur.push(val);linhas.push(cur);}
  return linhas.filter(l=>l.length&&l.some(x=>String(x).trim()!==''));
}

function parseNum(v) {
  return parseFloat(String(v||'0').replace(/\./g,'').replace(',','.'))||0;
}

async function carregarEstoque() {
  estComercial = {};
  estLicit = {};
  try {
    for (const [aba, mapa] of [['COMERCIAL', estComercial], ['LICITAÇÃO', estLicit]]) {
      const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(aba)}`;
      const resp = await fetch(url, { cache:'no-store' });
      if (!resp.ok) continue;
      const linhas = csvParse(await resp.text());
      for (let r=1; r<linhas.length; r++) {
        const sku  = String(linhas[r][0]||'').trim();
        const disp = parseNum(linhas[r][3]); // col D = estoque total
        if (sku && sku !== '0') mapa[sku] = (mapa[sku] || 0) + disp;
      }
    }
    console.log('[Estoque] COMERCIAL:', Object.keys(estComercial).length, 'SKUs | LICITAÇÃO:', Object.keys(estLicit).length, 'SKUs');
    // Atualiza totais na tela
    const fmt = n => Number(n).toLocaleString('pt-BR',{maximumFractionDigits:0});
    const totalCom = Object.values(estComercial).reduce((s,v)=>s+v,0);
    const totalLic = Object.values(estLicit).reduce((s,v)=>s+v,0);
    const elCom = document.getElementById('kpi-est-comercial');
    const elLic = document.getElementById('kpi-est-licit');
if (elCom) elCom.textContent = fmt(totalCom) + ' kg';
if (elLic) elLic.textContent = fmt(totalLic) + ' kg';
  } catch(e) {
    console.warn('[Estoque]', e.message);
  }
}

// Retorna o mapa de estoque correto para um pedido
function mapaEstoque(pedido) {
  return pedido.departamento.tipo === 'licitacao' ? estLicit : estComercial;
}

// Calcula estoque comprometido pelos pedidos JÁ selecionados (exceto o próprio pedido)
function estoqueComprometido(excluirCod) {
  const comprometido = {};
  for (const cod of selecionados) {
    if (cod === excluirCod) continue;
    const ped = pedidos.find(p => p.codigo_pedido === cod);
    if (!ped) continue;
    const mapa = mapaEstoque(ped);
    for (const item of ped.itens) {
      if (!item.sku || !String(item.sku).startsWith('1')) continue;
      if (mapa[item.sku] === undefined) continue; // SKU não está nessa aba
      comprometido[item.sku] = (comprometido[item.sku] || 0) + item.quantidade;
    }
  }
  return comprometido;
}

// Codigos de pedido (string) que estao pendentes em carteira_envio/pedidos —
// ou seja, ja foram enviados ao Roteirizador e AINDA NAO foram despachados
// pro motorista. Assim que uma rota e despachada, o roteirizador remove os
// pedidos dela dessa lista no Firebase — entao isso reflete o status real,
// ao contrario da observacao local antiga que nunca mudava.
let _codigosEnviadosRoteirizador = new Set();

async function carregarStatusRoteirizacao() {
  try {
    const r = await fetch('/api/firebase-read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'carteira_envio/pedidos' })
    });
    const lista = await r.json();
    _codigosEnviadosRoteirizador = new Set(
      (Array.isArray(lista) ? lista : []).map(p => String(p.codigo_pedido))
    );
  } catch(e) {
    console.warn('[Carteira] Falha ao checar status de roteirização:', e.message);
  }
  renderTabela();
  atualizarKPIs();
}

// Verifica se um pedido pode ser selecionado considerando o estoque e o já selecionado
function podeSelecionarPedido(pedido) {
  if (jaEnviado(pedido)) return false;
  if (!['20','50'].includes(String(pedido.etapa))) return false;
  return true;
}

// Status de estoque para exibição na coluna
function statusEstoque(pedido) {
  if (pedido.departamento.tipo === 'licitacao') return 'na';
  const mapa = mapaEstoque(pedido);
  for (const item of pedido.itens) {
    if (!item.sku || !String(item.sku).startsWith('1')) continue;
    const disp = mapa[item.sku];
    if (disp === undefined) return 'sem';
    if (disp < item.quantidade) return 'sem';
  }
  return 'ok';
}

function jaEnviado(pedido) {
  // Fonte de verdade: lista viva do Firebase (carteira_envio/pedidos). Um
  // pedido some dela assim que a rota correspondente e despachada — entao
  // "Enviado ao Roteirizador" aqui já desconsidera os que estão em separação.
  if (_codigosEnviadosRoteirizador.has(String(pedido.codigo_pedido))) return true;
  // Fallback otimista: logo após clicar "Enviar", mostra na hora — antes do
  // primeiro fetch em carteira_envio/pedidos confirmar (que roda em paralelo).
  return (pedido.observacoes || '').includes('[ROTEIRIZADOR]');
}

// ── OMIE ──────────────────────────────────────────────────────────────────────

async function omieCall(empresa, endpoint, call, param, retry=false) {
  const resp = await fetch('/api/omie', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ endpoint, payload:{ call, app_key:empresa.key, app_secret:empresa.secret, param }})
  });
  if (!resp.ok) throw new Error('HTTP '+resp.status);
  const data = await resp.json();
  if (data.faultstring) {
    if (data.faultstring.includes('REDUNDANT') && !retry) {
      const m = data.faultstring.match(/Aguarde (\d+) segundo/);
      await new Promise(r => setTimeout(r, ((m ? parseInt(m[1]) : 35)+3)*1000));
      return omieCall(empresa, endpoint, call, param, true);
    }
    throw new Error(data.faultstring);
  }
  return data;
}

async function carregarDepartamentos(emp) {
  try {
    const d = await omieCall(emp, 'https://app.omie.com.br/api/v1/geral/departamentos/', 'ListarDepartamentos', [{pagina:1,registros_por_pagina:100}]);
    (d.departamentos||[]).forEach(dep => { deptoCache[dep.codigo] = dep.descricao; });
  } catch(e) { console.warn('Depto', emp.nome, e.message); }
}

// ── CARREGAR PEDIDOS ──────────────────────────────────────────────────────────

async function carregarPedidos() {
  const btn = document.getElementById('btn-atualizar');
  if (btn) btn.disabled = true;
  setStatus('⏳ Carregando...');
  pedidos = [];
  selecionados.clear();

  for (const emp of EMPRESAS) await carregarDepartamentos(emp);
  carregarEstoque();

  const dtCorte = new Date();
  dtCorte.setDate(dtCorte.getDate()-120);
  const dtDe = String(dtCorte.getDate()).padStart(2,'0')+'/'+String(dtCorte.getMonth()+1).padStart(2,'0')+'/'+dtCorte.getFullYear();
  const dtAte = new Date().toLocaleDateString('pt-BR');

  for (const emp of EMPRESAS) {
    for (const etapa of ['10','20','50']) {
      let pag=1, totalPag=1;
      setStatus(`⏳ ${emp.nome} · etapa ${etapa}...`);
      while (pag <= totalPag) {
        try {
          const data = await omieCall(emp,
            'https://app.omie.com.br/api/v1/produtos/pedido/',
            'ListarPedidos',
            [{ pagina:pag, registros_por_pagina:50, apenas_importado_api:'N',
               etapa, filtrar_por_data_de:dtDe, filtrar_por_data_ate:dtAte }]
          );
          const lista = data.pedido_venda_produto || [];
          totalPag = data.total_de_paginas || 1;

          lista.forEach(p => {
            const info = p.infoCadastro || {};
            if (info.faturado==='S' || info.cancelado==='S') return;
            if (pedidos.some(x => x.codigo_pedido === p.cabecalho?.codigo_pedido)) return;

            const dep   = infoDepartamento(p.departamentos||[]);
            const frete = modalidadeParaFrete(p.frete?.modalidade);
            const itens = (p.det||[]).map(d => ({
  codigo_item:    d.ide?.codigo_item,
  sku:            d.produto?.codigo,
  descricao:      d.produto?.descricao,
  quantidade:     d.produto?.quantidade||0,
  valor_unitario: d.produto?.valor_unitario||0,
  valor_total:    d.produto?.valor_total||0,
  peso_liquido:   d.inf_adic?.peso_liquido||0,
})).filter(it => it.sku && String(it.sku).startsWith('1'));
            if (!itens.length) return;

            const resumoProdutos = itens.map(it => it.descricao||'').join(' · ');
const resumoProdutosExibicao = itens.map(it =>
  `${(it.descricao||'').slice(0,28)}${(it.descricao||'').length>28?'…':''}`
).join(' · ');

            pedidos.push({
              _empresa:       emp,
              codigo_pedido:  p.cabecalho?.codigo_pedido,
              numero_pedido:  p.cabecalho?.numero_pedido,
              codigo_cliente: p.cabecalho?.codigo_cliente,
              cliente_nome:   p.informacoes_adicionais?.contato || '',
              cliente_cidade: '',
              cliente_uf:     '',
              data_inclusao:  info.dInc || '',
              etapa:          p.cabecalho?.etapa,
              frete,
              departamento:   dep,
              valor_total:    p.total_pedido?.valor_total_pedido||0,
              peso_total:     calcularPesoPedido(p.det, dep.tipo),
              observacoes:    p.observacoes?.obs_venda||'',
              resumoProdutos,
              resumoProdutosExibicao,
              itens,
              _raw: p,
            });
          });

          if (pag >= totalPag || !lista.length) break;
          pag++;
          await new Promise(r => setTimeout(r, 600));
        } catch(e) {
          console.error(emp.nome, etapa, pag, e.message);
          break;
        }
      }
    }
  }

  setStatus(`🟢 ${pedidos.length} pedidos · Sync ${new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`);
  if (btn) btn.disabled = false;
  renderTabela();
  atualizarKPIs();
  popularFiltrosLocalidade();
  buscarNomesClientes();
  carregarStatusRoteirizacao();
}

// Reconfere o status de roteirização periodicamente (pega quando uma rota é
// despachada em outra aba/máquina) e sempre que a aba volta a ficar visível.
setInterval(function(){ if (document.visibilityState === 'visible') carregarStatusRoteirizacao(); }, 60000);
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') carregarStatusRoteirizacao(); });

// ── NOMES DOS CLIENTES ────────────────────────────────────────────────────────

async function buscarNomesClientes() {
  const vistos = {};
  const fila = pedidos;
  const unicos = fila.filter(p => {
    const k = p._empresa.cod+'_'+p.codigo_cliente;
    if (vistos[k] || !p.codigo_cliente) return false;
    vistos[k] = true; return true;
  });

  for (let i=0; i<unicos.length; i+=5) {
    await Promise.all(unicos.slice(i, i+5).map(async p => {
      try {
        const r = await fetch('/api/omie', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ endpoint:'https://app.omie.com.br/api/v1/geral/clientes/',
            payload:{ call:'ConsultarCliente', app_key:p._empresa.key, app_secret:p._empresa.secret,
              param:[{codigo_cliente_omie:p.codigo_cliente}] }})
        });
        const d = await r.json();
        const nome   = d.razao_social||d.nome_fantasia||'';
        const cidade = d.cidade||'';
        const uf     = d.estado||'';
        pedidos.forEach(ped => {
          if (ped._empresa.cod===p._empresa.cod && ped.codigo_cliente===p.codigo_cliente) {
            ped.cliente_nome=nome; ped.cliente_cidade=cidade; ped.cliente_uf=uf;
          }
        });
        const cel = document.querySelector(`[data-cliente="${p._empresa.cod}_${p.codigo_cliente}"]`);
        if (cel) cel.innerHTML = `<div>${nome}<div style="font-size:10.5px;color:var(--ink4)">${cidade}${uf?' / '+uf:''}</div></div>`;
      } catch(e) {}
    }));
    popularFiltrosLocalidade();
    await new Promise(r => setTimeout(r,300));
  }
}

// ── FILTROS E ORDENAÇÃO ───────────────────────────────────────────────────────

function pedidosFiltrados() {
  const busca   = (document.getElementById('f-busca')?.value||'').toLowerCase();
  const emp     = document.getElementById('f-empresa')?.value||'';
  const depto   = document.getElementById('f-depto')?.value||'';
  const ciffob  = document.getElementById('f-ciffob')?.value||'';
  const estado  = document.getElementById('f-estado')?.value||'';
  const cidade  = document.getElementById('f-cidade')?.value||'';
  const etapa   = document.getElementById('f-etapa')?.value||'';
  const enviado = document.getElementById('f-enviado')?.value||'';
  return pedidos.filter(p => {
    if (emp    && p._empresa.cod       !== emp)    return false;
    if (depto  && p.departamento.tipo  !== depto)  return false;
    if (ciffob && p.frete              !== ciffob) return false;
    if (estado && (p.cliente_uf||'')     !== estado) return false;
    if (cidade && (p.cliente_cidade||'') !== cidade) return false;
    if (etapa  && String(p.etapa)      !== etapa)  return false;
    if (enviado === 'enviado'     && !jaEnviado(p)) return false;
    if (enviado === 'nao_enviado' &&  jaEnviado(p)) return false;
    if (busca) {
      const h = [p.numero_pedido, p.cliente_nome, p.cliente_cidade].join(' ').toLowerCase();
      if (!h.includes(busca)) return false;
    }
    return true;
  });
}

// Repopula os selects de Estado/Cidade com os valores presentes em `pedidos`,
// preservando a seleção atual do usuário sempre que ela continuar válida.
// A lista de Cidade respeita o Estado selecionado (quando houver um).
function popularFiltrosLocalidade() {
  const selEstado = document.getElementById('f-estado');
  const selCidade = document.getElementById('f-cidade');
  if (!selEstado || !selCidade) return;

  const estadoAtual = selEstado.value;
  const cidadeAtual = selCidade.value;

  const estados = [...new Set(pedidos.map(p => (p.cliente_uf||'').trim()).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b,'pt-BR'));

  selEstado.innerHTML = '<option value="">Todos</option>' +
    estados.map(uf => `<option value="${uf}">${uf}</option>`).join('');
  selEstado.value = estados.includes(estadoAtual) ? estadoAtual : '';

  const cidadesBase = selEstado.value
    ? pedidos.filter(p => (p.cliente_uf||'').trim() === selEstado.value)
    : pedidos;
  const cidades = [...new Set(cidadesBase.map(p => (p.cliente_cidade||'').trim()).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b,'pt-BR'));

  selCidade.innerHTML = '<option value="">Todas</option>' +
    cidades.map(c => `<option value="${c}">${c}</option>`).join('');
  selCidade.value = cidades.includes(cidadeAtual) ? cidadeAtual : '';
}

function ordenarPedidos(lista) {
  return lista.slice().sort((a,b) => {
    let va, vb;
    if      (sortCol==='numero_pedido') { va=parseInt(a.numero_pedido)||0; vb=parseInt(b.numero_pedido)||0; }
    else if (sortCol==='data_inclusao') { va=dataParaOrdem(a.data_inclusao); vb=dataParaOrdem(b.data_inclusao); }
    else if (sortCol==='valor_total')   { va=a.valor_total||0; vb=b.valor_total||0; }
    else if (sortCol==='cliente_nome')  { va=(a.cliente_nome||'').toLowerCase(); vb=(b.cliente_nome||'').toLowerCase(); }
    else if (sortCol==='departamento')  { va=a.departamento.label; vb=b.departamento.label; }
    else if (sortCol==='etapa')         { va=a.etapa||''; vb=b.etapa||''; }
    else if (sortCol==='empresa')       { va=a._empresa.cod; vb=b._empresa.cod; }
    else                                { va=String(a[sortCol]||'').toLowerCase(); vb=String(b[sortCol]||'').toLowerCase(); }
    return va<vb ? -sortDir : va>vb ? sortDir : 0;
  });
}

window.sortPor = function(col) {
  sortDir = (sortCol===col) ? -sortDir : 1;
  sortCol = col;
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    if (th.dataset.sort===col) th.classList.add(sortDir===1?'sort-asc':'sort-desc');
  });
  renderTabela();
};

// ── KPIs ──────────────────────────────────────────────────────────────────────

function atualizarKPIs() {
  const total   = pedidos.length;
  const prontos = pedidos.filter(p => podeSelecionarPedido(p)).length;
  const semEst  = pedidos.filter(p => statusEstoque(p)==='sem').length;
  const fmt = n => Number(n).toLocaleString('pt-BR');
  ['kpi-total-big','kpi-total'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=fmt(total); });
  ['kpi-prontos'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=fmt(prontos); });
  ['kpi-semest'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=fmt(semEst); });
}

// ── RENDER DA TABELA ──────────────────────────────────────────────────────────

function renderTabela() {
  const tbody = document.getElementById('tbody-pedidos');
  if (!tbody) return;

  const lista = ordenarPedidos(pedidosFiltrados());
  atualizarKPIs();

  document.getElementById('count-info').textContent =
    `Exibindo ${lista.length} de ${pedidos.length} pedidos` +
    (selecionados.size ? ` · ${selecionados.size} selecionado(s)` : '');

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="vazio">Nenhum pedido encontrado.</td></tr>';
    atualizarBtnEnviar();
    return;
  }

  const empBadge = {
    MFP: '<span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;background:rgba(184,144,42,.12);color:#6b3a00;border:1px solid rgba(184,144,42,.25)">MFP</span>',
    DMS: '<span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;background:rgba(29,78,216,.09);color:#1d4ed8;border:1px solid rgba(29,78,216,.2)">DMS</span>',
    PRF: '<span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;background:rgba(109,40,217,.1);color:#5b21b6;border:1px solid rgba(109,40,217,.2)">PRF</span>',
  };

  tbody.innerHTML = lista.map(p => {
    const est    = statusEstoque(p);
    const pode   = podeSelecionarPedido(p);
    const sel    = selecionados.has(p.codigo_pedido);
    const etapa  = etapaInfo(p.etapa);

    const estHtml = est==='ok'
      ? '<span class="est ok">✓ OK</span>'
      : est==='sem'
      ? '<span class="est sem">✗ Sem</span>'
      : '<span class="est na">— N/A</span>';

    const deptHtml = p.departamento.tipo==='licitacao'
      ? '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(109,40,217,.08);color:#5b21b6;border:1px solid rgba(109,40,217,.2)">📜 Licitação</span>'
      : '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(184,144,42,.1);color:#6b3a00;border:1px solid rgba(184,144,42,.25)">💼 Comercial</span>';

    const etapaHtml = `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:${etapa.bg};color:${etapa.cor};border:1px solid ${etapa.border}">${etapa.label}</span>`;

    const enviado = jaEnviado(p);
return `<tr class="${sel?'selecionado':''} ${!pode&&!sel?'bloqueado':''}" style="height:36px;${enviado?'background:rgba(251,191,36,.08)':''}">
      <td style="padding:4px 8px"><input type="checkbox" ${sel?'checked':''} ${!pode&&!sel?'disabled':''} onchange="toggleSel(${p.codigo_pedido})"></td>
      <td style="padding:4px 8px;text-align:center">${empBadge[p._empresa.cod]||p._empresa.cod}</td>
      <td style="padding:4px 8px"><b style="font-size:11px">${p.numero_pedido}</b></td>
      <td style="padding:4px 8px" data-cliente="${p._empresa.cod}_${p.codigo_cliente}">
        <div style="font-weight:600;font-size:12px;color:var(--ink2);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.cliente_nome||'...'}</div>
        <div style="font-size:10px;color:var(--ink4)">${p.cliente_cidade||''}${p.cliente_uf?' / '+p.cliente_uf:''}</div>
      </td>
      <td style="padding:4px 8px;font-size:11px;color:var(--ink3);max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help" title="${p.resumoProdutos||''}">${p.resumoProdutosExibicao||'—'}</td>
      <td style="padding:4px 8px;font-size:11.5px;white-space:nowrap">${fmtData(p.data_inclusao)}</td>
      <td style="padding:4px 8px"><span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:var(--cream2);color:var(--ink2);border:1px solid var(--border)">${p.frete==='FOB'?'📦':'🚚'} ${p.frete}</span></td>
      <td style="padding:4px 8px">${deptHtml}</td>
      <td style="padding:4px 8px">${etapaHtml}</td>
      <td style="padding:4px 8px;text-align:right;font-size:12px;font-weight:600;white-space:nowrap">${Number(p.peso_total||0).toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</td>
      <td style="padding:4px 8px;text-align:right;font-size:12px;font-weight:600;white-space:nowrap">${fmtValor(p.valor_total)}</td>
      <td style="padding:4px 8px;text-align:center">${enviado?'<span class="est" style="background:rgba(251,191,36,.15);color:#92400e;border:1px solid rgba(251,191,36,.4)">📤 Enviado</span>':estHtml}</td>
      <td style="padding:4px 8px;text-align:center"><button class="btn-det" onclick="abrirDrawer(${p.codigo_pedido})">👁</button></td>
    </tr>`;
  }).join('');

  atualizarBtnEnviar();
}

// ── SELEÇÃO ───────────────────────────────────────────────────────────────────

window.toggleSel = function(cod) {
  const pedido = pedidos.find(p => p.codigo_pedido === cod);
  if (!pedido) return;

  if (selecionados.has(cod)) {
    selecionados.delete(cod);
  } else {
    if (!podeSelecionarPedido(pedido)) {
      alert('Este pedido não pode ser selecionado — estoque insuficiente para um ou mais itens.');
      renderTabela();
      return;
    }
    selecionados.add(cod);
  }
  renderTabela(); // re-renderiza recalculando o que pode ser selecionado
};

document.getElementById('btn-sel-ok')?.addEventListener('click', () => {
  selecionados.clear();
  pedidos.forEach(p => { if (podeSelecionarPedido(p)) selecionados.add(p.codigo_pedido); });
  renderTabela();
});

document.getElementById('btn-sel-limpar')?.addEventListener('click', () => {
  selecionados.clear();
  renderTabela();
});
function atualizarBtnEnviar() {
  const btn = document.getElementById('btn-enviar');
  if (!btn) return;

  // Só admin e logistica podem enviar
  const u = getUsuarioAtual();
  const podeEnviar = u && ['admin','logistica'].includes(u.perfil);

  btn.disabled = selecionados.size === 0 || !podeEnviar;
  btn.title = !podeEnviar ? 'Sem permissão para enviar para roteirização' : '';
  btn.textContent = selecionados.size
    ? `➡ Enviar ${selecionados.size} pedido(s) para Roteirização`
    : '➡ Enviar selecionados para Roteirização';

  // Peso total selecionado
  const pesoSel = pedidos
    .filter(p => selecionados.has(p.codigo_pedido))
    .reduce((s, p) => s + (p.peso_total || 0), 0);
  const elPeso = document.getElementById('kpi-peso-sel');
  if (elPeso) elPeso.textContent = Number(pesoSel).toLocaleString('pt-BR',{maximumFractionDigits:1}) + ' kg';
}

document.getElementById('btn-enviar')?.addEventListener('click', async () => {
  const u = getUsuarioAtual();
  if (!u || !['admin','logistica'].includes(u.perfil)) {
    alert('Sem permissão para enviar para roteirização.');
    return;
  }

  const sels = pedidos.filter(p => selecionados.has(p.codigo_pedido));
  
  // Busca CEP dos clientes no OMIE
  setStatus('⏳ Buscando dados dos clientes...');
  for (const p of sels) {
    if (p.cliente_cep) continue;
    try {
      const r = await fetch('/api/omie', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ endpoint:'https://app.omie.com.br/api/v1/geral/clientes/',
          payload:{ call:'ConsultarCliente', app_key:p._empresa.key, app_secret:p._empresa.secret,
            param:[{codigo_cliente_omie:p.codigo_cliente}] }})
      });
      const d = await r.json();
      p.cliente_cep    = (d.cep||'').replace(/\D/g,'');
      p.cliente_cidade = d.cidade || p.cliente_cidade;
      p.cliente_uf     = d.estado || p.cliente_uf;
      p.cliente_end    = d.endereco || '';
    } catch(e) {}
    await new Promise(r => setTimeout(r, 150));
  }

  // Mostra modal de confirmação
  abrirModalConfirmacao(sels, u);
});

let _pendentesEnvio = [];

function abrirModalConfirmacao(sels, usuario) {
  _pendentesEnvio = sels.slice();
  renderModalConfirmacao(usuario);
  document.getElementById('modal-confirm-envio').style.display = 'flex';
}

function renderModalConfirmacao(usuario) {
  const u = usuario || getUsuarioAtual();
  const lista = document.getElementById('modal-confirm-lista');
  if (!lista) return;

  lista.innerHTML = _pendentesEnvio.map((p, idx) => `
    <div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;background:rgba(13,31,60,.08);color:var(--navy)">${p._empresa.cod}</span>
          <span style="font-family:monospace;font-size:12px;font-weight:700;color:var(--navy)">${p.numero_pedido}</span>
          <span style="font-size:10px;color:var(--ink3)">${p.frete}</span>
        </div>
        <div style="font-size:12px;font-weight:600;color:var(--ink2)">${p.cliente_nome||'—'}</div>
        <div style="font-size:10.5px;color:var(--ink4)">${p.cliente_cidade||''}${p.cliente_uf?' / '+p.cliente_uf:''}</div>
        <div style="margin-top:6px;font-size:11px;color:var(--ink3);background:var(--cream2);border-radius:6px;padding:6px 8px;border-left:3px solid ${p.observacoes?'var(--gold)':'var(--border)'};">
          ${p.observacoes ? '💬 '+p.observacoes : '<span style="color:var(--ink4);font-style:italic;">Sem observação</span>'}
        </div>
      </div>
      <button onclick="removerPendenteEnvio(${idx})" title="Remover do envio"
        style="background:rgba(190,18,60,.08);border:1px solid rgba(190,18,60,.2);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:14px;flex-shrink:0;color:#be123c;">
        🗑
      </button>
    </div>
  `).join('') || '<div style="text-align:center;padding:24px;color:var(--ink4);">Nenhum pedido selecionado.</div>';

  const cnt = document.getElementById('modal-confirm-count');
  if (cnt) cnt.textContent = _pendentesEnvio.length + ' pedido(s) para roteirização';
}

window.removerPendenteEnvio = function(idx) {
  _pendentesEnvio.splice(idx, 1);
  renderModalConfirmacao();
};

window.fecharModalConfirmacao = function() {
  document.getElementById('modal-confirm-envio').style.display = 'none';
  _pendentesEnvio = [];
  setStatus('🟢 Envio cancelado.');
};
window.confirmarEnvioRoteirizador = function() {
  if (!_pendentesEnvio.length) { alert('Nenhum pedido para enviar.'); return; }
  const u = getUsuarioAtual();
  const agora = new Date().toLocaleDateString('pt-BR');
  const marcacao = `[ROTEIRIZADOR] Enviado em ${agora} por ${u.nome}`;

  // 1) ATUALIZA LOCAL IMEDIATAMENTE (UI responde na hora)
  _pendentesEnvio.forEach(p => {
    p.observacoes = p.observacoes ? p.observacoes + '\n' + marcacao : marcacao;
  });

  // 2) SALVA NO LOCALSTORAGE PARA O ROTEIRIZADOR LER
  const payloadEnvio = _pendentesEnvio.map(p => ({
  empresa:p._empresa.cod, numero_pedido:p.numero_pedido, codigo_pedido:p.codigo_pedido,
  codigo_cliente:p.codigo_cliente, cliente_nome:p.cliente_nome,
  cliente_cidade:p.cliente_cidade, cliente_uf:p.cliente_uf,
  cliente_cep:p.cliente_cep||'', cliente_end:p.cliente_end||'',
  valor_total:p.valor_total, peso_total:p.peso_total,
  frete:p.frete, departamento:p.departamento.label, itens:p.itens,
  observacoes:p.observacoes,
}));
  const paraMarcar = _pendentesEnvio.slice();
  _pendentesEnvio = [];
try {
  var _fbApp2 = firebase.apps && firebase.apps.length
    ? firebase.apps[0]
    : firebase.initializeApp({
        apiKey: "AIzaSyAch7_Sn4jq1cuTGV1ijGsDGUXC9dyilOs",
        databaseURL: "https://mfparis-bd054-default-rtdb.firebaseio.com",
        projectId: "mfparis-bd054"
      });
  document.getElementById('modal-confirm-envio').style.display = 'none';
  selecionados.clear();
  renderTabela();
  atualizarKPIs();

  // MERGE: le a lista atual em carteira_envio/pedidos e so entao grava de
  // volta o conjunto combinado — evita apagar pedidos de um envio anterior
  // que ainda nao foram carregados/despachados no Roteirizador (um PUT direto
  // com so os novos sobrescrevia e "perdia" os antigos da fila).
  fetch('/api/firebase-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'carteira_envio/pedidos' })
  })
  .then(function(r){ return r.json(); })
  .then(function(atual){
    var lista = Array.isArray(atual) ? atual : [];
    var porCodigo = {};
    lista.forEach(function(p){ porCodigo[String(p.codigo_pedido)] = p; });
    payloadEnvio.forEach(function(p){ porCodigo[String(p.codigo_pedido)] = p; }); // novo sobrepõe se já existia
    var combinado = Object.values(porCodigo);
    return fetch('/api/firebase-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'carteira_envio/pedidos', data: combinado })
    });
  }).then(function(){
    payloadEnvio.forEach(function(p){ _codigosEnviadosRoteirizador.add(String(p.codigo_pedido)); }); // status na hora
    renderTabela();
    setStatus('✅ ' + payloadEnvio.length + ' pedido(s) enviado(s). Abra o Roteirizador e clique em "Carregar Carteira".');
  }).catch(function(e){
    setStatus('❌ Erro ao gravar: ' + e.message);
  });
} catch(e) { 
  console.warn('[Carteira] Firebase write:', e.message);
  setStatus('❌ Erro: ' + e.message);
}
  
  // 5) MARCA NO OMIE EM BACKGROUND (não bloqueia abertura nem UI)
  (async () => {
    let ok = 0, erros = 0;
    for (const p of paraMarcar) {
      try {
        await omieCall(p._empresa,
          'https://app.omie.com.br/api/v1/produtos/pedido/',
          'AlterarPedidoVenda',
          [{ cabecalho:{codigo_pedido:p.codigo_pedido}, observacoes:{obs_venda:p.observacoes} }]);
        ok++;
      } catch(e) {
        console.warn('Erro ao marcar pedido', p.numero_pedido, e.message);
        erros++;
      }
    }
    setStatus(erros
      ? `⚠ ${ok} marcado(s) · ${erros} erro(s) no OMIE`
      : `🟢 ${ok} pedido(s) marcado(s) no OMIE · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`);
  })();
};

 // ── DRAWER ────────────────────────────────────────────────────────────────────

window.abrirDrawer = function(cod) {
  pedidoAtual = pedidos.find(p => p.codigo_pedido === cod);
  if (!pedidoAtual) return;
  renderDrawer();
  document.getElementById('drawer').classList.add('aberto');
};

document.getElementById('dr-fechar')?.addEventListener('click', () => {
  document.getElementById('drawer').classList.remove('aberto');
  pedidoAtual = null;
});

function renderDrawer() {
  const p = pedidoAtual;
  if (!p) return;
  document.getElementById('dr-titulo').textContent = `${p._empresa.nome} · Pedido ${p.numero_pedido}`;
  const mapa = mapaEstoque(p);
  document.getElementById('dr-body').innerHTML = `
    <div class="kv"><b>Empresa</b><span>${p._empresa.nome}</span></div>
    <div class="kv"><b>Nº Pedido</b><span>${p.numero_pedido}</span></div>
    <div class="kv"><b>Cliente</b><span>${p.cliente_nome||'—'}</span></div>
    <div class="kv"><b>Cidade</b><span>${p.cliente_cidade||'—'}${p.cliente_uf?' / '+p.cliente_uf:''}</span></div>
    <div class="kv"><b>Inclusão</b><span>${fmtData(p.data_inclusao)}</span></div>
    <div class="kv"><b>Frete</b><span>${p.frete}</span></div>
    <div class="kv"><b>Departamento</b><span>${p.departamento.label}</span></div>
    <div class="kv"><b>Etapa</b><span>${etapaInfo(p.etapa).label}</span></div>
    <div class="kv"><b>Valor Total</b><span style="font-size:15px;font-family:'Playfair Display',serif">${fmtValor(p.valor_total)}</span></div>
    <h4>Observações</h4>
    <textarea id="dr-obs" style="width:100%;min-height:70px;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--cream);resize:vertical">${p.observacoes||''}</textarea>
    <button onclick="salvarObs()" style="margin-top:6px;padding:8px 16px;background:var(--navy);color:var(--gold3);border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">💾 Salvar observação</button>
    <h4>Itens (${p.itens.length})</h4>
    <table class="itens">
      <thead><tr><th>SKU</th><th>Descrição</th><th class="r">Qtd</th><th class="r">Estoque</th><th class="r">Vlr Unit.</th><th></th></tr></thead>
      <tbody>
        ${p.itens.map(it => {
          const disp = mapa[it.sku];
          const estOk = disp === undefined ? '—' : disp >= it.quantidade
            ? `<span style="color:#166534;font-weight:700">✓ ${disp}</span>`
            : `<span style="color:#9f1239;font-weight:700">✗ ${disp}</span>`;
          return `<tr>
            <td><b>${it.sku||'—'}</b></td>
            <td>${it.descricao||'—'}</td>
            <td class="r">${it.quantidade}</td>
            <td class="r">${estOk}</td>
            <td class="r">${fmtValor(it.valor_unitario)}</td>
            <td><button onclick="abrirEditarItem(${it.codigo_item})" style="background:var(--cream);border:1px solid var(--border);border-radius:5px;padding:2px 7px;font-size:10px;cursor:pointer">✏</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
      <button onclick="confirmarCancelar()" style="width:100%;padding:11px;background:#9f1239;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer">🗑 Cancelar pedido no OMIE</button>
    </div>`;
}

// ── AÇÕES DO DRAWER ───────────────────────────────────────────────────────────

window.salvarObs = async function() {
  const p = pedidoAtual; if (!p) return;
  const obs = document.getElementById('dr-obs')?.value||'';
  try {
    await omieCall(p._empresa, 'https://app.omie.com.br/api/v1/produtos/pedido/', 'AlterarPedidoVenda',
      [{ cabecalho:{codigo_pedido:p.codigo_pedido}, observacoes:{obs_venda:obs} }]);
    p.observacoes = obs;
    alert('✅ Observação salva!');
  } catch(e) { alert('❌ Erro: '+e.message); }
};

window.abrirEditarItem = function(codigoItem) {
  const p = pedidoAtual; if (!p) return;
  const item = p.itens.find(i => i.codigo_item===codigoItem); if (!item) return;
  const novaQtd = prompt(`Alterar quantidade\n${item.descricao}\nAtual: ${item.quantidade}\n\nNova quantidade:`, item.quantidade);
  if (novaQtd===null) return;
  const qtd = parseFloat(novaQtd);
  if (isNaN(qtd)||qtd<=0) { alert('Quantidade inválida.'); return; }
  alterarItem(item, qtd);
};

async function alterarItem(item, novaQtd) {
  const p = pedidoAtual; if (!p) return;
  try {
    await omieCall(p._empresa, 'https://app.omie.com.br/api/v1/produtos/pedido/', 'AlterarPedidoVenda',
      [{ cabecalho:{codigo_pedido:p.codigo_pedido},
         det:[{ide:{codigo_item:item.codigo_item}, produto:{codigo_produto:item.codigo_produto, quantidade:novaQtd}}] }]);
    item.quantidade = novaQtd;
    item.valor_total = novaQtd * item.valor_unitario;
    p.valor_total = p.itens.reduce((s,i)=>s+i.valor_total,0);
    renderDrawer(); renderTabela();
    alert('✅ Item alterado!');
  } catch(e) { alert('❌ Erro: '+e.message); }
}

window.confirmarCancelar = async function() {
  const p = pedidoAtual; if (!p) return;
  if (!confirm(`⚠️ CANCELAR o pedido ${p.numero_pedido} de ${p.cliente_nome}?\n\nEssa ação é IRREVERSÍVEL.`)) return;
  if (!confirm(`Confirma definitivamente o cancelamento?`)) return;
  try {
    await omieCall(p._empresa, 'https://app.omie.com.br/api/v1/produtos/pedido/', 'CancelarPedido',
      [{codigo_pedido:p.codigo_pedido, motivo:'Cancelado via OPUS Carteira'}]);
    pedidos = pedidos.filter(ped => ped.codigo_pedido !== p.codigo_pedido);
    selecionados.delete(p.codigo_pedido);
    document.getElementById('drawer').classList.remove('aberto');
    pedidoAtual = null;
    renderTabela(); atualizarKPIs();
    alert('✅ Pedido cancelado.');
  } catch(e) { alert('❌ Erro: '+e.message); }
};

// ── EVENTOS ───────────────────────────────────────────────────────────────────

['f-busca','f-empresa','f-depto','f-ciffob','f-cidade','f-etapa','f-enviado'].forEach(id => {
  document.getElementById(id)?.addEventListener('input',  renderTabela);
  document.getElementById(id)?.addEventListener('change', renderTabela);
});

// Ao trocar o Estado, a lista de Cidade é reconstruída para mostrar apenas
// as cidades daquele estado (a cidade selecionada é limpa se não pertencer a ele)
// antes de recalcular a tabela.
document.getElementById('f-estado')?.addEventListener('change', () => {
  const selCidade = document.getElementById('f-cidade');
  if (selCidade) selCidade.value = '';
  popularFiltrosLocalidade();
  renderTabela();
});

document.getElementById('btn-atualizar')?.addEventListener('click', carregarPedidos);

// Data no header
(function(){
  const dt=new Date();
  const dias=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const meses=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const el=document.getElementById('h-date');
  if(el) el.textContent=dias[dt.getDay()].charAt(0).toUpperCase()+dias[dt.getDay()].slice(1)+', '+dt.getDate()+' de '+meses[dt.getMonth()];
  document.getElementById('btn-exportar')?.addEventListener('click', () => {
  if (!pedidos.length) { alert('Carregue os pedidos primeiro.'); return; }

  const lista = ordenarPedidos(pedidosFiltrados());

  const linhas = [
    ['Empresa','Pedido','Cliente','Cidade','UF','Inclusão','Frete','Departamento','Etapa','Peso (kg)','Valor Total','Estoque','Produtos','Status Roteiro']
  ];

  lista.forEach(p => {
    const est = statusEstoque(p);
    const estLabel = est==='ok' ? 'OK' : est==='sem' ? 'Sem estoque' : 'N/A';
    const etapa = etapaInfo(p.etapa).label;
    linhas.push([
      p._empresa.nome,
      p.numero_pedido,
      p.cliente_nome || '—',
      p.cliente_cidade || '—',
      p.cliente_uf || '—',
      p.data_inclusao || '—',
      p.frete,
      p.departamento.label,
      etapa,
      Number(p.peso_total||0).toFixed(1),
      Number(p.valor_total||0).toFixed(2),
     estLabel,
      p.resumoProdutos || '—',
      jaEnviado(p) ? 'Enviado ao Roteirizador' : '',
    ]);
  });

  // Gera CSV e baixa como .xlsx via blob
  const csv = linhas.map(row =>
    row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')
  ).join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `carteira_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
})();
