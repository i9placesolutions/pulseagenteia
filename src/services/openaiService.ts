import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { ConversationContext } from '../types/schemas';

interface OpenAIConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  message: string;
  tokensUsed: number;
  model: string;
}

class OpenAIService {
  private client: OpenAI;
  private config: OpenAIConfig;

  constructor() {
    this.config = {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
    };

    if (!this.config.apiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    this.client = new OpenAI({
      apiKey: this.config.apiKey
    });
  }

  /**
   * Gera uma resposta usando OpenAI baseada no contexto da conversação
   */
  async generateResponse(
    userMessage: string,
    context?: ConversationContext,
    conversationHistory: ChatMessage[] = []
  ): Promise<OpenAIResponse> {
    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-10), // Últimas 10 mensagens para contexto
        { role: 'user', content: userMessage }
      ];

      logger.info('Enviando requisição para OpenAI', {
        model: this.config.model,
        messagesCount: messages.length,
        userMessage: userMessage.substring(0, 100)
      });

      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const response = completion.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.';
      const tokensUsed = completion.usage?.total_tokens || 0;

      logger.info('Resposta gerada pela OpenAI', {
        tokensUsed,
        responseLength: response.length
      });

      return {
        message: response,
        tokensUsed,
        model: this.config.model
      };
    } catch (error) {
      logger.error('Erro ao gerar resposta com OpenAI', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userMessage: userMessage.substring(0, 100)
      });
      
      throw new Error('Falha ao gerar resposta com IA');
    }
  }

  /**
   * Constrói o prompt do sistema baseado no contexto
   */
  private buildSystemPrompt(context?: ConversationContext): string {
    const basePrompt = `Você é um assistente virtual inteligente para WhatsApp. Suas características:

- Seja sempre educado, prestativo e profissional
- Responda de forma clara e objetiva
- Use linguagem natural e amigável
- Mantenha respostas concisas (máximo 300 caracteres quando possível)
- Se não souber algo, seja honesto sobre isso
- Evite usar emojis em excesso
- Foque em resolver o problema do usuário`;

    if (!context) {
      return basePrompt;
    }

    let contextualPrompt = basePrompt;

    if (context.client_name) {
      contextualPrompt += `\n\nVocê está conversando com: ${context.client_name}`;
    }

    if (context.intent) {
      contextualPrompt += `\n\nIntenção detectada: ${context.intent}`;
      
      switch (context.intent) {
        case 'scheduling':
          contextualPrompt += `\n- Ajude com agendamentos e consultas de horários\n- Pergunte detalhes necessários (data, horário, tipo de serviço)`;
          break;
        case 'support':
          contextualPrompt += `\n- Foque em resolver problemas e dúvidas\n- Seja paciente e detalhado nas explicações`;
          break;
        case 'information':
          contextualPrompt += `\n- Forneça informações precisas e úteis\n- Se não tiver a informação, sugira como obtê-la`;
          break;
        case 'complaint':
          contextualPrompt += `\n- Seja empático e compreensivo\n- Foque em resolver o problema apresentado`;
          break;
        case 'sales':
          contextualPrompt += `\n- Seja consultivo, não insistente\n- Apresente benefícios de forma natural`;
          break;
      }
    }

    if (context.context_data) {
      const metadata = context.context_data;
      
      if (metadata.lastInteraction) {
        contextualPrompt += `\n\nÚltima interação: ${new Date(metadata.lastInteraction).toLocaleDateString('pt-BR')}`;
      }
      
      if (metadata.preferences) {
        contextualPrompt += `\n\nPreferências do cliente: ${JSON.stringify(metadata.preferences)}`;
      }
    }

    return contextualPrompt;
  }

  /**
   * Analisa o sentimento de uma mensagem
   */
  async analyzeSentiment(message: string): Promise<'positive' | 'negative' | 'neutral'> {
    try {
      const prompt = `Analise o sentimento da seguinte mensagem e responda apenas com: positive, negative ou neutral\n\nMensagem: "${message}"`;
      
      const completion = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0.1
      });

      const sentiment = completion.choices[0]?.message?.content?.toLowerCase().trim();
      
      if (sentiment === 'positive' || sentiment === 'negative' || sentiment === 'neutral') {
        return sentiment;
      }
      
      return 'neutral';
    } catch (error) {
      logger.error('Erro ao analisar sentimento', { error, message });
      return 'neutral';
    }
  }

  /**
   * Extrai informações estruturadas de uma mensagem
   */
  async extractInformation(message: string, extractionType: 'contact' | 'datetime' | 'product'): Promise<any> {
    try {
      let prompt = '';
      
      switch (extractionType) {
        case 'contact':
          prompt = `Extraia informações de contato da mensagem abaixo. Retorne um JSON com os campos encontrados (nome, telefone, email). Se não encontrar, retorne null para o campo.\n\nMensagem: "${message}"`;
          break;
        case 'datetime':
          prompt = `Extraia data e hora da mensagem abaixo. Retorne um JSON com os campos: data (YYYY-MM-DD), hora (HH:MM), texto_original. Se não encontrar, retorne null.\n\nMensagem: "${message}"`;
          break;
        case 'product':
          prompt = `Extraia informações de produto/serviço da mensagem abaixo. Retorne um JSON com: nome, quantidade, observacoes. Se não encontrar, retorne null.\n\nMensagem: "${message}"`;
          break;
      }

      const completion = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1
      });

      const response = completion.choices[0]?.message?.content;
      
      if (response) {
        try {
          return JSON.parse(response);
        } catch {
          return null;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Erro ao extrair informações', { error, message, extractionType });
      return null;
    }
  }

  /**
   * Gera um resumo da conversação
   */
  async generateConversationSummary(messages: ChatMessage[]): Promise<string> {
    try {
      const conversationText = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const prompt = `Resuma a seguinte conversação em até 200 caracteres, destacando os pontos principais:\n\n${conversationText}`;
      
      const completion = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.3
      });

      return completion.choices[0]?.message?.content || 'Resumo não disponível';
    } catch (error) {
      logger.error('Erro ao gerar resumo da conversação', { error });
      return 'Erro ao gerar resumo';
    }
  }

  /**
   * Verifica se a API está funcionando
   */
  async healthCheck(): Promise<boolean> {
    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      });
      
      return !!completion.choices[0]?.message?.content;
    } catch (error) {
      logger.error('Health check OpenAI falhou', { error });
      return false;
    }
  }
}

export const openaiService = new OpenAIService();
export { OpenAIService, ChatMessage, OpenAIResponse };