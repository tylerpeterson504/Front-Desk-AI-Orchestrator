import { Request } from 'express';
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  createdResponse,
  noContentResponse,
  ApiResponse,
  PaginationMeta
} from '../src/lib/responseBuilder';

// Mock Request object
const mockRequest = (requestId = 'test-request-id'): Request => ({
  requestId,
  // Add other required properties
  method: 'GET',
  path: '/test',
  headers: {},
  query: {},
  params: {},
  body: {},
  cookies: {},
  get: jest.fn(),
  header: jest.fn(),
  accepts: jest.fn(),
  acceptsCharsets: jest.fn(),
  acceptsEncodings: jest.fn(),
  acceptsLanguages: jest.fn(),
  range: jest.fn(),
  param: jest.fn(),
  is: jest.fn(),
  protocol: 'http',
  secure: false,
  ip: '127.0.0.1',
  ips: [],
  subdomains: [],
  hostname: 'localhost',
  host: 'localhost',
  fresh: true,
  stale: false,
  xhr: false,
  socket: {} as any
} as unknown as Request);

describe('Response Builder', () => {
  describe('successResponse', () => {
    it('should create a success response with data', () => {
      const req = mockRequest();
      const data = { id: 1, name: 'Test' };
      
      const response = successResponse(data, req);
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta?.requestId).toBe('test-request-id');
      expect(response.meta?.timestamp).toBeDefined();
    });

    it('should create a success response without pagination', () => {
      const req = mockRequest();
      const data = { message: 'Success' };
      
      const response = successResponse(data, req);
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta?.pagination).toBeUndefined();
    });

    it('should create a success response with pagination', () => {
      const req = mockRequest();
      const data = [{ id: 1 }, { id: 2 }];
      const pagination: PaginationMeta = {
        page: 1,
        limit: 10,
        total: 20,
        totalPages: 2
      };
      
      const response = successResponse(data, req, pagination);
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta?.pagination).toEqual(pagination);
    });
  });

  describe('errorResponse', () => {
    it('should create an error response with default status code', () => {
      const req = mockRequest();
      const result = errorResponse('Test error', 'VALIDATION_ERROR', req);
      
      expect(result.status).toBe(400);
      expect(result.body.success).toBe(false);
      expect(result.body.error?.message).toBe('Test error');
      expect(result.body.error?.code).toBe('VALIDATION_ERROR');
      expect(result.body.error?.requestId).toBe('test-request-id');
    });

    it('should map error codes to status codes', () => {
      const req = mockRequest();
      
      const authError = errorResponse('Auth failed', 'AUTHENTICATION_ERROR', req);
      expect(authError.status).toBe(401);
      
      const authzError = errorResponse('Access denied', 'AUTHORIZATION_ERROR', req);
      expect(authzError.status).toBe(403);
      
      const notFoundError = errorResponse('Not found', 'NOT_FOUND', req);
      expect(notFoundError.status).toBe(404);
      
      const rateLimitError = errorResponse('Rate limited', 'RATE_LIMIT_ERROR', req);
      expect(rateLimitError.status).toBe(429);
      
      const dbError = errorResponse('DB error', 'DATABASE_ERROR', req);
      expect(dbError.status).toBe(500);
    });

    it('should use custom status code when provided', () => {
      const req = mockRequest();
      const result = errorResponse('Custom error', 'CUSTOM_ERROR', req, {}, 418);
      
      expect(result.status).toBe(418);
    });

    it('should include details in error response', () => {
      const req = mockRequest();
      const details = { field: 'email', message: 'Invalid format' };
      const result = errorResponse('Validation failed', 'VALIDATION_ERROR', req, details);
      
      expect(result.body.error?.details).toEqual(details);
    });
  });

  describe('paginatedResponse', () => {
    it('should create a paginated response', () => {
      const req = mockRequest();
      const data = [{ id: 1 }, { id: 2 }];
      
      const response = paginatedResponse(data, req, 20, 1, 10);
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta?.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 20,
        totalPages: 2
      });
    });

    it('should calculate totalPages correctly', () => {
      const req = mockRequest();
      const data = [{ id: 1 }];
      
      const response = paginatedResponse(data, req, 25, 1, 10);
      
      expect(response.meta?.pagination?.totalPages).toBe(3);
    });
  });

  describe('createdResponse', () => {
    it('should create a 201 response', () => {
      const req = mockRequest();
      const data = { id: 1, name: 'Created' };
      
      const result = createdResponse(data, req);
      
      expect(result.status).toBe(201);
      expect(result.body.success).toBe(true);
      expect(result.body.data).toEqual(data);
    });
  });

  describe('noContentResponse', () => {
    it('should create a 204 response', () => {
      const req = mockRequest();
      const result = noContentResponse(req);
      
      expect(result.status).toBe(204);
      expect(result.body).toBeUndefined();
    });
  });
});
