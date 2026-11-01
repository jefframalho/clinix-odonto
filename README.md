# Clinix Odonto

Sistema completo para clínicas odontológicas, vendido por assinatura mensal.

**Acesse:** https://jefframalho.github.io/clinix-odonto/

## O que tem
- Login para várias clínicas, cada uma com seus próprios dados
- Agenda com confirmação pelo WhatsApp
- Ficha do paciente: anamnese, odontograma interativo, fotos de antes e depois, histórico
- Orçamento com parcelamento, financeiro, retornos e laboratório
- Equipe (secretária) com acesso limitado
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
| `COMO-CONFIGURAR.txt` | Passo a passo de configuração |

Desenvolvido por **Jefferson Ramalho** · WhatsApp (83) 9 2141-8988
