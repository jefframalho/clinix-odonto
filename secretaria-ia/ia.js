// A "cabeça" da secretária: conversa com o Gemini e deixa ele usar 3 ferramentas
// (ver horários livres, pedir agendamento e chamar a recepção).
const agenda = require("./agenda");

const MODELO = process.env.GEMINI_MODEL || "gemini-2.5-flash";
let ai = null;

const ferramentas = [{
  functionDeclarations: [
    {
      name: "ver_horarios_livres",
      description: "Mostra os próximos dias e horários livres na agenda da clínica.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          a_partir_de: { type: "string", description: "Data inicial no formato AAAA-MM-DD. Deixe vazio para começar hoje." },
          dentista_id: { type: "string", description: "Id do dentista, se o paciente tiver preferência." },
        },
      },
    },
    {
      name: "pedir_agendamento",
      description: "Envia o pedido de consulta para a clínica confirmar. Só use depois que o paciente escolheu data e hora livres e informou o nome completo.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome completo do paciente (nome e sobrenome)." },
          data: { type: "string", description: "AAAA-MM-DD" },
          hora: { type: "string", description: "HH:MM, exatamente como veio em ver_horarios_livres." },
          procedimento: { type: "string", description: "Motivo da consulta, de preferência um da lista da clínica." },
          dentista_id: { type: "string", description: "Id do dentista escolhido, ou vazio." },
          observacao: { type: "string", description: "Algo que o paciente contou (ex.: dor no dente de baixo). Curto." },
        },
        required: ["nome", "data", "hora"],
      },
    },
    {
      name: "chamar_atendente",
      description: "Avisa a recepção para falar com o paciente. Use em urgência (dor forte, sangramento, inchaço, trauma), reclamação, assunto que você não sabe responder ou quando o paciente pedir uma pessoa.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do paciente, se souber." },
          motivo: { type: "string", description: "Resumo curto do que o paciente precisa." },
        },
        required: ["motivo"],
      },
    },
  ],
}];

function instrucoes(g) {
  const hoje = new Date();
  const hojeTxt = agenda.br(agenda.iso(hoje)) + "/" + hoje.getFullYear();
  const turnos = [1, 2, 3, 4, 5, 6, 0]
    .map(w => (g.dias || {})[w] ? `${agenda.DIAS[w]}: ${g.dias[w]}` : null).filter(Boolean).join("; ");
  const profs = (g.profs || []).map(p => `${p.nome} (id: ${p.id})`).join(", ");
  return `Você é a secretária virtual da ${g.clinica}, uma clínica odontológica${g.cidade ? " em " + g.cidade : ""}. Você atende pacientes pelo WhatsApp.
Hoje é ${hojeTxt}, ${hoje.toTimeString().slice(0, 5)}.

COMO FALAR
- Português do Brasil, simpático e direto, como uma boa recepcionista. Mensagens curtas (no máximo 4 linhas), sem markdown. Pode usar 1 emoji de vez em quando.
- Na primeira resposta, diga que é a assistente virtual da clínica.
- Faça uma pergunta por vez.

O QUE VOCÊ FAZ
- Responde dúvidas usando SOMENTE as informações da clínica abaixo. Se a resposta não estiver lá, diga que vai pedir para a recepção responder e use chamar_atendente. Nunca invente preço, convênio, endereço ou procedimento.
- Marca consultas: pergunte o motivo, use ver_horarios_livres, ofereça poucas opções (2 ou 3 horários), confirme data e hora, peça o nome completo e então use pedir_agendamento.
- Depois do pedido, explique que a clínica vai confirmar o horário pelo WhatsApp. Não diga que já está confirmado.
- Para remarcar ou cancelar uma consulta já marcada, use chamar_atendente.

LIMITES (MUITO IMPORTANTE)
- Você não é dentista. Nunca dê diagnóstico, nunca indique remédio, dose ou tratamento caseiro.
- Dor forte, sangramento que não para, inchaço no rosto, febre, dente quebrado por pancada: diga que é importante ser visto logo, use chamar_atendente${g.telefone ? " e passe o telefone da clínica: " + g.telefone : ""}. Se houver falta de ar ou inchaço que atrapalha engolir, oriente procurar o pronto-socorro (SAMU 192).
- Não peça CPF, endereço, dados de saúde ou documentos. Para agendar, basta o nome completo.
- Não fale de outros pacientes nem de assuntos fora da clínica.

DADOS DA CLÍNICA
- Atendimento: ${turnos || "consulte a recepção"}. Cada horário dura ${+g.dur || 30} minutos.
- Procedimentos que dá para marcar por aqui: ${(g.procs || []).join(", ") || "avaliação"}.
${profs ? "- Dentistas: " + profs + ".\n" : ""}${g.telefone ? "- Telefone da recepção: " + g.telefone + ".\n" : ""}
INFORMAÇÕES DA CLÍNICA (escritas pela própria clínica)
${(g.info || "").trim() || "(a clínica ainda não escreveu informações; para qualquer dúvida, chame a recepção)"}`;
}

async function executar(nome, args, ctx) {
  const g = ctx.agenda;
  if (nome === "ver_horarios_livres") {
    const dias = agenda.horariosLivres(g, { aPartirDe: args.a_partir_de, dentista: args.dentista_id });
    if (!dias.length) return { resultado: "Sem horários livres nesse período." + (g.telefone ? " Telefone da recepção: " + g.telefone : "") };
    return { dias: dias.map(d => ({ data: d.data, dia: d.dia, horas: d.horas.slice(0, 12) })) };
  }
  if (nome === "pedir_agendamento") {
    const nomeP = String(args.nome || "").trim().replace(/\s+/g, " ");
    if (nomeP.split(" ").length < 2) return { erro: "Peça o nome completo (nome e sobrenome)." };
    if ((ctx.conv.pedidos || 0) >= 2) return { erro: "Este paciente já fez 2 pedidos nesta conversa. Chame a recepção se precisar de mais." };
    const prof = (g.profs || []).some(p => p.id === args.dentista_id) ? args.dentista_id : "";
    if (!agenda.horarioEstaLivre(g, args.data, args.hora, prof)) return { erro: "Esse horário não está livre. Consulte ver_horarios_livres de novo." };
    await agenda.criarPedido(ctx.token, {
      nome: nomeP.slice(0, 90),
      fone: ctx.fone.slice(0, 20),
      data: args.data,
      hora: args.hora,
      proc: String(args.procedimento || (g.procs || [])[0] || "Consulta").slice(0, 80),
      prof,
      obs: ("Pela secretária IA" + (args.observacao ? ": " + args.observacao : "")).slice(0, 200),
      criado: new Date().toISOString(),
    });
    ctx.conv.pedidos = (ctx.conv.pedidos || 0) + 1;
    return { ok: true, aviso: "Pedido enviado. A clínica confirma pelo WhatsApp." };
  }
  if (nome === "chamar_atendente") {
    if (ctx.conv.chamouAtendente) return { ok: true, aviso: "A recepção já foi avisada." };
    await agenda.criarPedido(ctx.token, {
      nome: String(args.nome || ctx.nomePerfil || "Paciente do WhatsApp").slice(0, 90),
      fone: ctx.fone.slice(0, 20),
      data: "", hora: "", proc: "Falar com a recepção", prof: "",
      obs: String(args.motivo || "").slice(0, 200),
      criado: new Date().toISOString(),
    });
    ctx.conv.chamouAtendente = true;
    return { ok: true, aviso: "Recepção avisada. Ela vai chamar o paciente pelo WhatsApp da clínica." };
  }
  return { erro: "Ferramenta desconhecida" };
}

async function geminiGerar(contents, systemInstruction) {
  if (!ai) { const { GoogleGenAI } = await import("@google/genai"); ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); }
  const r = await ai.models.generateContent({
    model: MODELO,
    contents,
    config: { systemInstruction, tools: ferramentas, temperature: 0.3 },
  });
  return {
    content: (r.candidates && r.candidates[0] && r.candidates[0].content) || { role: "model", parts: [{ text: r.text || "" }] },
    calls: r.functionCalls || [],
    text: r.text || "",
  };
}

// Mantém só as últimas mensagens, sempre começando por uma mensagem de texto do paciente.
function aparar(hist, max = 30) {
  if (hist.length <= max) return;
  let i = hist.length - max;
  while (i < hist.length && !(hist[i].role === "user" && hist[i].parts.some(p => p.text))) i++;
  hist.splice(0, i);
}

// conv: { hist: [] }   ctx: { agenda, token, fone, nomePerfil, conv }
async function responder(conv, textoPaciente, ctx, gerar = geminiGerar) {
  conv.hist.push({ role: "user", parts: [{ text: textoPaciente.slice(0, 1500) }] });
  aparar(conv.hist);
  const sistema = instrucoes(ctx.agenda);
  for (let volta = 0; volta < 5; volta++) {
    const r = await gerar(conv.hist, sistema);
    conv.hist.push(r.content);
    if (!r.calls.length) return r.text.trim() || "Desculpe, não entendi. Pode repetir?";
    const partes = [];
    for (const c of r.calls) {
      let resp;
      try { resp = await executar(c.name, c.args || {}, ctx); }
      catch (e) { console.error("ferramenta", c.name, e); resp = { erro: "Falha ao acessar a agenda. Peça para o paciente tentar de novo em instantes." }; }
      partes.push({ functionResponse: { id: c.id, name: c.name, response: resp } });
    }
    conv.hist.push({ role: "user", parts: partes });
  }
  return "Desculpe, tive um problema aqui. Pode repetir, por favor?";
}

module.exports = { responder, instrucoes, executar };
