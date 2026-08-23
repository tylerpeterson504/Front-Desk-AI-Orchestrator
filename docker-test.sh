#!/bin/bash
echo "Running tests in Docker containers..."
echo ""
echo "--- Backend Tests ---"
docker-compose exec backend npm test || exit $?
echo ""
echo "--- Tests complete ---"
