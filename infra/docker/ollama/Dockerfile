# Ollama Docker Image for Vouch
# Pre-configured with code analysis models

FROM ollama/ollama:latest

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Pre-pull models for faster startup
# These are the recommended models for code analysis
ENV OLLAMA_MODELS="codellama:7b-code llama3.1:8b"

# Create startup script
RUN cat > /start-ollama.sh << 'EOF'
#!/bin/bash
set -e

# Start Ollama server in background
ollama serve &
OLLAMA_PID=$!

# Wait for server to be ready
echo "Waiting for Ollama server to start..."
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
    sleep 1
done
echo "Ollama server is ready!"

# Pull models if specified
if [ -n "$OLLAMA_MODELS" ]; then
    for model in $OLLAMA_MODELS; do
        echo "Pulling model: $model"
        ollama pull $model || echo "Warning: Failed to pull $model"
    done
fi

# Keep container running
wait $OLLAMA_PID
EOF

RUN chmod +x /start-ollama.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:11434/api/tags || exit 1

# Expose Ollama port
EXPOSE 11434

# Start Ollama
ENTRYPOINT ["/start-ollama.sh"]
