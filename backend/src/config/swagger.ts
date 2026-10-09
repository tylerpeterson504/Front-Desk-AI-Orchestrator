/**
 * Swagger/OpenAPI Configuration
 * Provides API documentation and interactive exploration
 */

import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

/**
 * Swagger Options
 */
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Front Desk AI Orchestrator API',
      version: '1.0.0',
      description: `
        API for the Front Desk AI Orchestrator - a hotel front desk assistant system.
        
        ## Authentication
        All endpoints require JWT authentication via the \`Authorization\` header:
        \`\`\`
        Authorization: Bearer <your-jwt-token>
        \`\`\`
        
        ## Rate Limiting
        - General API: 200 requests per 15 minutes
        - Auth endpoints: 20 requests per 15 minutes
        - Copilot endpoints: 30 requests per 15 minutes
        - Refresh endpoints: 120 requests per 15 minutes
        
        ## Security
        - CSRF protection enabled on all state-changing requests
        - Request IP logging for security audit
        - All sensitive data encrypted at rest
        
        ## Base URL
        ${config.NODE_ENV === 'production' 
          ? process.env.API_BASE_URL || 'https://api.yourdomain.com' 
          : 'http://localhost:3001'}
      `,
      contact: {
        name: 'Front Desk AI Team',
        email: 'support@frontdesk.ai'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server'
      },
      {
        url: process.env.API_BASE_URL || 'https://api.yourdomain.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login or /api/auth/refresh'
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description: 'CSRF token obtained from cookie or GET request'
        }
      },
      schemas: {
        // Common schemas
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' },
            code: { type: 'string', description: 'Error code' },
            requestId: { type: 'string', description: 'Request ID for correlation' },
            request_id: { type: 'string', description: 'Request ID (alternative)' }
          },
          example: {
            error: 'Authentication required',
            code: 'AUTHENTICATION_ERROR',
            requestId: 'req_123456789'
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1, description: 'Page number' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Items per page' },
            total: { type: 'integer', description: 'Total number of items' },
            totalPages: { type: 'integer', description: 'Total number of pages' }
          }
        },
        // Auth schemas
        User: {
          type: 'object',
          required: ['id', 'email', 'name', 'role'],
          properties: {
            id: { type: 'string', description: 'User ID' },
            email: { type: 'string', format: 'email', description: 'User email address' },
            name: { type: 'string', description: 'User display name' },
            role: { type: 'string', enum: ['admin', 'agent'], description: 'User role' }
          }
        },
        AuthTokens: {
          type: 'object',
          required: ['token', 'refresh_token', 'expires_in', 'user'],
          properties: {
            token: { type: 'string', description: 'JWT access token (15 minute expiry)' },
            refresh_token: { type: 'string', description: 'Refresh token for obtaining new access tokens' },
            expires_in: { type: 'integer', description: 'Access token expiry in seconds' },
            refresh_expires_at: { type: 'string', format: 'date-time', description: 'Refresh token expiry date' },
            user: { $ref: '#/components/schemas/User' }
          }
        },
        // Property schemas
        Property: {
          type: 'object',
          required: ['id', 'name', 'user_id'],
          properties: {
            id: { type: 'integer', description: 'Property ID' },
            name: { type: 'string', description: 'Property name' },
            user_id: { type: 'string', description: 'Owner user ID' },
            checkout_time: { type: 'string', description: 'Checkout time (e.g., "11:00 AM")' },
            tone_guidelines: { type: 'string', description: 'Tone guidelines for responses' },
            wifi_ssid: { type: 'string', description: 'WiFi network name' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        // Template schemas
        Template: {
          type: 'object',
          required: ['id', 'name', 'content', 'user_id'],
          properties: {
            id: { type: 'integer', description: 'Template ID' },
            name: { type: 'string', description: 'Template name' },
            content: { type: 'string', description: 'Template content' },
            user_id: { type: 'string', description: 'Owner user ID' },
            description: { type: 'string', description: 'Template description' },
            category: { type: 'string', description: 'Template category' },
            is_active: { type: 'boolean', default: true, description: 'Whether template is active' },
            version: { type: 'integer', default: 1, description: 'Template version' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        // Copilot schemas
        DraftRequest: {
          type: 'object',
          properties: {
            property_id: { type: 'integer', description: 'Property ID for context' },
            tone: { type: 'string', enum: ['friendly', 'professional'], default: 'professional', description: 'Response tone' },
            template_ids: {
              type: 'array',
              items: { type: 'integer' },
              maxItems: 10,
              description: 'Template IDs to include in response'
            },
            guest_info: {
              type: 'object',
              properties: {
                guestName: { type: 'string', maxLength: 200 },
                roomNumber: { type: 'string', maxLength: 200 },
                checkIn: { type: 'string', maxLength: 200 },
                checkOut: { type: 'string', maxLength: 200 },
                reservationStatus: { type: 'string', maxLength: 200 },
                confirmationNumber: { type: 'string', maxLength: 200 }
              }
            },
            chat_context: {
              type: 'object',
              properties: {
                messages: {
                  type: 'array',
                  maxItems: 20,
                  items: {
                    type: 'object',
                    properties: {
                      sender: { type: 'string', maxLength: 80 },
                      text: { type: 'string', maxLength: 1000 }
                    }
                  }
                },
                activeGuest: { type: 'string', maxLength: 200 }
              }
            },
            conversation_id: { type: 'string', description: 'Conversation ID for multi-turn context' }
          }
        },
        DraftResponse: {
          type: 'object',
          required: ['draft', 'meta'],
          properties: {
            draft: { type: 'string', description: 'Generated draft response' },
            meta: {
              type: 'object',
              properties: {
                provider: { type: 'string', description: 'LLM provider used' },
                model: { type: 'string', description: 'Model used for generation' },
                template_count: { type: 'integer', description: 'Number of templates used' },
                property: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' }
                  }
                },
                tone: { type: 'string', enum: ['friendly', 'professional'] },
                conversation_id: { type: 'string', description: 'Conversation ID for multi-turn context' }
              }
            }
          }
        }
      }
    }
  },
  apis: [
    // Auth routes
    path.join(__dirname, '../../routes/auth.ts'),
    // Property routes
    path.join(__dirname, '../../routes/properties.ts'),
    // Template routes
    path.join(__dirname, '../../routes/templates.ts'),
    // Shift Note routes
    path.join(__dirname, '../../routes/shiftNotes.ts'),
    // Audit Log routes
    path.join(__dirname, '../../routes/auditLogs.ts'),
    // Copilot routes
    path.join(__dirname, '../../routes/copilot.ts'),
    // Health routes
    path.join(__dirname, '../../routes/health.ts'),
    // Databricks routes
    path.join(__dirname, '../../routes/databricks.ts'),
    // GitHub routes
    path.join(__dirname, '../../routes/github.ts'),
    // Analytics routes
    path.join(__dirname, '../../routes/analytics.ts')
  ]
};

/**
 * Generate Swagger specification
 */
export function getSwaggerSpec(): object {
  return swaggerJsdoc(swaggerOptions);
}

/**
 * Get Swagger UI options
 */
export function getSwaggerUiOptions(): {
  customCss: string;
  customSiteTitle: string;
  customfavIcon: string;
} {
  return {
    customCss: '.swagger-ui .topbar { display: none } .swagger-ui .info { margin: 30px 0 }',
    customSiteTitle: 'Front Desk AI API Docs',
    customfavIcon: '/favicon.ico'
  };
}

/**
 * Swagger setup function for Express
 */
export function setupSwagger(app: import('express').Application): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const swaggerUi = require('swagger-ui-express');
  const specs = getSwaggerSpec();
  
  // Serve Swagger UI at /api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, getSwaggerUiOptions()));
  
  // Serve OpenAPI spec at /api-docs.json
  app.get('/api-docs.json', (req: import('express').Request, res: import('express').Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(specs);
  });
}

export default {
  getSwaggerSpec,
  getSwaggerUiOptions,
  setupSwagger
};