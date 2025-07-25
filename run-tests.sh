#!/bin/bash

# Function to check if server is running
check_server() {
  for i in {1..30}; do
    if curl -s http://localhost:5173 > /dev/null; then
      echo "Server is up and running!"
      return 0
    fi
    echo "Waiting for server to start... ($i/30)"
    sleep 1
  done
  echo "Server failed to start within timeout period"
  return 1
}

# Kill any existing processes on port 5173
echo "Checking for existing processes on port 5173..."
PID=$(lsof -ti:5173)
if [ ! -z "$PID" ]; then
  echo "Killing existing process on port 5173: $PID"
  kill -9 $PID
  sleep 2
fi

# Start the development server in the background
echo "Starting development server..."
cd "$(dirname "$0")" # Ensure we're in the project directory
npm run dev -- --host &
SERVER_PID=$!

# Wait for the server to start
if ! check_server; then
  echo "Failed to start server, aborting tests"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

# Run the tests with a shorter timeout
echo "Running tests..."

# Make sure the server is actually running and accessible
echo "Verifying server is accessible..."
MAX_RETRIES=10
RETRY_COUNT=0
SERVER_UP=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SERVER_UP" = false ]; do
  if curl -s http://localhost:5173 > /dev/null; then
    echo "Server is up and running!"
    SERVER_UP=true
  else
    echo "Waiting for server to be accessible... (attempt $((RETRY_COUNT+1))/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT+1))
  fi
done

if [ "$SERVER_UP" = false ]; then
  echo "Server failed to become accessible after $MAX_RETRIES attempts"
  exit 1
fi

# Run the tests with a shorter timeout
NODE_OPTIONS="--max-old-space-size=4096" npx playwright test tests/p2p-connection.spec.ts --timeout=30000
TEST_EXIT_CODE=$?

# Kill the development server
echo "Stopping development server..."
kill $SERVER_PID 2>/dev/null

# Return the test exit code
exit $TEST_EXIT_CODE
