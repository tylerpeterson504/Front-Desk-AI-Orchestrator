import 'express';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        userId: string;
        role: string;
        propertyId?: string;
      };
    }

    interface User {
      userId: string;
      role: string;
      propertyId?: string;
    }
  }
}
