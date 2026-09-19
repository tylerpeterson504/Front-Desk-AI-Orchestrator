import 'express';

declare module 'express' {
  interface Request {
    requestId?: string;
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
