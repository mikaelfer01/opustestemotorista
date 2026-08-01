/**
 * checar-login.js
 * ------------------------------------------------------------
 * Versão simples: só verifica se a pessoa está logada.
 * Se não estiver, manda para login.html.
 * (Permissão por aba e registro de log vêm em uma etapa futura.)
 * ------------------------------------------------------------
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
 
const firebaseConfig = {
  apiKey: "AIzaSyAch7_Sn4jq1cuTGV1ijGsDGUXC9dyilOs",
  authDomain: "mfparis-bd054.firebaseapp.com",
  databaseURL: "https://mfparis-bd054-default-rtdb.firebaseio.com",
  projectId: "mfparis-bd054",
  storageBucket: "mfparis-bd054.firebasestorage.app",
  messagingSenderId: "106506342977",
  appId: "1:106506342977:web:cda4d2d0f3296c4284ecc0"
};
 
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
 
document.documentElement.style.visibility = "hidden";
 
onAuthStateChanged(auth, (usuario) => {
  if (!usuario) {
    sessionStorage.setItem("opus_destino_pos_login", window.location.pathname);
    window.location.href = "/login.html";
  } else {
    document.documentElement.style.visibility = "visible";
  }
});
