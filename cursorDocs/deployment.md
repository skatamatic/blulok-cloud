# BluLok Cloud Deployment Guide

## Overview

BluLok Cloud is designed for production deployment on Google Cloud Platform (GCP) using containerized microservices. This guide covers the complete deployment process from local development to production scaling.

## Architecture Overview

### Deployment Strategy

```
Production Architecture:
┌─────────────────────────────────────────────────────────────┐
│                    Google Cloud Platform                    │
├─────────────────────────────────────────────────────────────┤
│  Cloud Run (Frontend)     │  Cloud Run (Backend)           │
│  ├─ Nginx + React         │  ├─ Node.js + Express          │
│  ├─ Static Assets         │  ├─ JWT Authentication         │
│  └─ SSL Termination       │  └─ API Endpoints              │
├─────────────────────────────────────────────────────────────┤
│  Cloud SQL (MySQL)        │  Secret Manager                │
│  ├─ User Data             │  ├─ JWT Secrets                │
│  ├─ Facility Data         │  ├─ Database Passwords         │
│  ├─ Device Data           │  └─ API Keys                   │
│  └─ Access Logs           │                                │
├─────────────────────────────────────────────────────────────┤
│  Cloud Build              │  Container Registry            │
│  ├─ CI/CD Pipeline        │  ├─ Docker Images              │
│  ├─ Automated Testing     │  └─ Version Management         │
│  └─ Multi-env Deployment  │                                │
└─────────────────────────────────────────────────────────────┘
```

## Docker Configuration

### Development Environment

**docker-compose.dev.yml** - Local development with hot reloading:

```yaml
version: '3.8'
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DB_HOST=mysql
    depends_on:
      mysql:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3001:3001"
    volumes:
      - ./frontend:/app
      - /app/node_modules

  mysql:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=rootpassword
      - MYSQL_DATABASE=blulok_dev
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10
```

**Key Features:**
- **Hot Reloading**: Code changes reflected immediately
- **Volume Mounts**: Source code mounted for development
- **Health Checks**: Ensures database is ready before starting app
- **Network Isolation**: Services communicate via Docker network

### Production Environment

**docker-compose.prod.yml** - Production deployment:

```yaml
version: '3.8'
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
      - DB_HOST=${DB_HOST}
      - JWT_SECRET=${JWT_SECRET}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
      args:
        - VITE_API_URL=${VITE_API_URL}
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./docker/nginx/ssl:/etc/nginx/ssl
    restart: unless-stopped
```

## Docker Images

### Backend Dockerfile (Development)

**backend/Dockerfile.dev:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

EXPOSE 3000

# Start with hot reloading
CMD ["npm", "run", "dev"]
```

### Backend Dockerfile (Production)

**backend/Dockerfile.prod:**
```dockerfile
# Multi-stage build for optimization
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S backend -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=backend:nodejs /app/dist ./dist
COPY --from=builder --chown=backend:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=backend:nodejs /app/package*.json ./

# Create logs directory
RUN mkdir -p logs && chown backend:nodejs logs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Switch to non-root user
USER backend

EXPOSE 3000

# Start application
CMD ["npm", "start"]
```

**Key Features:**
- **Multi-stage Build**: Smaller production image
- **Security**: Non-root user execution
- **Health Checks**: Container health monitoring
- **Optimized Layers**: Better Docker caching

### Frontend Dockerfile (Production)

**frontend/Dockerfile.prod:**
```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS production

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Security: non-root user
RUN adduser -D -s /bin/sh nginx-user
RUN chown -R nginx-user:nginx-user /usr/share/nginx/html

USER nginx-user

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

## Google Cloud Platform Deployment

### Prerequisites

**Required Tools:**
```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Install Terraform (optional but recommended)
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
sudo apt-get update && sudo apt-get install terraform
```

**GCP Services to Enable:**
```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com \
  redis.googleapis.com
```

### Infrastructure Setup with Terraform

**terraform/main.tf:**
```hcl
# Cloud SQL instance
resource "google_sql_database_instance" "main" {
  name             = "blulok-mysql-${var.environment}"
  database_version = "MYSQL_8_0"
  region          = var.region
  
  settings {
    tier              = "db-f1-micro"  # Adjust for production
    availability_type = "REGIONAL"     # High availability
    disk_size         = 20
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      binary_log_enabled            = true
    }
    
    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.vpc.id
    }
  }
}

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "blulok-vpc-${var.environment}"
  auto_create_subnetworks = false
}

# Redis instance for caching
resource "google_redis_instance" "cache" {
  name           = "blulok-redis-${var.environment}"
  memory_size_gb = 1
  region         = var.region
  tier           = "STANDARD_HA"  # High availability
}
```

### Secret Management

**Create Secrets:**
```bash
# Database password
echo -n "your-secure-db-password" | gcloud secrets create blulok-db-password --data-file=-

# JWT secret
openssl rand -base64 64 | gcloud secrets create blulok-jwt-secret --data-file=-

# API keys
echo -n "your-api-key" | gcloud secrets create blulok-api-key --data-file=-
```

**Access Secrets in Cloud Run:**
```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        key: blulok-db-password
        version: latest
```

## CI/CD Pipeline with Cloud Build

### Cloud Build Configuration

**cloudbuild.yaml:**
```yaml
steps:
  # Run tests
  - name: 'node:18'
    entrypoint: 'npm'
    args: ['ci']
    dir: 'backend'

  - name: 'node:18'
    entrypoint: 'npm'
    args: ['test']
    dir: 'backend'

  # Build backend image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/blulok-backend:$BUILD_ID'
      - '-t'
      - 'gcr.io/$PROJECT_ID/blulok-backend:latest'
      - '-f'
      - 'backend/Dockerfile.prod'
      - './backend'

  # Build frontend image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/blulok-frontend:$BUILD_ID'
      - '--build-arg'
      - 'VITE_API_URL=${_API_URL}'
      - '-f'
      - 'frontend/Dockerfile.prod'
      - './frontend'

  # Push images
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/blulok-backend:$BUILD_ID']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/blulok-frontend:$BUILD_ID']

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'blulok-backend'
      - '--image'
      - 'gcr.io/$PROJECT_ID/blulok-backend:$BUILD_ID'
      - '--region'
      - '${_REGION}'
      - '--set-env-vars'
      - 'NODE_ENV=production'
      - '--set-secrets'
      - 'DB_PASSWORD=blulok-db-password:latest,JWT_SECRET=blulok-jwt-secret:latest'

substitutions:
  _REGION: 'us-central1'
  _API_URL: 'https://blulok-backend-${_REGION}-${PROJECT_ID}.run.app'

timeout: '1200s'
```

### Deployment Pipeline Stages

1. **Build Stage**: 
   - Install dependencies
   - Run linting and type checking
   - Execute unit tests
   - Build production artifacts

2. **Test Stage**:
   - Run integration tests
   - Security scanning
   - Vulnerability assessment

3. **Package Stage**:
   - Build Docker images
   - Tag with build ID and latest
   - Push to Container Registry

4. **Deploy Stage**:
   - Deploy to Cloud Run
   - Update environment variables
   - Run database migrations
   - Health check verification

## Environment Management

### Environment Variables

**Development (.env):**
```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=blulok_dev
DB_USER=developer
DB_PASSWORD=mobile
JWT_SECRET=dev-jwt-secret-minimum-32-characters
CORS_ORIGINS=http://localhost:3001
LOG_LEVEL=debug
```

**Production (Cloud Run):**
```env
NODE_ENV=production
PORT=8080
DB_HOST=/cloudsql/PROJECT:REGION:INSTANCE
DB_NAME=blulok_prod
DB_USER=blulok_user
# DB_PASSWORD from Secret Manager
# JWT_SECRET from Secret Manager
CORS_ORIGINS=https://blulok.com,https://app.blulok.com
LOG_LEVEL=info
```

### Secret Management Strategy

**Development Secrets:**
- Stored in `.env` files (gitignored)
- Simple passwords acceptable
- Local database credentials

**Production Secrets:**
- Google Secret Manager
- Rotated regularly
- Audit logging enabled
- Version controlled

## Database Deployment

### Cloud SQL Setup

**1. Create Cloud SQL Instance:**
```bash
gcloud sql instances create blulok-mysql-prod \
  --database-version=MYSQL_8_0 \
  --region=us-central1 \
  --tier=db-n1-standard-2 \
  --storage-size=100GB \
  --storage-type=SSD \
  --backup-start-time=03:00 \
  --enable-bin-log \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=04
```

**2. Create Database and User:**
```bash
# Create database
gcloud sql databases create blulok_prod --instance=blulok-mysql-prod

# Create user
gcloud sql users create blulok_user \
  --instance=blulok-mysql-prod \
  --password=SECURE_PASSWORD
```

**3. Configure SSL:**
```bash
# Create SSL certificates
gcloud sql ssl-certs create blulok-client-cert \
  --instance=blulok-mysql-prod

# Download certificates
gcloud sql ssl-certs describe blulok-client-cert \
  --instance=blulok-mysql-prod \
  --format="value(cert)" > client-cert.pem
```

### Migration Deployment

**Automated Migration on Deploy:**
```typescript
// src/index.ts
async function bootstrap(): Promise<void> {
  try {
    await dbService.initialize();
    
    // Run migrations automatically
    await MigrationService.runMigrations();
    
    // Start server
    const app = createApp();
    app.listen(config.port);
  } catch (error) {
    logger.error('Bootstrap failed:', error);
    process.exit(1);
  }
}
```

**Manual Migration Commands:**
```bash
# Connect to Cloud SQL and run migrations
gcloud sql connect blulok-mysql-prod --user=blulok_user
# Then run: npm run migrate
```

## Container Registry & Image Management

### Building Images

**Local Build:**
```bash
# Build backend
docker build -t gcr.io/PROJECT_ID/blulok-backend:latest -f backend/Dockerfile.prod ./backend

# Build frontend
docker build -t gcr.io/PROJECT_ID/blulok-frontend:latest \
  --build-arg VITE_API_URL=https://api.blulok.com \
  -f frontend/Dockerfile.prod ./frontend
```

**Push to Registry:**
```bash
# Configure Docker for GCP
gcloud auth configure-docker

# Push images
docker push gcr.io/PROJECT_ID/blulok-backend:latest
docker push gcr.io/PROJECT_ID/blulok-frontend:latest
```

### Image Optimization

**Multi-stage Builds:**
- **Stage 1**: Build dependencies and compile
- **Stage 2**: Production runtime with minimal dependencies
- **Result**: 60-80% smaller images

**Layer Caching:**
- Copy package.json first for dependency caching
- Copy source code last to maximize cache hits
- Use .dockerignore to exclude unnecessary files

**Security Scanning:**
```bash
# Scan images for vulnerabilities
gcloud container images scan gcr.io/PROJECT_ID/blulok-backend:latest
```

## Cloud Run Deployment

### Service Configuration

**Backend Service:**
```bash
gcloud run deploy blulok-backend \
  --image=gcr.io/PROJECT_ID/blulok-backend:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --max-instances=100 \
  --concurrency=80 \
  --set-env-vars="NODE_ENV=production,DB_HOST=/cloudsql/PROJECT:REGION:INSTANCE" \
  --set-secrets="DB_PASSWORD=blulok-db-password:latest,JWT_SECRET=blulok-jwt-secret:latest" \
  --add-cloudsql-instances=PROJECT:REGION:INSTANCE
```

**Frontend Service:**
```bash
gcloud run deploy blulok-frontend \
  --image=gcr.io/PROJECT_ID/blulok-frontend:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --max-instances=50 \
  --concurrency=100
```

### Auto-scaling Configuration

**Traffic-based Scaling:**
- **Min Instances**: 1 (always warm)
- **Max Instances**: 100 (prevent cost overrun)
- **Concurrency**: 80 requests per instance
- **CPU Target**: 60% utilization

**Custom Metrics:**
- Response time < 500ms
- Error rate < 1%
- Memory usage < 80%

## Networking & Security

### VPC Configuration

**Private Network:**
```bash
# Create VPC
gcloud compute networks create blulok-vpc \
  --subnet-mode=custom

# Create subnet
gcloud compute networks subnets create blulok-subnet \
  --network=blulok-vpc \
  --range=10.1.0.0/16 \
  --region=us-central1
```

**Cloud NAT:**
```bash
# Create NAT gateway for outbound traffic
gcloud compute routers create blulok-router \
  --network=blulok-vpc \
  --region=us-central1

gcloud compute routers nats create blulok-nat \
  --router=blulok-router \
  --region=us-central1 \
  --nat-all-subnet-ip-ranges \
  --auto-allocate-nat-external-ips
```

### SSL/TLS Configuration

**Managed SSL Certificates:**
```bash
# Create managed certificate
gcloud compute ssl-certificates create blulok-ssl-cert \
  --domains=blulok.com,app.blulok.com

# Create load balancer with SSL
gcloud compute url-maps create blulok-lb \
  --default-service=blulok-backend-service
```

**Custom Domain Setup:**
```bash
# Map custom domain
gcloud run domain-mappings create \
  --service=blulok-frontend \
  --domain=app.blulok.com \
  --region=us-central1
```

## Monitoring & Logging

### Cloud Monitoring Setup

**Custom Metrics:**
```typescript
// Application metrics
import { Monitoring } from '@google-cloud/monitoring';

const monitoring = new Monitoring.MetricServiceClient();

// Track login attempts
await monitoring.createTimeSeries({
  name: monitoring.projectPath(projectId),
  timeSeries: [{
    metric: {
      type: 'custom.googleapis.com/blulok/login_attempts',
      labels: { result: 'success' }
    },
    points: [{ value: { int64Value: 1 }, interval: { endTime: now } }]
  }]
});
```

**Alerting Policies:**
```bash
# High error rate alert
gcloud alpha monitoring policies create \
  --policy-from-file=monitoring/error-rate-policy.yaml

# Database connection alert
gcloud alpha monitoring policies create \
  --policy-from-file=monitoring/db-connection-policy.yaml
```

### Centralized Logging

**Structured Logging:**
```typescript
// Winston configuration for GCP
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.printf(info => {
      return JSON.stringify({
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
        service: 'blulok-backend',
        trace: process.env.CLOUD_TRACE_CONTEXT,
        ...info
      });
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});
```

**Log Analysis:**
```bash
# View logs
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=blulok-backend" \
  --limit=50 \
  --format=json

# Create log-based metrics
gcloud logging metrics create login_failures \
  --description="Failed login attempts" \
  --log-filter='resource.type="cloud_run_revision" AND jsonPayload.level="error" AND jsonPayload.message:"Login attempt"'
```

## Deployment Scripts

### Automated Deployment Script

**scripts/deploy.sh:**
```bash
#!/bin/bash
set -e

PROJECT_ID="your-gcp-project"
REGION="us-central1"
ENVIRONMENT="prod"

echo "🚀 Starting BluLok Cloud deployment..."

# Build and push images
echo "📦 Building Docker images..."
docker build -t gcr.io/$PROJECT_ID/blulok-backend:$BUILD_ID -f backend/Dockerfile.prod ./backend
docker build -t gcr.io/$PROJECT_ID/blulok-frontend:$BUILD_ID -f frontend/Dockerfile.prod ./frontend

echo "⬆️ Pushing images to registry..."
docker push gcr.io/$PROJECT_ID/blulok-backend:$BUILD_ID
docker push gcr.io/$PROJECT_ID/blulok-frontend:$BUILD_ID

# Deploy services
echo "🌐 Deploying to Cloud Run..."
gcloud run deploy blulok-backend \
  --image=gcr.io/$PROJECT_ID/blulok-backend:$BUILD_ID \
  --region=$REGION \
  --set-secrets="DB_PASSWORD=blulok-db-password:latest"

gcloud run deploy blulok-frontend \
  --image=gcr.io/$PROJECT_ID/blulok-frontend:$BUILD_ID \
  --region=$REGION

echo "✅ Deployment completed!"
```

### Environment-Specific Deployments

**Development Deployment:**
```bash
# Deploy to dev environment
./scripts/deploy.sh dev

# Environment variables:
# - Relaxed security settings
# - Debug logging enabled
# - Test data seeding
```

**Staging Deployment:**
```bash
# Deploy to staging environment
./scripts/deploy.sh staging

# Environment variables:
# - Production-like settings
# - Anonymized production data
# - Performance testing enabled
```

**Production Deployment:**
```bash
# Deploy to production environment
./scripts/deploy.sh prod

# Environment variables:
# - Maximum security settings
# - Error-level logging only
# - No test data seeding
```

## Performance Optimization

### Container Optimization

**Resource Allocation:**
```yaml
# Cloud Run service configuration
resources:
  limits:
    cpu: "1000m"      # 1 vCPU
    memory: "1Gi"     # 1 GB RAM
  requests:
    cpu: "100m"       # 0.1 vCPU minimum
    memory: "256Mi"   # 256 MB minimum
```

**Connection Pooling:**
```typescript
// Knex connection pool for Cloud SQL
const knex = require('knex')({
  client: 'mysql2',
  connection: {
    socketPath: '/cloudsql/PROJECT:REGION:INSTANCE',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  pool: {
    min: 1,
    max: 5,  // Limit for Cloud Run
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
  },
});
```

### CDN & Caching

**Cloud CDN Setup:**
```bash
# Create backend service
gcloud compute backend-services create blulok-backend-service \
  --global \
  --enable-cdn \
  --cache-mode=CACHE_ALL_STATIC

# Configure cache policies
gcloud compute backend-services update blulok-backend-service \
  --global \
  --custom-response-header="Cache-Control: public, max-age=3600"
```

**Redis Caching:**
```typescript
// Application-level caching
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// Cache user sessions
await redis.setex(`user:${userId}`, 3600, JSON.stringify(userData));
```

## Security Configuration

### Network Security

**Private Google Access:**
- Cloud SQL on private IP
- Cloud Run with VPC connector
- No public database access

**Firewall Rules:**
```bash
# Allow Cloud Run to Cloud SQL
gcloud compute firewall-rules create allow-cloud-run-to-sql \
  --network=blulok-vpc \
  --allow=tcp:3306 \
  --source-ranges=10.1.0.0/16 \
  --target-tags=cloudsql
```

### Application Security

**Container Security:**
- Non-root user execution
- Minimal base images (Alpine)
- Regular security updates
- Vulnerability scanning

**Runtime Security:**
- Environment variable encryption
- Secret rotation
- Audit logging
- Rate limiting

## Monitoring & Alerting

### Health Checks

**Application Health:**
```typescript
// Comprehensive health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: await checkDatabaseHealth(),
    redis: await checkRedisHealth(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version,
  };
  
  const isHealthy = health.database && health.redis;
  res.status(isHealthy ? 200 : 503).json(health);
});
```

**Infrastructure Monitoring:**
```bash
# Create uptime check
gcloud monitoring uptime-check-configs create \
  --display-name="BluLok Backend Health" \
  --http-check-path="/health" \
  --http-check-port=443 \
  --monitored-resource-type="url" \
  --monitored-resource-labels="host=api.blulok.com"
```

### Error Tracking

**Error Reporting:**
```typescript
import { ErrorReporting } from '@google-cloud/error-reporting';

const errors = new ErrorReporting();

// Report errors to Cloud Error Reporting
process.on('uncaughtException', (error) => {
  errors.report(error);
  process.exit(1);
});
```

**Custom Alerts:**
```yaml
# Alert policy for high error rate
alertPolicy:
  displayName: "High Error Rate"
  conditions:
    - displayName: "Error rate > 5%"
      conditionThreshold:
        filter: 'resource.type="cloud_run_revision"'
        comparison: COMPARISON_GREATER_THAN
        thresholdValue: 0.05
  notificationChannels:
    - "projects/PROJECT_ID/notificationChannels/CHANNEL_ID"
```

## Scaling & Performance

### Auto-scaling Configuration

**Horizontal Scaling:**
```yaml
# Cloud Run auto-scaling
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "100"
        autoscaling.knative.dev/target: "70"
```

**Database Scaling:**
```bash
# Scale Cloud SQL instance
gcloud sql instances patch blulok-mysql-prod \
  --tier=db-n1-standard-4 \
  --storage-size=200GB
```

### Load Testing

**Artillery.io Configuration:**
```yaml
# load-test.yml
config:
  target: 'https://api.blulok.com'
  phases:
    - duration: 300
      arrivalRate: 10
      rampTo: 50

scenarios:
  - name: "Login and Dashboard"
    flow:
      - post:
          url: "/api/v1/auth/login"
          json:
            email: "test@example.com"
            password: "Test123!@#"
      - get:
          url: "/api/v1/users"
          headers:
            Authorization: "Bearer {{ token }}"
```

## Disaster Recovery

### Backup Strategy

**Database Backups:**
- **Automated**: Daily backups with 30-day retention
- **Point-in-time**: Recovery to any second within 7 days
- **Cross-region**: Backups replicated to secondary region

**Application Backups:**
- **Container Images**: Tagged and stored in Container Registry
- **Configuration**: Infrastructure as Code with Terraform
- **Secrets**: Backed up in Secret Manager with versioning

### Recovery Procedures

**Database Recovery:**
```bash
# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --restore-instance=blulok-mysql-prod-restored

# Point-in-time recovery
gcloud sql instances clone blulok-mysql-prod blulok-mysql-recovered \
  --point-in-time=2023-12-01T10:30:00Z
```

**Application Recovery:**
```bash
# Rollback to previous version
gcloud run deploy blulok-backend \
  --image=gcr.io/PROJECT_ID/blulok-backend:PREVIOUS_BUILD_ID \
  --region=us-central1

# Scale up instances
gcloud run services update blulok-backend \
  --region=us-central1 \
  --min-instances=5
```

## Cost Optimization

### Resource Management

**Cloud Run Optimization:**
- **CPU Allocation**: Only during request processing
- **Memory Sizing**: Right-size based on actual usage
- **Request Timeout**: Optimize for typical request duration
- **Concurrency**: Balance between throughput and memory

**Database Optimization:**
- **Instance Sizing**: Start small, scale based on metrics
- **Storage**: Use SSD for performance, standard for archives
- **Backup Retention**: Balance compliance with cost
- **Read Replicas**: Only when read traffic justifies cost

### Monitoring Costs

**Budget Alerts:**
```bash
# Create budget alert
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="BluLok Cloud Budget" \
  --budget-amount=1000USD \
  --threshold-rule=percent=80,basis=CURRENT_SPEND
```

**Cost Analysis:**
- **Cloud Run**: Pay per request, optimize cold starts
- **Cloud SQL**: Fixed cost, optimize instance size
- **Container Registry**: Storage cost, clean old images
- **Networking**: Minimize egress traffic

## Development Workflow

### Local Development

```bash
# Start local environment
npm run dev                    # Both frontend and backend
npm run docker:dev            # Full Docker environment

# Database operations
npm run db:init               # Create database
npm run migrate               # Run migrations
npm run seed                  # Add development data
```

### Testing Pipeline

```bash
# Run tests locally
npm test                      # All tests
npm run test:backend         # Backend only
npm run test:frontend        # Frontend only

# Integration testing
npm run test:integration     # API integration tests
npm run test:e2e            # End-to-end tests
```

### Deployment Pipeline

```bash
# Deploy to staging
git push origin develop      # Triggers staging deployment

# Deploy to production
git push origin main         # Triggers production deployment

# Manual deployment
./scripts/deploy.sh prod     # Direct production deployment
```

## Troubleshooting

### Common Issues

**"Service not accessible"**
- Check Cloud Run service status
- Verify firewall rules
- Confirm SSL certificate status

**"Database connection failed"**
- Verify Cloud SQL instance status
- Check VPC connector configuration
- Confirm secret values

**"Build failures"**
- Review Cloud Build logs
- Check Dockerfile syntax
- Verify base image availability

**"High latency"**
- Check database query performance
- Review Cloud Run cold starts
- Analyze network latency

### Debug Commands

```bash
# Check service logs
gcloud run services logs read blulok-backend --region=us-central1

# Check build logs
gcloud builds log BUILD_ID

# Test connectivity
gcloud run services proxy blulok-backend --port=8080

# Database debugging
gcloud sql connect blulok-mysql-prod --user=blulok_user
```

This comprehensive deployment guide ensures reliable, secure, and scalable deployment of BluLok Cloud to Google Cloud Platform.
