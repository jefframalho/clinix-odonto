// Converse com a secretária pelo terminal, sem precisar do WhatsApp.
// Uso: npm run testar -- CODIGO_DA_AGENDA
// Atenção: pedidos feitos aqui aparecem de verdade na Agenda da clínica.
process.env.TZ = process.env.TZ || "America/Fortaleza";
const readline = require("readline");
const agenda = require("./agenda");
const { responder } = require("./ia");

const token = process.argv[2];
if (!token) { console.log("Informe o código da agenda: npm run testar -- CODIGO"); process.exit(1); }

(async () => {
  const g = await agenda.lerAgenda(token);
  if (!g) { console.log("Agenda não encontrada. Confira o código e se o agendamento online está ligado."); process.exit(1); }
  console.log(`\nClínica: ${g.clinica} · agendamento ${g.ativo ? "ligado" : "DESLIGADO"} · secretária ${g.ia ? "ligada" : "DESLIGADA"}`);
  console.log("Escreva como se fosse o paciente. Para sair: sair\n");
  const conv = { hist: [] };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const perguntar = () => rl.question("Paciente: ", async t => {
    if (!t || t.trim().toLowerCase() === "sair") return rl.close();
    try {
      const r = await responder(conv, t, { agenda: await agenda.lerAgenda(token), token, fone: "5500000000000", nomePerfil: "Teste", conv });
      console.log("\nSecretária: " + r + "\n");
    } catch (e) { console.error("Erro:", e.message); }
    perguntar();
  });
  perguntar();
})();
