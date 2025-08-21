import { createClient } from '@supabase/supabase-js'
import { config } from './env'

if (!config.supabase.url) {
  throw new Error('SUPABASE_URL deve ser configurada')
}

if (!config.supabase.anonKey) {
  throw new Error('SUPABASE_ANON_KEY deve ser configurada')
}

export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey
)

// Função para testar conexão
export const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('establishments')
      .select('id')
      .limit(1);
    
    if (error) {
      logger.error('Erro ao testar conexão Supabase:', error);
      return false;
    }
    
    logger.info('Conexão com Supabase estabelecida com sucesso');
    return true;
  } catch (error) {
    logger.error('Erro na conexão com Supabase:', error);
    return false;
  }
};

// Tipos para as tabelas principais
export interface Establishment {
  id: string;
  name: string;
  cnpj?: string;
  whatsapp?: string;
  email?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  instagram_url?: string;
  facebook_url?: string;
  tiktok_url?: string;
  website_url?: string;
  logo_url?: string;
  admin_name?: string;
  admin_email?: string;
  auth_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface UazapiConfiguration {
  id: string;
  establishment_id: string;
  uazapi_url: string;
  admin_token: string;
  instance_name: string;
  instance_token: string;
  whatsapp_number?: string;
  ai_enabled: boolean;
  ai_prompt?: string;
  auto_reply_enabled: boolean;
  webhook_url?: string;
  status: 'connected' | 'disconnected' | 'connecting';
  qr_code?: string;
  message_templates: {
    welcome?: string;
    followup?: string;
    reminder_1h?: string;
    confirmation?: string;
    reminder_24h?: string;
  };
  automation_settings: {
    welcome_enabled?: boolean;
    followup_enabled?: boolean;
    reminder_1h_enabled?: boolean;
    confirmation_enabled?: boolean;
    reminder_24h_enabled?: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface WhatsappMessage {
  id: string;
  conversation_id: string;
  message_id: string;
  sender_type: 'client' | 'bot' | 'human';
  message_content: string;
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document';
  metadata?: string;
  created_at: string;
  processed: boolean;
  client_phone: string;
  client_name?: string;
  establishment_id: string;
  is_from_client: boolean;
}

export interface AiPrompt {
  id: string;
  establishment_id: string;
  system_prompt?: string;
  greeting_prompt?: string;
  new_client_prompt?: string;
  scheduling_prompt?: string;
  farewell_prompt?: string;
  services_prompt?: string;
  prices_prompt?: string;
  reschedule_prompt?: string;
  cancel_prompt?: string;
  fallback_prompt?: string;
  inactivity_hours?: string;
  response_delay?: string;
  enable_services_info?: string;
  enable_scheduling?: string;
  enable_smart_responses?: string;
  enable_intent_detection?: string;
  enable_context_memory?: string;
  enable_proactive_suggestions?: string;
  enable_calendar_integration?: string;
  enable_sentiment_analysis?: string;
  created_at: string;
  updated_at: string;
}