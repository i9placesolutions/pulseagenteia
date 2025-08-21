# Agente de WhatsApp com IA - Projeto Pulse

Sistema de agente inteligente para WhatsApp integrado com OpenAI, desenvolvido para salões de beleza e estabelecimentos similares.

## 🚀 Funcionalidades

- **Webhook Handler**: Recebe e processa mensagens da UazAPI
- **Integração OpenAI**: Respostas inteligentes usando GPT-4o-mini
- **Contexto de Conversação**: Memória de conversas por cliente
- **Detecção de Intenções**: Análise automática do que o cliente deseja
- **Multi-tenant**: Suporte a múltiplos estabelecimentos
- **Rate Limiting**: Proteção contra spam e abuso
- **Logs Estruturados**: Monitoramento completo do sistema

## 📋 Pré-requisitos

- Node.js 18+ 
- npm ou yarn
- Conta Supabase configurada
- Chave API OpenAI
- Instância UazAPI configurada

## 🛠️ Instalação

1. **Clone o repositório**
```bash
git clone <repository-url>
cd agenteia
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=sk-your_openai_key

# UazAPI
UAZAPI_BASE_URL=https://your-uazapi-instance.com
UAZAPI_ADMIN_TOKEN=your_admin_token

# Webhook
WEBHOOK_TOKEN=your_secure_webhook_token
```

4. **Execute o projeto**

**Desenvolvimento:**
```bash
npm run dev
```

**Produção:**
```bash
npm run build
npm start
```

## 🔧 Configuração

### Banco de Dados

O sistema utiliza as seguintes tabelas do Supabase:

- `establishments`: Dados dos estabelecimentos
- `uazapi_configurations`: Configurações da UazAPI por estabelecimento
- `whatsapp_messages`: Histórico de mensagens
- `ai_prompts`: Prompts personalizados por estabelecimento
- `conversation_contexts`: Contexto das conversações

### Webhook da UazAPI

Configure o webhook na sua instância UazAPI:

**URL:** `https://seu-dominio.com/webhook`
**Token:** Use o valor definido em `WEBHOOK_TOKEN`
**Método:** POST

### Prompts de IA

Personalize os prompts no banco de dados através da tabela `ai_prompts`:

- `system_prompt`: Prompt base do sistema
- `greeting_prompt`: Para saudações
- `scheduling_prompt`: Para agendamentos
- `services_prompt`: Para informações de serviços
- `prices_prompt`: Para consultas de preços

## 📡 API Endpoints

### Health Check
```
GET /health
GET /health/detailed
```

### Webhook
```
POST /webhook
GET /webhook/status
POST /webhook/test (apenas desenvolvimento)
```

## 🔍 Monitoramento

### Logs

Os logs são salvos em:
- `logs/error.log`: Apenas erros
- `logs/combined.log`: Todos os logs
- Console: Em desenvolvimento

### Health Check

Verifique a saúde do sistema:

```bash
curl http://localhost:3000/health
```

Resposta:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-20T10:30:00.000Z",
  "services": {
    "database": "connected",
    "openai": "configured"
  }
}
```

## 🚦 Fluxo de Funcionamento

1. **Recebimento**: Webhook recebe mensagem da UazAPI
2. **Validação**: Verifica token e estrutura da mensagem
3. **Processamento**: Extrai conteúdo e metadados
4. **Contexto**: Busca/cria contexto da conversação
5. **Intenção**: Detecta intenção da mensagem
6. **IA**: Gera resposta usando OpenAI
7. **Envio**: Envia resposta via UazAPI
8. **Armazenamento**: Salva mensagens e contexto

## 🔒 Segurança

- **Rate Limiting**: 100 requisições por 15 minutos por IP
- **Helmet**: Headers de segurança
- **CORS**: Configurado para domínios específicos
- **Token Validation**: Webhook protegido por token
- **Input Validation**: Zod schemas para validação

## 🧪 Testes

```bash
# Executar testes
npm test

# Testes com coverage
npm run test:coverage

# Testes em modo watch
npm run test:watch
```

## 📝 Scripts Disponíveis

- `npm run dev`: Desenvolvimento com hot reload
- `npm run build`: Build para produção
- `npm start`: Executar versão de produção
- `npm run lint`: Verificar código com ESLint
- `npm test`: Executar testes

## 🐛 Troubleshooting

### Erro de Conexão com Supabase
```
Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
Teste a conexão: GET /health
```

### Erro de OpenAI
```
Verifique OPENAI_API_KEY
Confirme se tem créditos na conta OpenAI
```

### Webhook não recebe mensagens
```
Verifique se a URL está acessível
Confirme o WEBHOOK_TOKEN
Verifique logs da UazAPI
```

## 📚 Estrutura do Projeto

```
src/
├── config/          # Configurações (Supabase, OpenAI)
├── middleware/      # Middlewares (auth, rate limit, errors)
├── routes/          # Rotas da API
├── services/        # Lógica de negócio
├── types/           # Schemas e tipos TypeScript
├── utils/           # Utilitários (logger, helpers)
└── index.ts         # Entrada da aplicação
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT.