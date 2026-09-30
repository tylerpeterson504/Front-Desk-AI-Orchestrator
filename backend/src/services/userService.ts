import bcrypt from 'bcrypt';
import { In } from 'typeorm';
import { getRepository } from '../config/database';
import { User } from '../entities/User';
import { Property } from '../entities/Property';
import { AppError, NotFoundError, ConflictError, AuthenticationError } from '../lib/errors';
import { createRequestLogger } from '../lib/logger';
import { config } from '../config';

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  role?: 'admin' | 'agent';
  property_id?: number;
}

export interface UpdateUserDto {
  email?: string;
  name?: string;
  role?: 'admin' | 'agent';
  property_id?: number;
}

export interface LoginDto {
  email: string;
  password: string;
}

const MIN_PASSWORD_LENGTH = 12;
const DEFAULT_ROLE = 'agent';

function getBcryptRounds(): number {
  const parsed = parseInt(config.BCRYPT_ROUNDS || '', 10);
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 15) return 12;
  return parsed;
}

export class UserService {
  private get userRepository() {
    return getRepository<User>(User);
  }

  async createUser(data: CreateUserDto, requestId?: string): Promise<User> {
    const log = createRequestLogger(requestId || '');

    // Validate input
    if (!data.email || !data.password || !data.name) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email, password, and name are required');
    }

    if (data.email.length > 255) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email is too long');
    }

    if (data.password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      );
    }

    if (!data.name.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A name is required');
    }

    const normalizedEmail = data.email.trim().toLowerCase();

    // Check if email already exists
    const existingUser = await this.userRepository.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new ConflictError('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(data.password, getBcryptRounds());

    const user = this.userRepository.create({
      email: normalizedEmail,
      password_hash: hashedPassword,
      name: data.name.trim(),
      role: data.role || DEFAULT_ROLE,
      property_id: data.property_id,
    });

    await this.userRepository.save(user);

    log.info('User created', { user_id: user.id, role: user.role });

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.userRepository.findOne({ where: { email: normalizedEmail } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepository.find();
  }
  // Staff attached to any property the caller can access: properties they own
  // (Property.user_id) plus the property they are assigned to (User.property_id).
  async getUsersForProperty(userId: string): Promise<User[]> {
    const caller = await this.findById(userId);
    if (!caller) {
      return [];
    }
    const propertyRepository = getRepository<Property>(Property);
    const owned = await propertyRepository.find({ where: { user_id: userId } as never });
    const authorizedIds = new Set<number>(owned.map((p) => p.id));
    if (caller.property_id != null) {
      authorizedIds.add(caller.property_id);
    }
    if (authorizedIds.size === 0) {
      return [caller];
    }
    const staff = await this.userRepository.find({
      where: { property_id: In([...authorizedIds]) }
    });
    const seen = new Set<string>([caller.id]);
    const result = [caller];
    for (const u of staff) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        result.push(u);
      }
    }
    return result;
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }

    if (data.email) {
      const existingUser = await this.findByEmail(data.email);
      if (existingUser && existingUser.id !== id) {
        throw new ConflictError('Email already in use');
      }
      user.email = data.email.trim().toLowerCase();
    }

    if (data.name !== undefined) {
      user.name = data.name?.trim() || '';
    }

    if (data.role !== undefined) {
      user.role = data.role;
    }

    if (data.property_id !== undefined) {
      user.property_id = data.property_id;
    }

    await this.userRepository.save(user);

    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }

    await this.userRepository.remove(user);
  }

  async setUserRole(id: string, role: 'admin' | 'agent'): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }


    user.role = role;
    await this.userRepository.save(user);

    return user;
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }
}

export const userService = new UserService();
