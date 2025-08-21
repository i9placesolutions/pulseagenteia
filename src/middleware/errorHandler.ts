import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: AppError | ZodError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Erro interno do servidor';
  let details: any = undefined;

  // Log do erro
  logger.error('Erro capturado:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Tratamento específico para diferentes tipos de erro
  if (error instanceof CustomError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Dados de entrada inválidos';
    details = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }));
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Erro de validação';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Token de acesso inválido';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Formato de ID inválido';
  }

  // Resposta de erro
  const errorResponse: any = {
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };

  // Incluir detalhes apenas em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = error.stack;
    if (details) {
      errorResponse.error.details = details;
    }
  }

  res.status(statusCode).json(errorResponse);
};

// Middleware para capturar erros assíncronos
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};