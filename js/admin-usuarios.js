/**
 * admin-usuarios.js
 * ------------------------------------------------------------
 * Logica da tela usuarios.html.
 * Permite criar/editar/desativar usuarios SEM derrubar a sessao
 * do admin (usa um Firebase App secundario para criar contas).
 * ------------------------------------------------------------
 */
import { app, auth, db } from './firebase-init.js';
import { exigirPerfis, getUsuarioAtual } from './auth.js';
import { SENHA_PADRAO } from './permissoes.js';
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref, get, set, update, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Trava a pagina para admin e logistica
exigirPerfis(['admin', 'logistica']);

const PERFIS = ['admin', 'logistica', 'comercial', 'operacao'];
const PERFIL_LABEL = {
  admin: 'Admin', logistica: 'Logistica', comercial: 'Comercial', operacao: 'Operacao'
};
const PERFIL_COR = {
  admin: '#7c3aed', logistica: '#1e40af', comercial: '#15803d', operacao: '#ea580c'
};

// ── Render lista ─────────────────────────────────────────────
const usuariosRef = ref(db, 'usuarios');

function render(snap) {
  const lista = document.getElementById('lista-usuarios');
  const cont  = document.getElementById('contadores');
  if (!snap || !snap.exists()) {
    lista.innerHTML = '<div class="vazio">Nenhum usuario cadastrado ainda.</div>';
    cont.innerHTML = '';
    return;
  }
  const usuarios = Object.entries(snap.val()).map(([uid, u]) => ({ uid, ...u }));
  usuarios.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  // Contadores por perfil
  const contPorPerfil = {};
  PERFIS.forEach(p => contPorPerfil[p] = 0);
  usuarios.forEach(u => { if (u.ativo !== false && contPorPerfil[u.perfil] !== undefined) contPorPerfil[u.perfil]++; });
  cont.innerHTML = PERFIS.map(p => `
    <span class="contador" style="border-color:${PERFIL_COR[p]};color:${PERFIL_COR[p]}">
      <b>${contPorPerfil[p]}</b> ${PERFIL_LABEL[p]}
    </span>`).join('');

  lista.innerHTML = usuarios.map(u => {
    const cor = PERFIL_COR[u.perfil] || '#666';
    const inativo = u.ativo === false;
    const prov    = u.senhaProvisoria === true;
    return `
      <div class="card-usr ${inativo ? 'inativo' : ''}">
        <div class="avatar" style="background:${cor}">${(u.nome || '?').charAt(0).toUpperCase()}</div>
        <div class="info">
          <div class="nome">
            ${u.nome || '(sem nome)'}
            ${inativo ? '<span class="tag-inativo">INATIVO</span>' : ''}
            ${prov ? '<span class="tag-prov" title="Senha padrao, sera trocada no proximo login">&#128274; SENHA PROVISORIA</span>' : ''}
          </div>
          <div class="email">${u.email || '—'}</div>
        </div>
        <div class="badge" style="background:${cor}">${PERFIL_LABEL[u.perfil] || u.perfil || '—'}</div>
        <div class="acoes">
          <button onclick="window.editarUsuario('${u.uid}')" title="Editar nome/perfil">&#9998;</button>
          <button onclick="window.resetarSenha('${u.uid}', '${(u.nome || u.email || '').replace(/'/g,"\\'")}')" title="Resetar para senha padrao">&#128273;</button>
          <button onclick="window.toggleAtivo('${u.uid}', ${inativo})" title="${inativo ? 'Ativar' : 'Desativar'}">
            ${inativo ? '&#9989;' : '&#128683;'}
          </button>
        </div>
      </div>`;
  }).join('');
}

onValue(usuariosRef, render);

// ── Criar usuario novo ──────────────────────────────────────
async function criarUsuario(nome, email, perfil) {
  // App secundario para nao trocar a sessao do admin
  const secApp = initializeApp(app.options, 'criar-usuario-' + Date.now());
  try {
    const secAuth = getAuth(secApp);
    const cred = await createUserWithEmailAndPassword(secAuth, email, SENHA_PADRAO);
    const uid = cred.user.uid;

    await set(ref(db, 'usuarios/' + uid), {
      nome, email, perfil,
      ativo: true,
      senhaProvisoria: true,
      criado_em: Date.now(),
      criado_por: getUsuarioAtual()?.email || 'admin'
    });

    await secAuth.signOut();
    return { ok: true, uid };
  } catch (e) {
    return { ok: false, erro: e.code || e.message };
  } finally {
    try { await deleteApp(secApp); } catch (_) {}
  }
}

// ── Editar (nome + perfil) ──────────────────────────────────
async function editarUsuario(uid, dados) {
  await update(ref(db, 'usuarios/' + uid), dados);
}

async function setAtivo(uid, ativo) {
  await update(ref(db, 'usuarios/' + uid), { ativo });
}

// ── Wire form ────────────────────────────────────────────────
const form = document.getElementById('form-novo');
const msg  = document.getElementById('form-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'msg'; msg.textContent = '';
  const nome   = form.nome.value.trim();
  const email  = form.email.value.trim();
  const perfil = form.perfil.value;
  if (!nome || !email || !perfil) {
    msg.className = 'msg erro'; msg.textContent = 'Preencha todos os campos.';
    return;
  }
  form.btn.disabled = true; form.btn.textContent = 'Criando...';
  const r = await criarUsuario(nome, email, perfil);
  form.btn.disabled = false; form.btn.textContent = 'Criar usuario';
  if (r.ok) {
    msg.className = 'msg ok';
    msg.innerHTML = `Usuario criado! Senha inicial: <b>${SENHA_PADRAO}</b> (sera trocada no 1o login).`;
    form.reset();
  } else {
    msg.className = 'msg erro';
    msg.textContent = 'Erro: ' + (r.erro === 'auth/email-already-in-use' ? 'email ja cadastrado' : r.erro);
  }
});

// ── Modal de edicao ─────────────────────────────────────────
window.editarUsuario = async function(uid) {
  const snap = await get(ref(db, 'usuarios/' + uid));
  if (!snap.exists()) return alert('Usuario nao encontrado');
  const u = snap.val();
  const novoNome = prompt('Nome:', u.nome || '');
  if (novoNome === null) return;
  if (!novoNome.trim()) return alert('Nome nao pode ficar vazio.');
  const novoPerfil = prompt('Perfil (admin/logistica/comercial/operacao):', u.perfil || '');
  if (novoPerfil === null) return;
  if (!PERFIS.includes(novoPerfil)) return alert('Perfil invalido');
  try {
    await editarUsuario(uid, { nome: novoNome.trim(), perfil: novoPerfil });
  } catch (e) {
    alert('Erro ao salvar: ' + (e.code || e.message));
  }
};

window.toggleAtivo = async function(uid, estaInativo) {
  const acao = estaInativo ? 'Ativar' : 'Desativar';
  if (!confirm(acao + ' este usuario?')) return;
  try {
    await setAtivo(uid, estaInativo);
  } catch (e) {
    alert('Erro ao ' + acao.toLowerCase() + ': ' + (e.code || e.message));
  }
};

window.resetarSenha = async function(uid, nome) {
  const snap = await get(ref(db, 'usuarios/' + uid));
  if (!snap.exists()) return alert('Usuario nao encontrado');
  const u = snap.val();
  if (!confirm(`Enviar email de redefinicao de senha para ${nome}?\n\nO usuario recebera um link em ${u.email} para criar nova senha.\nEle tambem sera obrigado a trocar a senha no proximo login.`)) return;
  try {
    await sendPasswordResetEmail(auth, u.email);
    await update(ref(db, 'usuarios/' + uid), { senhaProvisoria: true });
    alert('Email enviado para ' + u.email);
  } catch (e) {
    alert('Erro ao enviar email: ' + (e.code || e.message));
  }
};
