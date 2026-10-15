import { isPlaceholderJwtSecret } from '../src/config';

describe('isPlaceholderJwtSecret', () => {
  it('rejects the placeholder value shipped in the example env file', () => {
    expect(isPlaceholderJwtSecret('your_jwt_secret_change_in_production')).toBe(true);
  });

  it.each([
    'change_this_in_production',
    'CHANGE-ME',
    'changeme',
    'change-this-secret',
    'ChangeInProduction'
  ])('rejects change-placeholder secret %s', (secret) => {
    expect(isPlaceholderJwtSecret(secret)).toBe(true);
  });

  it('accepts the CI-only secret', () => {
    expect(isPlaceholderJwtSecret('ci-only-secret-not-for-production')).toBe(false);
  });

  it('accepts a generated secret', () => {
    expect(isPlaceholderJwtSecret('Kq7mW2xV9nTz4RbY1cPj8LsH3dGa6EuNfQoXi0BwZtMr5Sk2')).toBe(false);
  });
});

describe('JWT_SECRET configuration', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET
  };

  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    process.env.JWT_SECRET = saved.JWT_SECRET;
  });

  it.each(['development', 'test', 'production'])(
    'refuses to load configuration with a placeholder secret in %s',
    (nodeEnv) => {
      process.env.NODE_ENV = nodeEnv;
      process.env.JWT_SECRET = 'your_jwt_secret_change_in_production';

      jest.isolateModules(() => {
        expect(() => jest.requireActual('../src/config')).toThrow('JWT_SECRET');
      });
    }
  );
});
