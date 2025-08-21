import { z } from 'zod';

// Schema para webhook da UazAPI
export const UazapiWebhookSchema = z.object({
  instanceName: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
      id: z.string()
    }),
    messageTimestamp: z.number(),
    pushName: z.string().optional(),
    message: z.object({
      conversation: z.string().optional(),
      extendedTextMessage: z.object({
        text: z.string()
      }).optional(),
      imageMessage: z.object({
        caption: z.string().optional(),
        url: z.string().optional(),
        mimetype: z.string().optional()
      }).optional(),
      audioMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional()
      }).optional(),
      videoMessage: z.object({
        caption: z.string().optional(),
        url: z.string().optional(),
        mimetype: z.string().optional()
      }).optional(),
      documentMessage: z.object({
        caption: z.string().optional(),
        url: z.string().optional(),
        mimetype: z.string().optional(),
        fileName: z.string().optional()
      }).optional()
    })
  })
});

// Schema para mensagem processada
export const ProcessedMessageSchema = z.object({
  messageId: z.string(),
  instanceName: z.string(),
  clientPhone: z.string(),
  clientName: z.string().optional(),
  messageContent: z.string(),
  messageType: z.enum(['text', 'image', 'audio', 'video', 'document']),
  timestamp: z.number(),
  isFromClient: z.boolean(),
  metadata: z.record(z.any()).optional()
});

// Schema para configuração da UazAPI
export const UazapiConfigSchema = z.object({
  id: z.string().uuid(),
  establishment_id: z.string().uuid(),
  uazapi_url: z.string().url(),
  admin_token: z.string(),
  instance_name: z.string(),
  instance_token: z.string(),
  whatsapp_number: z.string().optional(),
  ai_enabled: z.boolean(),
  ai_prompt: z.string().optional(),
  auto_reply_enabled: z.boolean(),
  webhook_url: z.string().url().optional(),
  status: z.enum(['connected', 'disconnected', 'connecting']),
  qr_code: z.string().optional(),
  message_templates: z.object({
    welcome: z.string().optional(),
    followup: z.string().optional(),
    reminder_1h: z.string().optional(),
    confirmation: z.string().optional(),
    reminder_24h: z.string().optional()
  }),
  automation_settings: z.object({
    welcome_enabled: z.boolean().optional(),
    followup_enabled: z.boolean().optional(),
    reminder_1h_enabled: z.boolean().optional(),
    confirmation_enabled: z.boolean().optional(),
    reminder_24h_enabled: z.boolean().optional()
  })
});

// Schema para prompt de IA
export const AiPromptSchema = z.object({
  id: z.string().uuid(),
  establishment_id: z.string().uuid(),
  system_prompt: z.string().optional(),
  greeting_prompt: z.string().optional(),
  new_client_prompt: z.string().optional(),
  scheduling_prompt: z.string().optional(),
  farewell_prompt: z.string().optional(),
  services_prompt: z.string().optional(),
  prices_prompt: z.string().optional(),
  reschedule_prompt: z.string().optional(),
  cancel_prompt: z.string().optional(),
  fallback_prompt: z.string().optional(),
  inactivity_hours: z.string().optional(),
  response_delay: z.string().optional(),
  enable_services_info: z.string().optional(),
  enable_scheduling: z.string().optional(),
  enable_smart_responses: z.string().optional(),
  enable_intent_detection: z.string().optional(),
  enable_context_memory: z.string().optional(),
  enable_proactive_suggestions: z.string().optional(),
  enable_calendar_integration: z.string().optional(),
  enable_sentiment_analysis: z.string().optional()
});

// Schema para contexto de conversação
export const ConversationContextSchema = z.object({
  id: z.string().uuid(),
  establishment_id: z.string().uuid(),
  client_phone: z.string(),
  client_name: z.string().nullable().optional(),
  context_data: z.record(z.any()),
  last_interaction: z.string().datetime(),
  conversation_state: z.enum(['active', 'waiting', 'closed']),
  intent: z.string().optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional()
});

// Schema para agendamento
export const AppointmentSchema = z.object({
  id: z.string().uuid(),
  establishment_id: z.string().uuid(),
  client_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  service_id: z.string().uuid(),
  appointment_date: z.string().datetime(),
  duration: z.number(),
  status: z.enum(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  notes: z.string().optional(),
  total_price: z.number().optional(),
  created_via: z.enum(['web', 'whatsapp', 'phone', 'walk_in']).optional()
});

// Schema para resposta da IA
export const AIResponseSchema = z.object({
  content: z.string(),
  intent: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  suggested_actions: z.array(z.string()).optional(),
  requires_human: z.boolean().optional(),
  context_updates: z.record(z.any()).optional()
});

// Schema para envio de mensagem
export const SendMessageSchema = z.object({
  instanceName: z.string(),
  phone: z.string(),
  message: z.string(),
  messageType: z.enum(['text', 'image', 'audio', 'video', 'document']).default('text'),
  mediaUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  caption: z.string().optional()
});

// Tipos TypeScript derivados dos schemas
export type UazapiWebhook = z.infer<typeof UazapiWebhookSchema>;
export type ProcessedMessage = z.infer<typeof ProcessedMessageSchema>;
export type UazapiConfig = z.infer<typeof UazapiConfigSchema>;
export type AiPrompt = z.infer<typeof AiPromptSchema>;
export type ConversationContext = z.infer<typeof ConversationContextSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type AIResponse = z.infer<typeof AIResponseSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;