import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Interface para contexto de conversação
export interface ConversationContext {
  id: string;
  establishment_id: string;
  client_phone: string;
  client_name?: string | null;
  context_data: Record<string, any>;
  last_interaction: string;
  conversation_state: 'active' | 'waiting' | 'closed';
  intent?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  created_at?: string;
  updated_at?: string;
}

// Função para buscar contexto de conversação existente
const getConversationContext = async (
  establishmentId: string,
  clientPhone: string
): Promise<ConversationContext | null> => {
  try {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .select('*')
      .eq('establishment_id', establishmentId)
      .eq('client_phone', clientPhone)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      logger.error('Erro ao buscar contexto de conversação:', error);
      return null;
    }

    if (!data) {
      // Criar novo contexto se não existir
      return await createConversationContext(establishmentId, clientPhone);
    }

    return data as ConversationContext;
  } catch (error) {
    logger.error('Erro ao buscar contexto de conversação:', error);
    return null;
  }
};

// Função para criar novo contexto de conversação
export const createConversationContext = async (
  establishmentId: string,
  clientPhone: string,
  clientName?: string
): Promise<ConversationContext | null> => {
  try {
    const newContext: Partial<ConversationContext> = {
      id: uuidv4(),
      establishment_id: establishmentId,
      client_phone: clientPhone,
      client_name: clientName || null,
      context_data: {
        messageCount: 0,
        firstInteraction: new Date().toISOString(),
        preferences: {},
        appointmentHistory: [],
        lastTopics: []
      },
      last_interaction: new Date().toISOString(),
      conversation_state: 'active',
      intent: 'greeting',
      sentiment: 'neutral'
    };

    const { data, error } = await supabase
      .from('conversation_contexts')
      .insert(newContext)
      .select()
      .single();

    if (error) {
      logger.error('Erro ao criar contexto de conversação:', error);
      return null;
    }

    logger.info('Novo contexto de conversação criado:', {
      contextId: data.id,
      establishmentId,
      clientPhone
    });

    return data as ConversationContext;
  } catch (error) {
    logger.error('Erro ao criar contexto de conversação:', error);
    return null;
  }
};

// Função para atualizar contexto de conversação
const updateConversationContext = async (
  establishmentId: string,
  clientPhone: string,
  updates: Partial<{
    client_name: string;
    intent: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    conversation_state: 'active' | 'waiting' | 'closed';
    lastMessage: string;
    lastResponse: string;
    [key: string]: any;
  }>
): Promise<boolean> => {
  try {
    // Buscar contexto atual
    const currentContext = await getConversationContext(establishmentId, clientPhone);
    if (!currentContext) {
      logger.error('Contexto não encontrado para atualização');
      return false;
    }

    // Preparar dados de atualização
    const contextData = { ...currentContext.context_data };
    
    // Incrementar contador de mensagens
    contextData.messageCount = (contextData.messageCount || 0) + 1;
    
    // Atualizar última interação
    contextData.lastInteraction = new Date().toISOString();
    
    // Adicionar última mensagem ao histórico
    if (updates.lastMessage) {
      contextData.lastTopics = contextData.lastTopics || [];
      contextData.lastTopics.push({
        message: updates.lastMessage,
        response: updates.lastResponse,
        timestamp: new Date().toISOString(),
        intent: updates.intent
      });
      
      // Manter apenas os últimos 10 tópicos
      if (contextData.lastTopics.length > 10) {
        contextData.lastTopics = contextData.lastTopics.slice(-10);
      }
    }
    
    // Adicionar outras atualizações ao contexto
    Object.keys(updates).forEach(key => {
      if (!['lastMessage', 'lastResponse', 'intent', 'sentiment', 'conversation_state', 'client_name'].includes(key)) {
        contextData[key] = updates[key];
      }
    });

    // Preparar objeto de atualização
    const updateData: any = {
      context_data: contextData,
      last_interaction: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Adicionar campos específicos se fornecidos
    if (updates.client_name) updateData.client_name = updates.client_name;
    if (updates.intent) updateData.intent = updates.intent;
    if (updates.sentiment) updateData.sentiment = updates.sentiment;
    if (updates.conversation_state) updateData.conversation_state = updates.conversation_state;

    const { error } = await supabase
      .from('conversation_contexts')
      .update(updateData)
      .eq('establishment_id', establishmentId)
      .eq('client_phone', clientPhone);

    if (error) {
      logger.error('Erro ao atualizar contexto de conversação:', error);
      return false;
    }

    logger.debug('Contexto de conversação atualizado:', {
      establishmentId,
      clientPhone,
      intent: updates.intent,
      messageCount: contextData.messageCount
    });

    return true;
  } catch (error) {
    logger.error('Erro ao atualizar contexto de conversação:', error);
    return false;
  }
};

// Função para buscar contextos ativos
const getActiveContexts = async (
  establishmentId: string,
  limit: number = 50
): Promise<ConversationContext[]> => {
  try {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .select('*')
      .eq('establishment_id', establishmentId)
      .eq('conversation_state', 'active')
      .order('last_interaction', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Erro ao buscar contextos ativos:', error);
      return [];
    }

    return data as ConversationContext[];
  } catch (error) {
    logger.error('Erro ao buscar contextos ativos:', error);
    return [];
  }
};

// Função para fechar contextos inativos
const closeInactiveContexts = async (
  establishmentId: string,
  inactivityHours: number = 24
): Promise<number> => {
  try {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - inactivityHours);

    const { data, error } = await supabase
      .from('conversation_contexts')
      .update({ 
        conversation_state: 'closed',
        updated_at: new Date().toISOString()
      })
      .eq('establishment_id', establishmentId)
      .eq('conversation_state', 'active')
      .lt('last_interaction', cutoffTime.toISOString())
      .select('id');

    if (error) {
      logger.error('Erro ao fechar contextos inativos:', error);
      return 0;
    }

    const closedCount = data?.length || 0;
    
    if (closedCount > 0) {
      logger.info('Contextos inativos fechados:', {
        establishmentId,
        count: closedCount,
        inactivityHours
      });
    }

    return closedCount;
  } catch (error) {
    logger.error('Erro ao fechar contextos inativos:', error);
    return 0;
  }
};

// Função para obter estatísticas de contexto
const getContextStats = async (
  establishmentId: string
): Promise<{
  total: number;
  active: number;
  waiting: number;
  closed: number;
  avgMessageCount: number;
}> => {
  try {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .select('conversation_state, context_data')
      .eq('establishment_id', establishmentId);

    if (error) {
      logger.error('Erro ao buscar estatísticas de contexto:', error);
      return {
        total: 0,
        active: 0,
        waiting: 0,
        closed: 0,
        avgMessageCount: 0
      };
    }

    const stats = {
      total: data.length,
      active: 0,
      waiting: 0,
      closed: 0,
      avgMessageCount: 0
    };

    let totalMessages = 0;

    data.forEach(context => {
      switch (context.conversation_state) {
        case 'active':
          stats.active++;
          break;
        case 'waiting':
          stats.waiting++;
          break;
        case 'closed':
          stats.closed++;
          break;
      }

      const messageCount = context.context_data?.messageCount || 0;
      totalMessages += messageCount;
    });

    stats.avgMessageCount = stats.total > 0 ? totalMessages / stats.total : 0;

    return stats;
  } catch (error) {
    logger.error('Erro ao buscar estatísticas de contexto:', error);
    return {
      total: 0,
      active: 0,
      waiting: 0,
      closed: 0,
      avgMessageCount: 0
    };
  }
};

// Aliases para compatibilidade
const getOrCreateContext = getConversationContext;
const updateContext = updateConversationContext;

export const contextService = {
  getOrCreateContext,
  updateContext,
  getActiveContexts,
  closeInactiveContexts,
  getContextStats
};

// Exportações já feitas acima