import { Repository } from 'typeorm';

/**
 * Mock repository type that extends Jest mock functions
 * This allows TypeScript to recognize mockResolvedValue, mockReturnValue, etc.
 */
export interface MockRepository<T> {
  findOne: jest.Mock;
  find: jest.Mock;
  findOneBy: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  remove: jest.Mock;
  count: jest.Mock;
  findAndCount: jest.Mock;
}

/**
 * Creates a mock repository with all TypeORM methods mocked
 */
export function createMockRepository<T>(
  overrides: Partial<MockRepository<T>> = {}
): MockRepository<T> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    findAndCount: jest.fn(),
    ...overrides
  };
}

/**
 * Helper to mock getRepository for a specific entity
 */
export function mockGetRepository<T>(
  entity: new (...args: any[]) => T,
  mockRepo: MockRepository<T>
): jest.Mock {
  const mock = jest.fn(() => mockRepo);
  jest.spyOn(require('../src/config/database'), 'getRepository').mockImplementation(
    (target: any) => {
      if (target === entity) {
        return mockRepo;
      }
      return createMockRepository();
    }
  );
  return mock;
}

/**
 * Creates a mock user for testing
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    password_hash: 'hashed_password',
    name: 'Test User',
    role: 'agent',
    property_id: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  } as User;
}

/**
 * Creates a mock property for testing
 */
export function createMockProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 1,
    name: 'Test Hotel',
    address: '123 Test St',
    checkout_time: '11:00 AM',
    wifi_ssid: 'TestWiFi',
    wifi_password: '',
    tone_guidelines: 'Friendly',
    user_id: 'test-user-id',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  } as Property;
}

/**
 * Creates a mock template for testing
 */
export function createMockTemplate(overrides: Partial<Template> = {}): Template {
  const property = createMockProperty();
  return {
    id: 1,
    name: 'Welcome Template',
    content: 'Welcome to our hotel!',
    property_id: 1,
    user_id: 'test-user-id',
    is_global: false,
    created_at: new Date(),
    updated_at: new Date(),
    property: property,
    ...overrides
  } as Template;
}

/**
 * Type for User entity (imported from actual entity)
 */
type User = {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  role: 'admin' | 'agent';
  property_id: number | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Type for Property entity
 */
type Property = {
  id: number;
  name: string;
  address: string;
  checkout_time: string;
  wifi_ssid: string;
  wifi_password: string;
  tone_guidelines: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
};

/**
 * Type for Template entity
 */
type Template = {
  id: number;
  name: string;
  content: string;
  property_id: number;
  user_id: string;
  is_global: boolean;
  created_at: Date;
  updated_at: Date;
  property: Property;
};

/**
 * Waits for all mocks to be called
 */
export async function waitForMocks(...mocks: jest.Mock[]): Promise<void> {
  for (const mock of mocks) {
    if (mock.mock.calls.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

export {
  MockRepository,
  createMockRepository,
  mockGetRepository,
  createMockUser,
  createMockProperty,
  createMockTemplate
};
