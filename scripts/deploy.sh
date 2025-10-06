#!/bin/bash

# BluLok Cloud Deployment Script for GCP
set -e

# Configuration
PROJECT_ID=""
REGION="us-central1"
ENVIRONMENT="prod"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "Google Cloud SDK is not installed. Please install it first."
        exit 1
    fi
    
    # Check if terraform is installed
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Please install it first."
        exit 1
    fi
    
    # Check if project ID is set
    if [ -z "$PROJECT_ID" ]; then
        log_error "PROJECT_ID is not set. Please update the script with your GCP project ID."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Setup GCP authentication
setup_auth() {
    log_info "Setting up GCP authentication..."
    
    gcloud auth login
    gcloud config set project $PROJECT_ID
    gcloud auth configure-docker
    
    log_success "GCP authentication configured"
}

# Deploy infrastructure with Terraform
deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."
    
    cd terraform
    
    terraform init
    terraform plan -var="project_id=$PROJECT_ID" -var="region=$REGION" -var="environment=$ENVIRONMENT"
    
    log_warning "About to deploy infrastructure. This will create billable resources."
    read -p "Continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        terraform apply -var="project_id=$PROJECT_ID" -var="region=$REGION" -var="environment=$ENVIRONMENT" -auto-approve
        log_success "Infrastructure deployed successfully"
    else
        log_info "Infrastructure deployment cancelled"
        exit 0
    fi
    
    cd ..
}

# Deploy application
deploy_application() {
    log_info "Deploying application..."
    
    # Trigger Cloud Build
    gcloud builds submit --config=cloudbuild.yaml .
    
    log_success "Application deployed successfully"
}

# Main deployment flow
main() {
    log_info "Starting BluLok Cloud deployment..."
    
    check_prerequisites
    setup_auth
    deploy_infrastructure
    deploy_application
    
    log_success "🎉 BluLok Cloud deployment completed!"
    log_info "Your application should be available at:"
    log_info "- Backend: https://blulok-backend-$REGION-$PROJECT_ID.cloudfunctions.net"
    log_info "- Frontend: https://blulok-frontend-$REGION-$PROJECT_ID.cloudfunctions.net"
}

# Run main function
main "$@"
