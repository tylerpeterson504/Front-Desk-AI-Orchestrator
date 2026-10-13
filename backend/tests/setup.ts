import 'reflect-metadata';
import './setupEnv';

// Mock the database initialization to prevent errors in unit tests
const mockInitializeDatabase = async () => true;
const mockGetRepository = () => {};
