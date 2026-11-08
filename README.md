# Clinix Odonto

Sistema completo para clínicas odontológicas, vendido por assinatura mensal.

**Acesse:** https://app.clinixodonto.com.br/

## O que tem
- Login para várias clínicas, cada uma com seus próprios dados
- Agenda com confirmação pelo WhatsApp
- Ficha do paciente: anamnese, odontograma interativo, fotos de antes e depois, histórico
- Orçamento com parcelamento, financeiro, retornos e laboratório
- Contratos e termos com assinatura do paciente (na clínica ou por link no WhatsApp)
- Vários dentistas: agenda por profissional, comissões e assinatura própria
- Receitas (2 vias para antimicrobianos) e atestados
- Anamnese respondida pelo paciente no celular
- Agendamento online: o paciente escolhe o horário pelo link próprio da clínica (`?agendar=nome-da-clinica`), o horário fica reservado enquanto a clínica analisa (ninguém mais consegue pedi-lo) e a clínica aceita ou recusa. Na primeira vez o paciente faz um cadastro rápido (o que sente e problemas de saúde); nas próximas não precisa
- Secretária IA no WhatsApp: responde dúvidas, mostra horários livres e cria pedidos de agendamento
- Equipe (secretária) com acesso limitado
- LGPD: termos de uso, política de privacidade, cópia do prontuário, exportação de dados e registro de atividades
- Painel do administrador: clínicas, receita mensal, cobrança por Pix e bloqueio automático

## Tecnologias
HTML, CSS e JavaScript puro · Firebase Authentication · Cloud Firestore · PWA · Electron (Windows)

## Arquivos
| Arquivo | Para que serve |
|---|---|
| `index.html` | O sistema inteiro |
| `config.js` | Preço, dias de teste, chave Pix, administradores e Firebase |
| `firestore.rules` | Regras de segurança do banco (cole no Firebase) |
| `software/app` | Versão para Windows (Electron) |
| `secretaria-ia` | Secretária IA no WhatsApp (Node + Gemini). Veja `secretaria-ia/COMO-ATIVAR.txt` |
| `COMO-CONFIGURAR.txt` | Passo a passo de configuração |

Desenvolvido por **Jefferson Ramalho** · WhatsApp (83) 9 2141-8988
