/**
 * anexo-ar.js — Anexar comprovante de AR (Aviso de Recebimento) ao pedido
 * correto no Omie, em lote.
 *
 * Fluxo: você seleciona UMA VEZ a pasta do seu PC onde ficam os PDFs de AR
 * (nome do arquivo no padrão NUMERO-EMPRESA.pdf, ex: "961-PROFI.pdf"). Depois
 * disso, só digita os números dos pedidos numa lista — o programa procura
 * sozinho o arquivo correspondente dentro da pasta e anexa no Omie.
 *
 * Não precisa digitar caminho nenhum. Só precisa apontar a pasta uma vez
 * (o navegador lembra da permissão nas próximas vezes, contanto que seja o
 * mesmo navegador/perfil).
 *
 * ⚠ Requer Chrome ou Edge (API de acesso a pastas locais não existe no
 * Firefox/Safari). Se abrir num navegador sem suporte, mostra um aviso.
 *
 * Independente do carteira.js, mas segue o mesmo padrão de projeto:
 *  - auth.js com exigirPerfis()
 *  - proxy de backend em /api/omie (o mesmo que o carteira.js já usa)
 *
 * Requer, no HTML, duas libs externas via <script> (ver anexo-ar.html):
 *  - JSZip    (compactar o arquivo antes de enviar — o Omie exige zip+base64)
 *  - SparkMD5 (gerar o hash MD5 exigido pelo Omie)
 *
 * ── SOBRE UMA AMBIGUIDADE NA API DO OMIE (leia antes de usar em produção) ──
 * A doc do Omie diz que `cMd5` é "o MD5 do arquivo enviado em cArquivo", mas
 * não deixa 100% claro se isso é o MD5 dos BYTES do zip (antes de virar
 * base64) ou o MD5 da STRING base64 já pronta. Implementei a opção mais comum
 * (MD5 dos bytes do zip) como padrão. Teste com 1 pedido antes de rodar em
 * lote — se o Omie recusar o anexo (erro de formato/hash), troque a constante
 * MD5_DA_STRING_BASE64 abaixo para `true` e teste de novo.
 */

import { getUsuarioAtual, onUsuarioPronto } from './auth.js';
import { exigirPerfis } from './auth.js';

// Ajuste os perfis que podem anexar AR, se necessário.
exigirPerfis(['admin', 'logistica']);

// ── CONFIGURAÇÃO ───────────────────────────────────────────────────────────

// As credenciais (key/secret) NÃO ficam mais aqui — /api/omie-seguro resolve
// no servidor a partir do código da empresa (cod).
const EMPRESAS = {
  MFP:   { nome: 'MF Paris', cod: 'MFP' },
  DMS:   { nome: 'DMS',      cod: 'DMS' },
  PROFI: { nome: 'Profi',    cod: 'PRF' },
};

// Tags aceitas no nome do arquivo, e pra qual empresa cada uma aponta.
const TAG_PARA_EMPRESA = { MFP: 'MFP', DMS: 'DMS', PROFI: 'PROFI', PRF: 'PROFI' };

// true  = MD5 calculado sobre a string base64 final
// false = MD5 calculado sobre os bytes brutos do zip (padrão)
const MD5_DA_STRING_BASE64 = false;

const DB_NOME = 'anexo-ar-db';
const DB_STORE = 'handles';
const CHAVE_PASTA = 'pastaAR';

// ── ESTADO ──────────────────────────────────────────────────────────────────

let dirHandle = null;   // FileSystemDirectoryHandle da pasta selecionada
let itens = [];          // { id, numero, empresaKey, nomeArquivo, fileHandle, statusBusca, statusEnvio, mensagem }
let proximoId = 1;
let processando = false;

const setStatus = msg => { const el = document.getElementById('status-sync'); if (el) el.textContent = msg; };

// ── SUPORTE DO NAVEGADOR ─────────────────────────────────────────────────────

function suportaFileSystemAccess() {
  return typeof window.showDirectoryPicker === 'function';
}

// ── PERSISTÊNCIA DO HANDLE DA PASTA (IndexedDB) ──────────────────────────────

function abrirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function salvarHandlePasta(handle) {
  const db = await abrirDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(handle, CHAVE_PASTA);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function carregarHandlePasta() {
  try {
    const db = await abrirDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(CHAVE_PASTA);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

// ── SELEÇÃO DE PASTA ──────────────────────────────────────────────────────────

async function selecionarPasta() {
  if (!suportaFileSystemAccess()) {
    alert('Seu navegador não suporta selecionar pastas locais. Use Chrome ou Edge.');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker();
    dirHandle = handle;
    await salvarHandlePasta(handle);
    atualizarLabelPasta();
    setStatus('📁 Pasta selecionada: ' + handle.name);
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('[AnexoAR] seleção de pasta:', e.message);
  }
}

async function tentarRestaurarPasta() {
  const handle = await carregarHandlePasta();
  if (!handle) return;
  try {
    const permissao = await handle.queryPermission({ mode: 'read' });
    if (permissao === 'granted') {
      dirHandle = handle;
      atualizarLabelPasta();
      setStatus('📁 Pasta restaurada: ' + handle.name);
    } else {
      dirHandle = handle; // guarda mas vai pedir permissão de novo quando usar
      atualizarLabelPasta(true);
    }
  } catch (e) {
    console.warn('[AnexoAR] restaurar pasta:', e.message);
  }
}

async function garantirPermissaoPasta() {
  if (!dirHandle) return false;
  const permissao = await dirHandle.queryPermission({ mode: 'read' });
  if (permissao === 'granted') return true;
  const pedida = await dirHandle.requestPermission({ mode: 'read' });
  return pedida === 'granted';
}

function atualizarLabelPasta(precisaConfirmar) {
  const el = document.getElementById('pasta-label');
  if (!el) return;
  if (!dirHandle) {
    el.textContent = 'Nenhuma pasta selecionada.';
  } else {
    el.textContent = precisaConfirmar
      ? `Pasta "${dirHandle.name}" salva — clique em "Selecionar pasta" pra confirmar o acesso de novo.`
      : `Pasta atual: ${dirHandle.name}`;
  }
}

// ── OMIE (mesmo padrão de chamada do carteira.js) ───────────────────────────

async function omieCall(empresa, endpoint, call, param, retry = false) {
  const resp = await fetch('/api/omie-seguro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, call, param, empresa: empresa.cod })
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (data.faultstring) {
    if (data.faultstring.includes('REDUNDANT') && !retry) {
      const m = data.faultstring.match(/Aguarde (\d+) segundo/);
      await new Promise(r => setTimeout(r, ((m ? parseInt(m[1]) : 35) + 3) * 1000));
      return omieCall(empresa, endpoint, call, param, true);
    }
    throw new Error(data.faultstring);
  }
  return data;
}

async function consultarCodigoPedido(empresa, numeroPedido) {
  const data = await omieCall(
    empresa,
    'https://app.omie.com.br/api/v1/produtos/pedido/',
    'ConsultarPedido',
    [{ numero_pedido: String(numeroPedido) }]
  );
  const codigo = data?.cabecalho?.codigo_pedido || data?.pedido_venda_produto?.[0]?.cabecalho?.codigo_pedido;
  if (!codigo) throw new Error('Pedido não encontrado no Omie (ou resposta em formato inesperado).');
  return codigo;
}

async function anexarArquivo(empresa, codigoPedido, nomeArquivo, arrayBufferZip, md5hex) {
  const base64 = arrayBufferParaBase64(arrayBufferZip);
  const cMd5 = MD5_DA_STRING_BASE64 ? SparkMD5.hash(base64) : md5hex;
  const ext = (nomeArquivo.split('.').pop() || 'pdf').toLowerCase();
  return omieCall(
    empresa,
    'https://app.omie.com.br/api/v1/geral/anexo/',
    'IncluirAnexo',
    [{
      cCodIntAnexo: ('AR-' + codigoPedido).slice(0, 20),
      cTabela: 'pedido-venda',
      nId: codigoPedido,
      cNomeArquivo: nomeArquivo,
      cTipoArquivo: ext,
      cArquivo: base64,
      cMd5: cMd5,
    }]
  );
}

// ── ZIP + BASE64 + MD5 ───────────────────────────────────────────────────────

async function zipArquivo(file) {
  const buf = await file.arrayBuffer();
  const zip = new JSZip();
  zip.file(file.name, buf);
  const zipBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  const md5hex = SparkMD5.ArrayBuffer.hash(zipBuf);
  return { zipBuf, md5hex };
}

function arrayBufferParaBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binario = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binario);
}

// ── PARSING DO NOME DO ARQUIVO (ex: "961-PROFI.pdf") ────────────────────────

function parseNomeArquivo(nomeOriginal) {
  const base = nomeOriginal.replace(/\.[^./\\]+$/, '');
  const mNum = base.match(/(\d{1,10})/);
  const numero = mNum ? mNum[1] : '';
  const upper = base.toUpperCase();
  let empresaKey = '';
  for (const tag of Object.keys(TAG_PARA_EMPRESA)) {
    if (upper.includes(tag)) { empresaKey = TAG_PARA_EMPRESA[tag]; break; }
  }
  return { numero, empresaKey };
}

// Procura, dentro da pasta selecionada, o(s) arquivo(s) cujo número batem
// com o número de pedido informado (comparação exata do grupo de dígitos
// no início do nome, não apenas "contém").
async function buscarArquivosPorNumero(numero) {
  const encontrados = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    const parsed = parseNomeArquivo(entry.name);
    if (parsed.numero === String(numero)) {
      encontrados.push({ handle: entry, empresaKey: parsed.empresaKey });
    }
  }
  return encontrados;
}

// ── LISTA / RENDER ────────────────────────────────────────────────────────────

function parseNumerosDoTexto(texto) {
  return texto
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => /^\d+$/.test(s));
}

async function adicionarNumeros(numeros) {
  if (!dirHandle) {
    alert('Selecione a pasta com os arquivos de AR primeiro.');
    return;
  }
  const permitido = await garantirPermissaoPasta();
  if (!permitido) {
    alert('Sem permissão de acesso à pasta. Clique em "Selecionar pasta" novamente.');
    return;
  }

  for (const numero of numeros) {
    const id = proximoId++;
    const item = {
      id, numero, empresaKey: '', nomeArquivo: '', fileHandle: null,
      statusBusca: 'buscando', statusEnvio: 'pendente', mensagem: '',
    };
    itens.push(item);
    renderLista();

    try {
      const achados = await buscarArquivosPorNumero(numero);
      if (achados.length === 0) {
        item.statusBusca = 'nao_encontrado';
        item.mensagem = 'Nenhum arquivo encontrado na pasta pra esse número.';
      } else if (achados.length > 1) {
        item.statusBusca = 'ambiguo';
        item.mensagem = `${achados.length} arquivos encontrados com esse número — verifique a pasta.`;
        item.fileHandle = achados[0].handle;
        item.nomeArquivo = achados[0].handle.name;
        item.empresaKey = achados[0].empresaKey;
      } else {
        item.statusBusca = 'encontrado';
        item.fileHandle = achados[0].handle;
        item.nomeArquivo = achados[0].handle.name;
        item.empresaKey = achados[0].empresaKey;
      }
    } catch (e) {
      item.statusBusca = 'nao_encontrado';
      item.mensagem = 'Erro ao buscar na pasta: ' + e.message;
    }
    renderLista();
  }
}

window.removerItem = function (id) {
  itens = itens.filter(it => it.id !== id);
  renderLista();
};

window.atualizarEmpresaItem = function (id, valor) {
  const it = itens.find(i => i.id === id);
  if (it) it.empresaKey = valor;
};

function badgeBusca(it) {
  if (it.statusBusca === 'buscando') return '<span class="est na">⏳ Buscando...</span>';
  if (it.statusBusca === 'encontrado') return `<span class="est ok" title="${it.nomeArquivo}">✓ ${it.nomeArquivo}</span>`;
  if (it.statusBusca === 'ambiguo') return `<span class="est sem" title="${it.mensagem}">⚠ Ambíguo</span>`;
  return `<span class="est sem" title="${it.mensagem||''}">✗ Não encontrado</span>`;
}

function badgeEnvio(it) {
  if (it.statusEnvio === 'ok') return '<span class="est ok">✓ Anexado</span>';
  if (it.statusEnvio === 'erro') return `<span class="est sem" title="${(it.mensagem||'').replace(/"/g,'&quot;')}">✗ Erro</span>`;
  if (it.statusEnvio === 'processando') return '<span class="est na">⏳ Enviando...</span>';
  return '<span class="est na">— Pendente</span>';
}

function renderLista() {
  const tbody = document.getElementById('tbody-anexos');
  if (!tbody) return;

  document.getElementById('count-info').textContent = itens.length
    ? `${itens.length} pedido(s) na lista`
    : 'Nenhum pedido adicionado ainda.';

  if (!itens.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum pedido na lista. Cole os números acima e clique em "Adicionar à lista".</td></tr>';
    atualizarBtnEnviar();
    return;
  }

  tbody.innerHTML = itens.map(it => `
    <tr>
      <td style="padding:4px 8px;font-size:12px;font-weight:700">${it.numero}</td>
      <td style="padding:4px 8px">${badgeBusca(it)}</td>
      <td style="padding:4px 8px">
        <select style="padding:4px 6px;border:1px solid var(--border,#d8d0bd);border-radius:6px;font-size:12px"
          onchange="atualizarEmpresaItem(${it.id}, this.value)" ${it.statusEnvio==='ok'?'disabled':''}>
          <option value="">— selecione —</option>
          <option value="MFP" ${it.empresaKey==='MFP'?'selected':''}>MF Paris (MFP)</option>
          <option value="DMS" ${it.empresaKey==='DMS'?'selected':''}>DMS</option>
          <option value="PROFI" ${it.empresaKey==='PROFI'?'selected':''}>Profi</option>
        </select>
      </td>
      <td style="padding:4px 8px;text-align:center">${badgeEnvio(it)}</td>
      <td style="padding:4px 8px;font-size:11px;color:#9f1239;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.statusEnvio==='erro' ? (it.mensagem||'') : ''}</td>
      <td style="padding:4px 8px;text-align:center">
        <button onclick="removerItem(${it.id})" title="Remover" style="background:rgba(190,18,60,.08);border:1px solid rgba(190,18,60,.2);border-radius:6px;padding:3px 8px;cursor:pointer">🗑</button>
      </td>
    </tr>
  `).join('');

  atualizarBtnEnviar();
}

function atualizarBtnEnviar() {
  const btn = document.getElementById('btn-anexar-tudo');
  if (!btn) return;
  const prontos = itens.filter(it => it.statusEnvio !== 'ok' && it.fileHandle).length;
  btn.disabled = prontos === 0 || processando;
  btn.textContent = processando ? '⏳ Processando...' : `➡ Anexar tudo (${prontos})`;
}

// ── PROCESSAMENTO EM LOTE ────────────────────────────────────────────────────

async function processarItem(it) {
  if (!it.fileHandle) throw new Error('Nenhum arquivo localizado pra esse pedido.');
  if (!it.empresaKey) throw new Error('Empresa não identificada — selecione manualmente.');
  const empresa = EMPRESAS[it.empresaKey];
  if (!empresa) throw new Error('Empresa inválida: ' + it.empresaKey);

  const codigoPedido = await consultarCodigoPedido(empresa, it.numero);
  const file = await it.fileHandle.getFile();
  const { zipBuf, md5hex } = await zipArquivo(file);
  await anexarArquivo(empresa, codigoPedido, it.nomeArquivo, zipBuf, md5hex);
}

async function anexarTudo() {
  if (processando) return;
  const prontos = itens.filter(it => it.statusEnvio !== 'ok' && it.fileHandle);
  if (!prontos.length) return;
  if (!confirm(`Confirma o envio de ${prontos.length} anexo(s) para o Omie?`)) return;

  processando = true;
  atualizarBtnEnviar();

  let ok = 0, erro = 0;
  for (const it of prontos) {
    it.statusEnvio = 'processando';
    renderLista();
    setStatus(`⏳ Anexando pedido ${it.numero} (${it.nomeArquivo})...`);
    try {
      await processarItem(it);
      it.statusEnvio = 'ok';
      it.mensagem = '';
      ok++;
    } catch (e) {
      it.statusEnvio = 'erro';
      it.mensagem = e.message || String(e);
      erro++;
    }
    renderLista();
    // Respiro entre chamadas — o Omie não aceita chamadas simultâneas de
    // inclusão/alteração pro mesmo app_key+método.
    await new Promise(r => setTimeout(r, 500));
  }

  processando = false;
  setStatus(erro
    ? `⚠ ${ok} anexado(s) · ${erro} erro(s) — veja a coluna de erro na lista`
    : `✅ ${ok} anexo(s) enviado(s) com sucesso`);
  atualizarBtnEnviar();
}

// ── EVENTOS ───────────────────────────────────────────────────────────────────

document.getElementById('btn-selecionar-pasta')?.addEventListener('click', selecionarPasta);

document.getElementById('btn-add-numeros')?.addEventListener('click', () => {
  const txt = document.getElementById('numeros-texto');
  const numeros = parseNumerosDoTexto(txt?.value || '');
  if (!numeros.length) { alert('Cole ao menos um número de pedido.'); return; }
  adicionarNumeros(numeros);
  if (txt) txt.value = '';
});

document.getElementById('btn-anexar-tudo')?.addEventListener('click', anexarTudo);

document.getElementById('btn-limpar-lista')?.addEventListener('click', () => {
  if (itens.some(it => it.statusEnvio === 'processando')) return;
  if (!confirm('Limpar toda a lista?')) return;
  itens = [];
  renderLista();
});

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────

if (!suportaFileSystemAccess()) {
  const aviso = document.getElementById('aviso-navegador');
  if (aviso) aviso.style.display = 'block';
}

tentarRestaurarPasta();
renderLista();
