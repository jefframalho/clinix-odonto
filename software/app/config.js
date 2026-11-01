/* ==========================================================
   CONFIGURAÇÃO DO CLINIX ODONTO
   Edite este arquivo com os seus dados. Veja COMO-CONFIGURAR.txt
   Enquanto "firebase" estiver vazio, o sistema roda em
   MODO DEMONSTRAÇÃO (dados só no aparelho).
   ========================================================== */
window.CLINIX_CONFIG = {
  produto: "Clinix Odonto",
  valor: 99,              // mensalidade padrão de cada clínica (R$)
  diasTeste: 14,          // dias grátis para clínica nova (máximo 14)
  carencia: 5,            // dias de atraso antes de bloquear

  // E-mails que entram como ADMINISTRADOR (painel de cobrança)
  // Use o mesmo e-mail nas regras do Firestore (firestore.rules)
  admins: ["jeffersonramalhopb@gmail.com"],

  vendedor: "Jefferson Ramalho",
  suporteWhatsApp: "(83) 9 2141-8988",

  // Sua chave Pix para receber as mensalidades
  pix: {
    chave: "11212692497", // CPF, celular (+5583...), e-mail ou chave aleatória
    nome: "JEFFERSON RAMALHO",
    cidade: "MAURITI"
  },

  // Cole aqui o firebaseConfig do seu projeto (passo 5 do guia)
  firebase: {
    apiKey: "AIzaSyDhBKEhZEeNVRy6i1d4HZKq9Ga1lnvraOU",
    authDomain: "clinix-odonto.firebaseapp.com",
    projectId: "clinix-odonto",
    storageBucket: "clinix-odonto.firebasestorage.app",
    messagingSenderId: "39462526484",
    appId: "1:39462526484:web:14985ee5772c74f33e5101"
  }
};
