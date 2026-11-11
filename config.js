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

  // Dados que aparecem no contrato de assinatura enviado às clínicas (preencha se quiser)
  contrato: {
    cpfCnpj: "",   // ex.: "000.000.000-00" ou CNPJ
    endereco: ""   // ex.: "Rua X, 123, Centro, Mauriti - CE"
  },
  suporteWhatsApp: "(83) 9 2141-8988",
  emailSuporte: "jeffersonramalhopb@gmail.com",  // aparece nos Termos e na Política de Privacidade

  // Sua chave Pix para receber as mensalidades
  pix: {
    chave: "11212692497", // CPF, celular (+5583...), e-mail ou chave aleatória
    nome: "JEFFERSON RAMALHO",
    cidade: "MAURITI"
  },

  // Endereço do site publicado (usado nos links de assinatura)
  appUrl: "https://app.clinixodonto.com.br/",

  // Endereço usado no link da "Página da clínica" (bio do Instagram)
  paginaUrl: "https://app.clinixodonto.com.br/",

  // Servidor da Secretária IA / consulta SPC-Serasa (Render). Ex.: "https://clinix-secretaria.onrender.com"
  servidor: "https://clinix-secretaria.onrender.com",

  // Consulta SPC/Serasa: preço de cada crédito (R$) e pacotes que a clínica pode comprar
  consulta: {
    preco: 9.9,                 // valor de 1 crédito (R$)
    pacotes: [5, 10, 25],
    // fontes que a clínica pode escolher e quantos créditos cada uma gasta
    // (use os mesmos números de CREDITOS_BOAVISTA e CREDITOS_SERASA no Render)
    fontes: {
      boavista: { nome: "Boa Vista (SCPC)", creditos: 1 },
      serasa:   { nome: "Serasa", creditos: 3 }
    }
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
