import OpenAI from 'openai';
import { logger } from '@/utils/logger';

// Verificar se a API key está configurada
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  logger.error('OPENAI_API_KEY não está configurada');
  throw new Error('OPENAI_API_KEY é obrigatória');
}

// Criar cliente OpenAI
export const openai = new OpenAI({
  apiKey: apiKey,
  timeout: 30000, // 30 segundos
  maxRetries: 3
});

// Configurações padrão
export const OPENAI_CONFIG = {
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  maxTokens: 1000,
  temperature: 0.7,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0
};

// Função para testar a conexão com OpenAI
export const testOpenAIConnection = async (): Promise<boolean> => {
  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.model,
      messages: [
        {
          role: 'user',
          content: 'Teste de conexão. Responda apenas "OK".'
        }
      ],
      max_tokens: 10,
      temperature: 0
    });

    if (response.choices[0]?.message?.content) {
      logger.info('Conexão com OpenAI estabelecida com sucesso');
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Erro na conexão com OpenAI:', error);
    return false;
  }
};

// Interface para mensagens do chat
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

// Interface para resposta da IA
export interface AIResponse {
  content: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
  finishReason: string | null;
}

// Função para gerar resposta da IA
export const generateAIResponse = async (
  messages: ChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  }
): Promise<AIResponse> => {
  try {
    // Adicionar prompt do sistema se fornecido
    const chatMessages: ChatMessage[] = [];
    
    if (options?.systemPrompt) {
      chatMessages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }
    
    chatMessages.push(...messages);

    const response = await openai.chat.completions.create({
      model: options?.model || OPENAI_CONFIG.model,
      messages: chatMessages,
      max_tokens: options?.maxTokens || OPENAI_CONFIG.maxTokens,
      temperature: options?.temperature || OPENAI_CONFIG.temperature,
      top_p: OPENAI_CONFIG.topP,
      frequency_penalty: OPENAI_CONFIG.frequencyPenalty,
      presence_penalty: OPENAI_CONFIG.presencePenalty
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new Error('Resposta vazia da OpenAI');
    }

    return {
      content: choice.message.content,
      tokensUsed: {
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0
      },
      model: response.model,
      finishReason: choice.finish_reason
    };
  } catch (error) {
    logger.error('Erro ao gerar resposta da IA:', error);
    throw error;
  }
};