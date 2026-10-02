/**
 * Health check routes for Front Desk AI Orchestrator.
 * Provides comprehensive health monitoring and database connectivity checks.
 */

import express from 'express';
import { getRepository } from '../config/database';
import { Migration } from 'typeorm';
import logger from '../lib/logger';
import { config } from '../config';

const router = express.Router();

/**
 * Basic health check endpoint
 * Returns simple status without database check
 */
router.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

/**
 * Detailed health check endpoint
 * Includes database connectivity verification
 */
router.get('/detailed', async (req, res, next) => {
  try {
    const startTime = Date.now();
    
    // Database connectivity check
    let dbStatus = 'unavailable';
    let dbResponseTime = 0;
    let migrationStatus = 'unknown';
    let currentVersion = 'unknown';
    
    try {
      const dbStart = Date.now();
      
      // Try to get a connection and run a simple query
      const query = 'SELECT 1';
      // Using raw query to avoid entity dependencies
      // @ts-expect-error - Accessing private property for health check
      const connection = req.app.get('dbConnection') || await import('../config/database').then(m => m.default);
      
      // For now, just check if we can get the repository
      await getRepository('User').query(query);
      
      dbStatus = 'ok';
      dbResponseTime = Date.now() - dbStart;
      
      // Get migration version
      try {
        const migrations = await getRepository(Migration).find({
          order: { id: 'DESC' },
          take: 1
        });
        if (migrations.length > 0) {
          currentVersion = migrations[0].name;
          migrationStatus = 'up_to_date';
        }
      } catch (migrationError) {
        // Migration table might not exist or be inaccessible
        logger.debug('Could not check migration version', { error: migrationError });
        migrationStatus = 'check_failed';
      }
    } catch (dbError) {
      logger.warn('Database health check failed', { error: dbError });
      dbStatus = 'error';
      dbResponseTime = 0;
    }
    
    const totalResponseTime = Date.now() - startTime;
    
    const health = {
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV || 'development',
      version: '1.0.0',
      checks: {
        database: {
          status: dbStatus,
          responseTimeMs: dbResponseTime,
          migration: {
            status: migrationStatus,
            currentVersion
          }
        }
      },
      responseTimeMs: totalResponseTime,
      uptime: process.uptime()
    };
    
    // Log health check for monitoring
    logger.info('Health check performed', {
      status: health.status,
      dbStatus,
      responseTimeMs: totalResponseTime
    });
    
    // Return appropriate status code
    const statusCode = dbStatus === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    next(err);
  }
});

/**
 * Database-specific health check
 */
router.get('/database', async (req, res, next) => {
  try {
    const startTime = Date.now();
    
    // Try a simple query
    await getRepository('User').query('SELECT 1');
    
    const responseTime = Date.now() - startTime;
    
    res.json({
      status: 'ok',
      database: 'connected',
      responseTimeMs: responseTime,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Database health check failed', { error: err });
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: process.env.NODE_ENV === 'development' ? (err as Error).message : 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Migration status endpoint
 */
router.get('/migrations', async (req, res, next) => {
  try {
    const migrations = await getRepository(Migration).find({
      order: { id: 'DESC' }
    });
    
    res.json({
      status: 'ok',
      currentVersion: migrations.length > 0 ? migrations[0].name : 'none',
      totalMigrations: migrations.length,
      migrations: migrations.map(m => ({
        name: m.name,
        executedAt: m.timestamp
      })),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Migration status check failed', { error: err });
    res.status(503).json({
      status: 'error',
      error: process.env.NODE_ENV === 'development' ? (err as Error).message : 'Could not check migrations',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
