import type { ApiIssueDTO } from '@contract/errors.schema';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly issues?: readonly ApiIssueDTO[];

  constructor(params: {
    statusCode: number;
    code: string;
    message: string;
    issues?: readonly ApiIssueDTO[];
  }) {
    super(params.message);
    this.name = 'AppError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.issues = params.issues;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, issues?: readonly ApiIssueDTO[]) {
    super({ statusCode: 400, code: 'BAD_REQUEST', message, issues });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super({ statusCode: 401, code: 'UNAUTHORIZED', message });
  }
}

export class PaymentDeclinedError extends AppError {
  constructor(message = 'Payment was declined by the simulated issuer. You have not been charged.') {
    super({ statusCode: 402, code: 'PAYMENT_DECLINED', message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.') {
    super({ statusCode: 404, code: 'NOT_FOUND', message });
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, issues?: readonly ApiIssueDTO[]) {
    super({ statusCode: 409, code, message, issues });
  }
}

export class GoneError extends AppError {
  constructor(code: string, message: string) {
    super({ statusCode: 410, code, message });
  }
}

export class RuleViolationError extends AppError {
  constructor(message: string, issues: readonly ApiIssueDTO[], code = 'RULES_VIOLATED') {
    super({ statusCode: 422, code, message, issues });
  }
}
