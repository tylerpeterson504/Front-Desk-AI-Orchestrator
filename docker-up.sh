#!/bin/bash
echo "Starting Front Desk AI Orchestrator..."
docker-compose up -d || exit $?
echo ""
echo "Services started!"
echo "  Dashboard: http://localhost:3000"
echo "  Backend:   http://localhost:3001"
echo ""
echo "Demo credentials: demo@example.com / password123 (LOCAL DEVELOPMENT ONLY)"
echo ""
echo "Run 'docker-compose logs -f' to follow logs"
