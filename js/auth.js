/**
 * auth.js
 * ------------------------------------------------------------
 * Camada de autenticacao + autorizacao (RBAC).
 * Usa firebase-init.js como fonte unica de Firebase.
 *
 * Funcoes principais:
 *   onUsuarioPronto(cb)       - chama cb(user, perfil) quando auth resolve
 *   getUsuarioAtual()         - retorna { uid, email, nome, perfil } ou null
 *   sair()                    - logout
 *   exigirPerfis(perfisOk)    - bloqueia render se perfil nao estiver na lista
 *
 * Estrutura no Realtime DB:
 *   /usuarios/{uid} = { nome, email, perfil, ativo: bool, criado_em }
 * ------------------------------------------------------------
 */
import { auth, db } from './firebase-init.js';
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref, get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

let _usuarioCache = null;
let _filaResolucao = [];

/**
 * Le perfil do usuario no Realtime DB.
 * Retorna objeto { nome, email, perfil, ativo } ou null se nao cadastrado.
 */
async function carregarPerfilUsuario(user) {
  if (!user) return null;
  try {
    const snap = await get(ref(db, 'usuarios/' + user.uid));
    if (!snap.exists()) {
      console.warn('[auth] Usuario autenticado mas sem registro em /usuarios/', user.uid);
      return null;
    }
    const dados = snap.val();
    return {
      uid:    user.uid,
      email:  user.email,
      nome:   dados.nome   || user.email,
      perfil: dados.perfil || null,
      ativo:  dados.ativo !== false,
      senhaProvisoria: dados.senhaProvisoria === true
    };
  } catch (e) {
    console.error('[auth] Erro ao ler perfil:', e);
    return null;
  }
}

/**
 * Chama cb(usuario|null) quando o auth state estiver resolvido.
 * usuario = { uid, email, nome, perfil, ativo } ou null.
 */
export function onUsuarioPronto(cb) {
  if (_usuarioCache !== null) {
    cb(_usuarioCache.user);
    return;
  }
  _filaResolucao.push(cb);
}

onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    firebaseUser.getIdToken().then(t => localStorage.setItem('opus_fb_token', t));
  } else {
    localStorage.removeItem('opus_fb_token');
  }
  const usuario = await carregarPerfilUsuario(firebaseUser);
  _usuarioCache = { user: usuario };
  _filaResolucao.forEach(cb => { try { cb(usuario); } catch(e) { console.error(e); } });
  _filaResolucao = [];
});

export function getUsuarioAtual() {
  return _usuarioCache ? _usuarioCache.user : null;
}

/**
 * Atualiza o campo senhaProvisoria no cache local sem precisar
 * recarregar do banco. Chamado apos trocar a senha com sucesso.
 */
export function atualizarCacheSenhaProvisoria(valor) {
  if (_usuarioCache && _usuarioCache.user) {
    _usuarioCache.user.senhaProvisoria = valor;
  }
}

export async function sair() {
  await signOut(auth);
  window.location.href = '/login.html';
}

/**
 * Renderiza tela de acesso negado e impede continuacao.
 */
function renderAcessoNegado(motivo) {
  document.documentElement.style.visibility = 'visible';
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                font-family:-apple-system,Segoe UI,sans-serif;background:#0a1f6b;color:#fff;
                padding:24px;text-align:center;">
      <div style="background:#fff;color:#0a1f6b;padding:36px 40px;border-radius:14px;max-width:420px;
                  box-shadow:0 12px 40px rgba(0,0,0,.3);">
        <div style="font-size:42px;margin-bottom:6px;">&#128274;</div>
        <h2 style="margin:0 0 8px;font-size:18px;">Acesso negado</h2>
        <p style="font-size:13px;color:#555;margin:0 0 18px;line-height:1.5;">${motivo}</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button onclick="history.back()" style="background:#eee;color:#333;border:none;padding:9px 16px;
                  border-radius:8px;font-weight:600;cursor:pointer;">Voltar</button>
          <button onclick="window.AuthOpus.sair()" style="background:#0a1f6b;color:#fff;border:none;
                  padding:9px 16px;border-radius:8px;font-weight:600;cursor:pointer;">Sair</button>
        </div>
      </div>
    </div>`;
}

/**
 * Helper para uso em paginas: passa lista de perfis permitidos.
 * Se o usuario logado nao tiver perfil na lista, bloqueia.
 */
export function exigirPerfis(perfisOk) {
  onUsuarioPronto((usuario) => {
    if (!usuario) {
      sessionStorage.setItem('opus_destino_pos_login', window.location.pathname);
      window.location.href = '/login.html';
      return;
    }
    if (!usuario.ativo) {
      renderAcessoNegado('Sua conta esta desativada. Procure o administrador.');
      return;
    }
    // Senha provisoria? Forca troca antes de liberar qualquer outra pagina.
    if (usuario.senhaProvisoria) {
      location.href = '/trocar-senha.html';
      return;
    }
    if (!perfisOk.includes(usuario.perfil)) {
      renderAcessoNegado(`Seu perfil (<b>${usuario.perfil || 'sem perfil'}</b>) nao tem permissao para acessar esta pagina.`);
      return;
    }
    document.documentElement.style.visibility = 'visible';
  });
}

// Disponibiliza em window para uso em onclick inline (ex: botao Sair)
window.AuthOpus = { sair, getUsuarioAtual, onUsuarioPronto };
