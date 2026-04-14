#!/bin/bash
#
# Vouch Development Setup Script
# One-command setup for local development
#

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_deps=()
    
    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 20 ]; then
            log_error "Node.js 20+ required, found $(node --version)"
            missing_deps+=("Node.js 20+")
        else
            log_success "Node.js $(node --version)"
        fi
    else
        log_error "Node.js not found"
        missing_deps+=("Node.js 20+")
    fi
    
    # Check pnpm
    if command_exists pnpm; then
        log_success "pnpm $(pnpm --version)"
    else
        log_warning "pnpm not found, will install..."
    fi
    
    # Check Docker
    if command_exists docker; then
        log_success "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
    else
        log_error "Docker not found"
        missing_deps+=("Docker")
    fi
    
    # Check Docker Compose
    if command_exists docker-compose || docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose available"
    else
        log_error "Docker Compose not found"
        missing_deps+=("Docker Compose")
    fi
    
    # Check Git
    if command_exists git; then
        log_success "Git $(git --version | cut -d' ' -f3)"
    else
        log_error "Git not found"
        missing_deps+=("Git")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        log_info "Please install missing dependencies and try again"
        log_info "See: https://github.com/vouch/vouch/blob/main/docs/development.md"
        exit 1
    fi
    
    log_success "All prerequisites met!"
}

# Install pnpm if needed
install_pnpm() {
    if ! command_exists pnpm; then
        log_info "Installing pnpm..."
        npm install -g pnpm
        log_success "pnpm installed"
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    pnpm install
    log_success "Dependencies installed"
}

# Setup environment file
setup_environment() {
    log_info "Setting up environment..."
    
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            log_warning "Created .env from .env.example"
            log_warning "Please edit .env and add your GitHub App credentials"
        else
            log_error ".env.example not found"
            exit 1
        fi
    else
        log_success ".env already exists"
    fi
}

# Start infrastructure services
start_infrastructure() {
    log_info "Starting infrastructure services (PostgreSQL, Redis)..."
    
    cd infra/docker
    
    # Check if already running
    if docker-compose ps | grep -q "Up"; then
        log_warning "Services already running, restarting..."
        docker-compose down
    fi
    
    docker-compose -f docker-compose.dev.yml up -d db redis
    
    # Wait for services to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    until docker-compose exec -T db pg_isready -U postgres >/dev/null 2>&1; do
        sleep 1
    done
    log_success "PostgreSQL is ready"
    
    log_info "Waiting for Redis to be ready..."
    until docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; do
        sleep 1
    done
    log_success "Redis is ready"
    
    cd ../..
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    # Generate Prisma client
    npx prisma generate
    
    # Run migrations
    npx prisma migrate dev --name init
    
    log_success "Database setup complete"
}

# Setup smee.io webhook forwarding (optional)
setup_webhook_forwarding() {
    log_info "Setting up webhook forwarding..."
    
    if command_exists npx; then
        log_info "To forward GitHub webhooks to your local machine:"
        log_info "  1. Go to https://smee.io and create a new channel"
        log_info "  2. Update your GitHub App webhook URL to the smee.io URL"
        log_info "  3. Run: npx smee -u <smee-url> -t http://localhost:3000/webhooks/github"
        log_info ""
        log_info "Or use the built-in tunnel (requires ngrok):"
        log_info "  ngrok http 3000"
    fi
}

# Build packages
build_packages() {
    log_info "Building packages..."
    pnpm run build
    log_success "Packages built"
}

# Print final instructions
print_instructions() {
    echo ""
    echo "========================================"
    echo -e "${GREEN}Vouch Development Environment Ready!${NC}"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Edit .env with your credentials:"
    echo "   - GITHUB_APP_ID"
    echo "   - GITHUB_PRIVATE_KEY"
    echo "   - GITHUB_WEBHOOK_SECRET"
    echo "   - ANTHROPIC_API_KEY (or use Ollama for zero cost)"
    echo ""
    echo "2. Start the development servers:"
    echo "   pnpm dev"
    echo ""
    echo "3. Or start components separately:"
    echo "   Terminal 1: pnpm dev:api      # API server"
    echo "   Terminal 2: pnpm dev:worker   # Analysis worker"
    echo "   Terminal 3: pnpm dev:dashboard # Admin UI"
    echo ""
    echo "4. Setup webhook forwarding (for testing with real GitHub):"
    echo "   npx smee -u <your-smee-url> -t http://localhost:3000/webhooks/github"
    echo ""
    echo "5. Run tests:"
    echo "   pnpm test"
    echo ""
    echo "Services:"
    echo "  - API:        http://localhost:3000"
    echo "  - Dashboard:  http://localhost:3002"
    echo "  - Database:   postgresql://postgres:postgres@localhost:5432/vouch"
    echo "  - Redis:      redis://localhost:6379"
    echo "  - Prisma Studio: http://localhost:5555 (run: npx prisma studio)"
    echo ""
    echo "Documentation:"
    echo "  - README:     https://github.com/vouch/vouch#readme"
    echo "  - API Docs:   http://localhost:3000/health"
    echo ""
    echo "Happy coding! 🚀"
    echo ""
}

# Main setup function
main() {
    echo ""
    echo "========================================"
    echo "  Vouch Development Setup"
    echo "========================================"
    echo ""
    
    check_prerequisites
    install_pnpm
    install_dependencies
    setup_environment
    start_infrastructure
    setup_database
    build_packages
    setup_webhook_forwarding
    print_instructions
}

# Run main function
main "$@"
