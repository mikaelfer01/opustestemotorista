/**
 * firebase-init.js
 * ------------------------------------------------------------
 * Inicializa Firebase UMA vez e exporta instancias compartilhadas.
 * Todos os outros modulos devem importar daqui (nao redeclarar config).
 * ------------------------------------------------------------
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getStorage }    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAch7_Sn4jq1cuTGV1ijGsDGUXC9dyilOs",
  authDomain: "mfparis-bd054.firebaseapp.com",
  databaseURL: "https://mfparis-bd054-default-rtdb.firebaseio.com",
  projectId: "mfparis-bd054",
  storageBucket: "mfparis-bd054.firebasestorage.app",
  messagingSenderId: "106506342977",
  appId: "1:106506342977:web:cda4d2d0f3296c4284ecc0"
};

export const app     = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getDatabase(app);
export const storage = getStorage(app);
