/**
 * trocar-senha.js
 * ------------------------------------------------------------
 * Tela obrigatoria para usuarios com senhaProvisoria=true.
 * Reautentica com a senha atual e troca para a nova senha.
 * Apos sucesso, marca senhaProvisoria=false e redireciona.
 * ------------------------------------------------------------
 */
import { auth, db } from './firebase-init.js';
import { onUsuarioPronto, getUsuarioAtual } from './auth.js';
import { SENHA_NOVA_REGEX, SENHA_NOVA_DESCRICAO } from './permissoes.js';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Apenas verifica se esta logado — NAO chama exigirPerfis para evitar loop
onUsuarioPronto((usuario) => {
  if (!usuario) {
    window.location.href = '/login.html';
    return;
  }
  document.documentElement.style.visibility = 'visible';
});

const form  = document.getElementById('form-trocar');
const msg   = document.getElementById('msg');
const dica  = document.getElementById('dica-senha');
const nome  = document.getElementById('nome-usr');
const email = document.getElementById('email-usr');

dica.textContent = SENHA_NOVA_DESCRICAO;

// Preenche identificacao quando perfil carregar
const interval = setInterval(() => {
  const u = getUsuarioAtual();
  if (u) {
    nome.textContent  = u.nome  || '';
    email.textContent = u.email || '';
    clearInterval(interval);
  }
}, 100);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'msg'; msg.textContent = '';

  const senhaAtual = form.atual.value;
  const senhaNova  = form.nova.value;
  const senhaConf  = form.conf.value;

  if (senhaNova !== senhaConf) {
    msg.className = 'msg erro';
    msg.textContent = 'A nova senha e a confirmacao nao coincidem.';
    return;
  }
  if (!SENHA_NOVA_REGEX.test(senhaNova)) {
    msg.className = 'msg erro';
    msg.textContent = SENHA_NOVA_DESCRICAO;
    return;
  }
  if (senhaNova === senhaAtual) {
    msg.className = 'msg erro';
    msg.textContent = 'A nova senha precisa ser diferente da atual.';
    return;
  }

  form.btn.disabled = true; form.btn.textContent = 'Trocando...';

  try {
    const user = auth.currentUser;
    if (!user) throw new Error('Sessao expirada. Faca login novamente.');
    const cred = EmailAuthProvider.credential(user.email, senhaAtual);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, senhaNova);

    await update(
      ref(db, 'usuarios/' + user.uid),
      {
        senhaProvisoria: false,
        ultimaTrocaSenha: Date.now()
      }
    );

    msg.className = 'msg ok';
    msg.textContent = 'Senha trocada com sucesso! Redirecionando...';

    setTimeout(() => {
      const destino = sessionStorage.getItem('opus_destino_pos_login') || '/index.html';
      sessionStorage.removeItem('opus_destino_pos_login');
      window.location.href = destino;
    }, 1200);
  } catch (e) {
    form.btn.disabled = false; form.btn.textContent = 'Trocar senha';
    msg.className = 'msg erro';
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
      msg.textContent = 'Senha atual incorreta.';
    } else if (e.code === 'auth/weak-password') {
      msg.textContent = 'Senha muito fraca. ' + SENHA_NOVA_DESCRICAO;
    } else {
      msg.textContent = 'Erro: ' + (e.code || e.message);
    }
  }
});
