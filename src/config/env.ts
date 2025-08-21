import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Exportar configurações
export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  
  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  
  // UazAPI
  uazapi: {
    baseUrl: process.env.UAZAPI_BASE_URL,
    adminToken: process.env.UAZAPI_ADMIN_TOKEN,
  },
  
  // Webhook
  webhook: {
    token: process.env.WEBHOOK_TOKEN,
    url: process.env.WEBHOOK_URL,
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },
  
  // Segurança
  security: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    trustProxy: process.env.TRUST_PROXY === 'true',
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
  },
};

// Validar configurações obrigatórias
if (!config.supabase.url) {
  throw new Error('SUPABASE_URL é obrigatória');
}

if (!config.supabase.anonKey) {
  throw new Error('SUPABASE_ANON_KEY é obrigatória');
}

if (!config.openai.apiKey) {
  throw new Error('OPENAI_API_KEY é obrigatória');
}

console.log('✅ Configurações carregadas com sucesso');
console.log('📊 Supabase URL:', config.supabase.url);
console.log('🤖 OpenAI Model:', config.openai.model);
console.log('🌐 Environment:', config.nodeEnv);