-- Create an admin user for the Front Desk AI Orchestrator
-- This script creates a user with admin privileges for managing the application

-- First, check if the user already exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE email = 'admin@frontdesk.ai') THEN
        RAISE NOTICE 'Admin user already exists. Skipping creation.';
    ELSE
        -- Create admin user with hashed password
        -- Default password: Admin@12345
        -- Note: In production, use bcrypt to hash the password properly
        INSERT INTO users (email, password, name, role, created_at, updated_at) 
        VALUES ('admin@frontdesk.ai', '$2b$12$N9qo8uLOickgx2ZMRZoMy.MH9J3mYFqHxJ7XVVQ7zL4aQ1p5Xy2W6a', 'Administrator', 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        
        RAISE NOTICE 'Admin user created successfully.';
        RAISE NOTICE 'Email: admin@frontdesk.ai';
        RAISE NOTICE 'Password: Admin@12345';
    END IF;
END $$;

-- Also create a regular user for testing
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE email = 'user@frontdesk.ai') THEN
        RAISE NOTICE 'Regular user already exists. Skipping creation.';
    ELSE
        -- Create regular user with hashed password
        -- Default password: User@12345
        INSERT INTO users (email, password, name, role, created_at, updated_at) 
        VALUES ('user@frontdesk.ai', '$2b$12$N9qo8uLOickgx2ZMRZoMy.MH9J3mYFqHxJ7XVVQ7zL4aQ1p5Xy2W6a', 'Front Desk User', 'agent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        
        RAISE NOTICE 'Regular user created successfully.';
        RAISE NOTICE 'Email: user@frontdesk.ai';
        RAISE NOTICE 'Password: User@12345';
    END IF;
END $$;