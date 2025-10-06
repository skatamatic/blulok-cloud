#!/bin/bash

# BluLok Cloud GCP Project Setup Script
set -e

# Configuration
PROJECT_ID=""
BILLING_ACCOUNT=""
REGION="us-central1"

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

# Check if required variables are set
check_config() {
    if [ -z "$PROJECT_ID" ]; then
        log_error "PROJECT_ID is not set. Please update the script."
        exit 1
    fi
    
    if [ -z "$BILLING_ACCOUNT" ]; then
        log_warning "BILLING_ACCOUNT is not set. You'll need to link billing manually."
    fi
}

# Create GCP project
create_project() {
    log_info "Creating GCP project: $PROJECT_ID"
    
    if gcloud projects describe $PROJECT_ID &>/dev/null; then
        log_warning "Project $PROJECT_ID already exists"
    else
        gcloud projects create $PROJECT_ID
        log_success "Project created successfully"
    fi
    
    # Set as current project
    gcloud config set project $PROJECT_ID
    
    # Link billing account if provided
    if [ ! -z "$BILLING_ACCOUNT" ]; then
        log_info "Linking billing account..."
        gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT
        log_success "Billing account linked"
    fi
}

# Enable required APIs
enable_apis() {
    log_info "Enabling required APIs..."
    
    local apis=(
        "cloudbuild.googleapis.com"
        "run.googleapis.com"
        "sql-component.googleapis.com"
        "sqladmin.googleapis.com"
        "secretmanager.googleapis.com"
        "cloudresourcemanager.googleapis.com"
        "iam.googleapis.com"
        "redis.googleapis.com"
        "compute.googleapis.com"
        "container.googleapis.com"
        "containerregistry.googleapis.com"
    )
    
    for api in "${apis[@]}"; do
        log_info "Enabling $api..."
        gcloud services enable $api
    done
    
    log_success "All APIs enabled"
}

# Create service account for Cloud Build
create_service_account() {
    log_info "Creating service account for Cloud Build..."
    
    local sa_name="blulok-cloudbuild"
    local sa_email="$sa_name@$PROJECT_ID.iam.gserviceaccount.com"
    
    # Create service account
    if gcloud iam service-accounts describe $sa_email &>/dev/null; then
        log_warning "Service account already exists"
    else
        gcloud iam service-accounts create $sa_name \
            --display-name="BluLok Cloud Build Service Account" \
            --description="Service account for BluLok Cloud Build operations"
        log_success "Service account created"
    fi
    
    # Grant necessary roles
    local roles=(
        "roles/cloudbuild.builds.builder"
        "roles/run.admin"
        "roles/cloudsql.admin"
        "roles/secretmanager.admin"
        "roles/storage.admin"
        "roles/iam.serviceAccountUser"
    )
    
    for role in "${roles[@]}"; do
        log_info "Granting role: $role"
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$sa_email" \
            --role="$role"
    done
    
    log_success "Service account configured"
}

# Set up Cloud Build GitHub connection
setup_github_connection() {
    log_info "Setting up GitHub connection for Cloud Build..."
    log_warning "You'll need to manually connect your GitHub repository in the Cloud Console:"
    log_info "1. Go to https://console.cloud.google.com/cloud-build/triggers"
    log_info "2. Click 'Connect Repository'"
    log_info "3. Select GitHub and authorize access"
    log_info "4. Select your BluLok repository"
}

# Create initial secrets
create_secrets() {
    log_info "Creating initial secrets..."
    
    # Generate JWT secret
    local jwt_secret=$(openssl rand -base64 64)
    
    # Create secrets
    echo $jwt_secret | gcloud secrets create blulok-jwt-secret --data-file=-
    
    log_success "Initial secrets created"
    log_warning "You'll need to create the database password secret manually after infrastructure deployment"
}

# Main setup function
main() {
    log_info "Starting BluLok Cloud GCP setup..."
    
    check_config
    create_project
    enable_apis
    create_service_account
    create_secrets
    setup_github_connection
    
    log_success "🎉 GCP project setup completed!"
    log_info "Next steps:"
    log_info "1. Connect your GitHub repository in Cloud Console"
    log_info "2. Update terraform/main.tf with your GitHub repository details"
    log_info "3. Run './scripts/deploy.sh' to deploy the infrastructure and application"
}

# Show usage if no arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0"
    echo "Please edit the script and set PROJECT_ID and BILLING_ACCOUNT variables"
    exit 1
fi

# Run main function
main "$@"
