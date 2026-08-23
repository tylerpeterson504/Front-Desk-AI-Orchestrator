#!/bin/bash
echo "Stopping Front Desk AI Orchestrator..."
docker-compose down || exit $?
echo "All services stopped."
