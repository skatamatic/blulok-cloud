# BluLok Cloud Infrastructure on Google Cloud Platform
terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 4.0"
    }
  }
}

# Variables
variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# Provider configuration
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "sql-component.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "redis.googleapis.com"
  ])

  service = each.value
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy        = false
}

# Cloud SQL instance
resource "google_sql_database_instance" "main" {
  name             = "blulok-mysql-${var.environment}"
  database_version = "MYSQL_8_0"
  region          = var.region
  
  settings {
    tier              = "db-f1-micro"  # Adjust for production
    availability_type = "ZONAL"       # Use "REGIONAL" for production
    disk_size         = 20
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      binary_log_enabled            = true
      backup_retention_settings {
        retained_backups = 7
      }
    }
    
    ip_configuration {
      ipv4_enabled    = true
      authorized_networks {
        value = "0.0.0.0/0"  # Restrict this in production
        name  = "all"
      }
    }
    
    database_flags {
      name  = "sql_mode"
      value = "STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO"
    }
  }

  deletion_protection = true  # Set to false for dev/test environments

  depends_on = [google_project_service.apis]
}

# Cloud SQL database
resource "google_sql_database" "database" {
  name     = "blulok_${var.environment}"
  instance = google_sql_database_instance.main.name
}

# Cloud SQL user
resource "google_sql_user" "user" {
  name     = "blulok_user"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# Random password for database
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Secret for database password
resource "google_secret_manager_secret" "db_password" {
  secret_id = "blulok-db-password"
  
  replication {
    automatic = true
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

# JWT Secret
resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "blulok-jwt-secret"
  
  replication {
    automatic = true
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

# Redis instance for caching
resource "google_redis_instance" "cache" {
  name           = "blulok-redis-${var.environment}"
  memory_size_gb = 1
  region         = var.region
  tier           = "BASIC"
  
  redis_version = "REDIS_6_X"
  
  depends_on = [google_project_service.apis]
}

# Cloud Build trigger
resource "google_cloudbuild_trigger" "main" {
  name        = "blulok-deploy-${var.environment}"
  description = "Deploy BluLok Cloud application"

  github {
    owner = "your-github-username"  # Update this
    name  = "blulok-cloud"          # Update this
    push {
      branch = var.environment == "prod" ? "main" : var.environment
    }
  }

  filename = "cloudbuild.yaml"

  substitutions = {
    _REGION               = var.region
    _SQL_CONNECTION_NAME  = google_sql_database_instance.main.connection_name
    _DB_NAME             = google_sql_database.database.name
    _DB_USER             = google_sql_user.user.name
    _DB_PASSWORD_SECRET  = google_secret_manager_secret.db_password.secret_id
    _JWT_SECRET          = google_secret_manager_secret.jwt_secret.secret_id
  }

  depends_on = [google_project_service.apis]
}

# Outputs
output "database_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "database_ip" {
  value = google_sql_database_instance.main.ip_address.0.ip_address
}

output "redis_host" {
  value = google_redis_instance.cache.host
}

output "redis_port" {
  value = google_redis_instance.cache.port
}
