import { generateAIResponse, ChatMessage } from '@/config/openai';
import { logger } from '@/utils/logger';
import { ConversationContext } from '@/services/contextService';

// Tipos de intenção suportados
export type IntentType = 
  | 'greeting'
  | 'scheduling'
  | 'reschedule'
  | 'cancel'
  | 'services_info'
  | 'prices_info'
  | 'availability'
  | 'confirmation'
  | 'complaint'
  | 'compliment'
  | 'farewell'
  | 'help'
  | 'other';

// Interface para resultado de análise de intenção
export interface IntentAnalysis {
  intent: IntentType;
  confidence: number;
  entities: Record<string, any>;
  sentiment: 'positive' | 'neutral' | 'negative';
  requiresHuman: boolean;
  suggestedActions: string[];
  contextUpdates: Record<string, any>;
}

// Palavras-chave para cada intenção
const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  greeting: [
    'oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'e aí',
    'tudo bem', 'como vai', 'alo', 'alô'
  ],
  scheduling: [
    'agendar', 'marcar', 'horário', 'consulta', 'agendamento', 'disponível',
    'livre', 'vaga', 'quando', 'que horas', 'que dia', 'próximo',
    'semana', 'mês', 'amanhã', 'hoje'
  ],
  reschedule: [
    'remarcar', 'mudar', 'alterar', 'trocar', 'transferir', 'adiar',
    'outro dia', 'outro horário', 'reagendar'
  ],
  cancel: [
    'cancelar', 'desmarcar', 'não vou', 'não posso', 'não conseguir',
    'imprevisto', 'emergência'
  ],
  services_info: [
    'serviços', 'procedimentos', 'tratamentos', 'o que fazem',
    'que tipo', 'especialidades', 'corte', 'escova', 'manicure',
    'pedicure', 'sobrancelha', 'depilação', 'massagem'
  ],
  prices_info: [
    'preço', 'valor', 'quanto custa', 'tabela', 'valores',
    'orçamento', 'barato', 'caro', 'promoção', 'desconto'
  ],
  availability: [
    'aberto', 'funcionando', 'horário de funcionamento', 'que horas abre',
    'que horas fecha', 'domingo', 'feriado', 'disponibilidade'
  ],
  confirmation: [
    'confirmar', 'confirmação', 'ok', 'certo', 'sim', 'perfeito',
    'combinado', 'fechado', 'beleza'
  ],
  complaint: [
    'reclamação', 'problema', 'ruim', 'péssimo', 'horrível',
    'insatisfeito', 'decepcionado', 'erro', 'demora', 'atraso'
  ],
  compliment: [
    'parabéns', 'excelente', 'ótimo', 'maravilhoso', 'perfeito',
    'adorei', 'amei', 'muito bom', 'recomendo', 'satisfeito'
  ],
  farewell: [
    'tchau', 'até logo', 'até mais', 'obrigado', 'obrigada',
    'valeu', 'falou', 'bye', 'até'
  ],
  help: [
    'ajuda', 'socorro', 'não entendi', 'como', 'dúvida',
    'informação', 'explicar', 'esclarecer'
  ],
  other: []
};

// Prompt para análise de intenção
const INTENT_ANALYSIS_PROMPT = `
Você é um especialista em análise de intenções para um sistema de atendimento de salão de beleza.

Analise a mensagem do cliente e retorne APENAS um JSON válido com a seguinte estrutura:
{
  "intent": "tipo_da_intencao",
  "confidence": 0.95,
  "entities": {
    "service": "nome_do_servico",
    "date": "data_mencionada",
    "time": "horario_mencionado"
  },
  "sentiment": "positive|neutral|negative",
  "requiresHuman": false,
  "suggestedActions": ["acao1", "acao2"],
  "contextUpdates": {
    "preferredService": "servico",
    "lastIntent": "intencao"
  }
}

Tipos de intenção disponíveis:
- greeting: saudações e cumprimentos
- scheduling: agendar novo horário
- reschedule: remarcar horário existente
- cancel: cancelar agendamento
- services_info: informações sobre serviços
- prices_info: informações sobre preços
- availability: horários de funcionamento
- confirmation: confirmar agendamento
- complaint: reclamação ou problema
- compliment: elogio ou satisfação
- farewell: despedida
- help: pedido de ajuda
- other: outras intenções

Sentimento:
- positive: mensagem positiva, satisfação
- neutral: mensagem neutra, informativa
- negative: mensagem negativa, insatisfação

RequiresHuman deve ser true apenas para:
- Reclamações sérias
- Problemas complexos
- Solicitações específicas que fogem do escopo

Retorne APENAS o JSON, sem explicações adicionais.
`;

// Função para detectar intenção por palavras-chave
const detectIntentByKeywords = (message: string): { intent: IntentType; confidence: number } => {
  const normalizedMessage = message.toLowerCase();
  const scores: Record<IntentType, number> = {
    greeting: 0,
    scheduling: 0,
    reschedule: 0,
    cancel: 0,
    services_info: 0,
    prices_info: 0,
    availability: 0,
    confirmation: 0,
    complaint: 0,
    compliment: 0,
    farewell: 0,
    help: 0,
    other: 0
  };

  // Calcular pontuação para cada intenção
  Object.entries(INTENT_KEYWORDS).forEach(([intent, keywords]) => {
    keywords.forEach(keyword => {
      if (normalizedMessage.includes(keyword)) {
        scores[intent as IntentType] += 1;
      }
    });
  });

  // Encontrar intenção com maior pontuação
  let maxScore = 0;
  let detectedIntent: IntentType = 'other';

  Object.entries(scores).forEach(([intent, score]) => {
    if (score > maxScore) {
      maxScore = score;
      detectedIntent = intent as IntentType;
    }
  });

  // Calcular confiança baseada na pontuação
  const confidence = maxScore > 0 ? Math.min(maxScore * 0.3, 0.8) : 0.1;

  return { intent: detectedIntent, confidence };
};

// Função principal para detectar intenção
const detectIntent = async (
  message: string,
  context?: ConversationContext | null
): Promise<IntentType> => {
  try {
    // Primeiro, tentar detecção por palavras-chave
    const keywordResult = detectIntentByKeywords(message);
    
    // Se a confiança for alta, usar resultado das palavras-chave
    if (keywordResult.confidence > 0.6) {
      logger.debug('Intenção detectada por palavras-chave:', {
        intent: keywordResult.intent,
        confidence: keywordResult.confidence
      });
      return keywordResult.intent;
    }

    // Caso contrário, usar IA para análise mais precisa
    const aiAnalysis = await analyzeIntent(message, keywordResult.intent, context);
    
    logger.debug('Intenção detectada por IA:', {
      intent: aiAnalysis.intent,
      confidence: aiAnalysis.confidence
    });

    return aiAnalysis.intent;
  } catch (error) {
    logger.error('Erro na detecção de intenção:', error);
    return 'other';
  }
};

// Função para análise detalhada de intenção usando IA
const analyzeIntent = async (
  message: string,
  suggestedIntent?: IntentType,
  context?: ConversationContext | null
): Promise<IntentAnalysis> => {
  try {
    const contextInfo = context ? `
Contexto da conversa:
- Cliente: ${context.client_name || 'Não informado'}
- Última intenção: ${context.intent || 'Não definida'}
- Estado da conversa: ${context.conversation_state}
- Histórico: ${JSON.stringify(context.context_data?.lastTopics?.slice(-3) || [])}
` : '';

    const analysisPrompt = `${INTENT_ANALYSIS_PROMPT}
${contextInfo}
Intenção sugerida por palavras-chave: ${suggestedIntent || 'não detectada'}

Mensagem do cliente: "${message}"`;

    const chatMessages: ChatMessage[] = [
      {
        role: 'user',
        content: analysisPrompt
      }
    ];

    const response = await generateAIResponse(chatMessages, {
      model: 'gpt-4o-mini',
      maxTokens: 300,
      temperature: 0.1
    });

    // Tentar parsear a resposta JSON
    let analysis: IntentAnalysis;
    try {
      analysis = JSON.parse(response.content);
    } catch (parseError) {
      logger.warn('Erro ao parsear análise de intenção, usando fallback:', parseError);
      
      // Fallback para análise básica
      analysis = {
        intent: suggestedIntent || 'other',
        confidence: 0.5,
        entities: {},
        sentiment: 'neutral',
        requiresHuman: false,
        suggestedActions: [],
        contextUpdates: {}
      };
    }

    // Validar e ajustar análise
    if (!Object.keys(INTENT_KEYWORDS).includes(analysis.intent)) {
      analysis.intent = 'other';
    }

    if (analysis.confidence < 0 || analysis.confidence > 1) {
      analysis.confidence = 0.5;
    }

    if (!['positive', 'neutral', 'negative'].includes(analysis.sentiment)) {
      analysis.sentiment = 'neutral';
    }

    logger.info('Análise de intenção concluída:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      sentiment: analysis.sentiment,
      requiresHuman: analysis.requiresHuman
    });

    return analysis;
  } catch (error) {
    logger.error('Erro na análise de intenção:', error);
    
    // Retornar análise básica em caso de erro
    return {
      intent: suggestedIntent || 'other',
      confidence: 0.3,
      entities: {},
      sentiment: 'neutral',
      requiresHuman: false,
      suggestedActions: [],
      contextUpdates: {}
    };
  }
};

// Função para obter estatísticas de intenções
const getIntentStats = async (
  establishmentId: string,
  days: number = 7
): Promise<Record<IntentType, number>> => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Esta função seria implementada consultando o banco de dados
    // Por enquanto, retornamos um objeto vazio
    const stats: Record<IntentType, number> = {
      greeting: 0,
      scheduling: 0,
      reschedule: 0,
      cancel: 0,
      services_info: 0,
      prices_info: 0,
      availability: 0,
      confirmation: 0,
      complaint: 0,
      compliment: 0,
      farewell: 0,
      help: 0,
      other: 0
    };

    // TODO: Implementar consulta real ao banco de dados
    // const { data, error } = await supabase
    //   .from('whatsapp_messages')
    //   .select('metadata')
    //   .eq('establishment_id', establishmentId)
    //   .gte('created_at', startDate.toISOString());

    return stats;
  } catch (error) {
    logger.error('Erro ao buscar estatísticas de intenções:', error);
    return {
      greeting: 0,
      scheduling: 0,
      reschedule: 0,
      cancel: 0,
      services_info: 0,
      prices_info: 0,
      availability: 0,
      confirmation: 0,
      complaint: 0,
      compliment: 0,
      farewell: 0,
      help: 0,
      other: 0
    };
  }
};

export const intentService = {
  detectIntentByKeywords,
  detectIntent,
  analyzeIntent,
  getIntentStats
};

// Exportações já feitas acima