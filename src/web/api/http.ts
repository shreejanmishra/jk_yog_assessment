import axios, { AxiosError } from 'axios';
import { ApiErrorEnvelopeSchema, type ApiIssueDTO } from '@contract/index';

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly issues: readonly ApiIssueDTO[];
  public readonly isNetworkError: boolean;

  constructor(params: {
    statusCode: number;
    code: string;
    message: string;
    issues?: readonly ApiIssueDTO[];
    isNetworkError?: boolean;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.issues = params.issues ?? [];
    this.isNetworkError = params.isNetworkError ?? false;
  }
}

export const httpClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError) {
      if (error.code === 'ERR_CANCELED') {
        return Promise.reject(error);
      }
      if (!error.response) {
        return Promise.reject(
          new ApiClientError({
            statusCode: 0,
            code: 'NETWORK_ERROR',
            message:
              'Network connection lost. Please check your internet connection and try again.',
            isNetworkError: true,
          }),
        );
      }

      const parsed = ApiErrorEnvelopeSchema.safeParse(error.response.data);
      if (parsed.success) {
        return Promise.reject(
          new ApiClientError({
            statusCode: error.response.status,
            code: parsed.data.error.code,
            message: parsed.data.error.message,
            issues: parsed.data.error.issues ?? [],
          }),
        );
      }

      return Promise.reject(
        new ApiClientError({
          statusCode: error.response.status,
          code: 'HTTP_ERROR',
          message: `Request failed with status ${error.response.status}.`,
        }),
      );
    }
    return Promise.reject(error);
  },
);
