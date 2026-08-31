# BluLok Cloud

A secure cloud platform for managing BluLok storage facility locking systems, providing remote control capabilities for storage containers, gates, and elevator access.

## Architecture

- **Backend**: Node.js with Express, TypeScript, Knex.js for database
- **Frontend**: React with TypeScript, Tailwind CSS, Vite
- **Database**: MySQL (primary), with PostgreSQL compatibility layer
- **Real-time**: WebSocket for live updates (unit status, battery, FMS sync)
- **Deployment**: Google Cloud Platform with Docker containers
- **Testing**: Jest for unit/integration tests, Cypress for E2E
- **Key Features**: RBAC security, FMS integration, Widget-based dashboard

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 8+ or yarn
- Docker and Docker Compose (for database and services)
- MySQL 8.0+ (local development) or PostgreSQL (alternative)
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd blulok-cloud
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   cd ..
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. Set up environment variables:
   - Backend: copy `backend/env.example` to `backend/.env`
   - Frontend: copy `frontend/.env.example` to `frontend/.env`
   - Generate local security secrets:
     ```bash
     cd backend
     npm run gen:dev-secrets
     ```
     Then paste generated values into `backend/.env` for:
     - `JWT_SECRET`
     - `OPS_ED25519_PRIVATE_KEY_B64`
     - `OPS_ED25519_PUBLIC_KEY_B64`
     - `ROOT_ED25519_PUBLIC_KEY_B64`

### Running Locally

#### Backend (API Server)

1. Start the backend:
   ```bash
   cd backend
   npm run dev
   ```
   - Runs on `http://localhost:3000` by default (override with `PORT` in `backend/.env`)
   - Includes auto-reload and logging

2. Database setup (if not using Docker):
   ```bash
   # Create database
   mysql -u root -p -e "CREATE DATABASE blulok_dev;"
   
   # Run migrations and seeds
   cd backend
   npm run migrate
   npm run seed
   ```

#### Frontend (React App)

1. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```
   - Runs on `http://localhost:5173`
   - Proxies API calls to backend

#### Docker MySQL (recommended for local backend/frontend dev)

Use Docker only for MySQL, then run backend/frontend directly on your machine.

1. Start local MySQL container:
   ```bash
   npm run dev:mysql:up
   ```
   On Windows PowerShell you can bootstrap env files + MySQL in one step:
   ```powershell
   .\scripts\setup-local-dev.ps1
   ```
   If `3306` is already in use:
   ```powershell
   $env:MYSQL_HOST_PORT=3307
   npm run dev:mysql:up
   ```
   Then set `DB_PORT=3307` in `backend/.env`.

2. Initialize backend schema/data:
   ```bash
   cd backend
   npm run migrate
   npm run seed
   ```

3. Start backend:
   ```bash
   cd backend
   npm run dev
   ```

4. Start frontend:
   ```bash
   cd frontend
   npm run dev
   ```

5. Stop MySQL when done:
   ```bash
   npm run dev:mysql:down
   ```

You can tail MySQL logs with:
```bash
npm run dev:mysql:logs
```

#### Docker Full Stack

If you want backend/frontend also containerized:

```bash
docker compose -f docker-compose.dev.yml up --build
```

### Testing

#### Backend Tests

```bash
cd backend
npm test
```

- Includes unit tests, integration tests, and security audits
- Coverage reports in `backend/coverage/`

#### Frontend Tests

```bash
cd frontend
npm test
```

- React Testing Library for components
- Coverage reports in `frontend/coverage/`

#### Integration Tests

```bash
cd integration-tests
npm test
```

- End-to-end API testing with mocked frontend

### Project Structure

```
blulok-cloud/
├── backend/                    # Node.js API server
│   ├── src/                    # Source code
│   │   ├── app.ts              # Express app setup
│   │   ├── routes/             # API routes (auth, facilities, units, fms, etc.)
│   │   ├── models/             # Database models
│   │   ├── services/           # Business logic (FMS, units, websocket)
│   │   ├── middleware/         # Auth, validation, error handling
│   │   └── types/              # TypeScript definitions
│   ├── database/               # Migrations and seeds
│   ├── test/                   # Backend tests
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # React application
│   ├── src/                    # Source code
│   │   ├── components/         # UI components (widgets, FMS, auth)
│   │   ├── pages/              # Page components (dashboard, facilities)
│   │   ├── contexts/           # React contexts (auth, websocket, toast)
│   │   ├── hooks/              # Custom React hooks
│   │   ├── services/           # API clients (fms, auth, websocket)
│   │   └── types/              # TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
├── cursorDocs/                 # Project documentation
│   ├── auth.md                 # Authentication system
│   ├── database-schema.md      # Database design
│   ├── deployment.md           # GCP deployment
│   └── ui-principles.md        # Frontend design guidelines
├── docker/                     # Docker configurations
│   ├── mysql/                  # MySQL initialization
│   └── nginx/                  # Nginx reverse proxy
├── integration-tests/          # E2E tests
│   ├── src/                    # Test files and mocks
│   └── package.json
├── scripts/                    # Utility scripts
│   ├── deploy.sh               # GCP deployment
│   └── dev-setup.sh            # Local setup helper
├── terraform/                  # Infrastructure as Code
├── package.json                # Root dependencies (if any)
├── docker-compose.dev.yml      # Development Docker setup
└── README.md
```

### Key Features

#### FMS Integration (Facility Management System)

- **Simulated Provider**: For development and demo (configurable via DevTools)
- **StorEdge Provider**: Real integration with StorEdge API
- **REST Custom Provider**: Generic REST API integration
- **Sync Process**: Detects tenant/unit changes, shows approval modal
- **RBAC**: Admin, DevAdmin, FacilityAdmin only
- **WebSocket**: Real-time sync status updates

#### Security & RBAC

- **Role-Based Access Control**: Tenant, Admin, FacilityAdmin, Maintenance, DevAdmin
- **JWT Authentication**: Secure token-based auth
- **Facility Scoping**: FacilityAdmins limited to assigned facilities
- **Input Validation**: Joi schemas for all API endpoints
- **Audit Logging**: All security actions logged

#### Real-time Features

- **WebSocket Subscriptions**: Units, battery status, FMS sync, general stats
- **Widget Dashboard**: Drag-and-drop, resizable widgets
- **Live Updates**: Battery levels, unit status, access logs

### Local Development Notes

#### Database

- Default: MySQL `blulok_dev` database
- Auto-creates database if missing
- Essential seeds run automatically (users, device types)
- Comprehensive test data via `npm run seed:comprehensive` in backend

#### Environment Variables

**Backend (`backend/.env`)**:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=blulok_user
DB_PASSWORD=blulok_password
DB_NAME=blulok_dev
JWT_SECRET=<generated secure value>
OPS_ED25519_PRIVATE_KEY_B64=<generated secure value>
OPS_ED25519_PUBLIC_KEY_B64=<generated secure value>
ROOT_ED25519_PUBLIC_KEY_B64=<generated secure value>
PORT=3000
```

**Frontend (`frontend/.env`)**:
```
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

#### Common Issues

1. **Database Connection Failed**:
   - Ensure MySQL is running
   - Check `.env` credentials
   - Run `npm run migrate` in backend

2. **CORS Errors**:
   - Backend runs on the port in `backend/.env` (`PORT`, default local dev `3000`)
   - Frontend proxies to `/api`
   - Ensure `VITE_API_URL` is correct

3. **WebSocket Not Connecting**:
   - Check `VITE_WS_URL`
   - Ensure backend is running
   - Browser console for connection errors

4. **FMS Not Working**:
   - Enable simulated provider in DevTools (localStorage: `fms-simulated-enabled=true`)
   - Configure FMS in Facility Details for a facility
   - Check backend logs for provider registration

### BluDesign Storage Providers

BluDesign supports multiple storage providers for asset files. Configure storage when creating or updating a BluDesign project.

#### Local Storage (Development)

Default provider for local development:
- Files stored in `./storage/bludesign/` (configurable)
- **Note**: Ephemeral in Cloud Run - files are lost on container restart
- **Configuration**:
  ```json
  {
    "type": "local",
    "config": {
      "basePath": "./storage/bludesign"
    }
  }
  ```

#### Google Cloud Storage (GCS) - Recommended for Production

Persistent object storage on GCP:
- Files stored in GCS buckets
- Supports signed URLs for private access
- Public URLs for public buckets
- **Setup**:
  1. Create a GCS bucket in your GCP project
  2. Create a service account with Storage Admin role
  3. Download service account JSON key file
  4. **Configuration**:
     ```json
     {
       "type": "gcs",
       "config": {
         "bucketName": "your-bucket-name",
         "projectId": "your-gcp-project-id",
         "keyFilePath": "/path/to/service-account-key.json",
         "publicBucket": false
       }
     }
     ```
  - Alternative: Use `keyFileContents` (JSON string) instead of `keyFilePath`
  - For Cloud Run: Use Workload Identity or store key in Secret Manager

#### Google Drive - Free Alternative

Store files in Google Drive folders:
- Free storage (15GB per Google account)
- OAuth2 authentication required
- **Setup**:
  1. Create OAuth2 credentials in Google Cloud Console:
     - Go to APIs & Services > Credentials
     - Create OAuth 2.0 Client ID (Web application)
     - Add authorized redirect URI: `urn:ietf:wg:oauth:2.0:oob`
  2. Create a Google Drive folder for BluDesign assets
  3. Get folder ID from folder URL: `drive.google.com/drive/folders/[FOLDER_ID]`
  4. **OAuth Flow**:
     - Use `/api/v1/bludesign/storage/gdrive/auth-url` to get authorization URL
     - Complete OAuth flow in browser
     - Exchange authorization code for tokens via `/api/v1/bludesign/storage/gdrive/callback`
  5. **Configuration**:
     ```json
     {
       "type": "gdrive",
       "config": {
         "clientId": "your-client-id.apps.googleusercontent.com",
         "clientSecret": "your-client-secret",
         "rootFolderId": "your-folder-id",
         "accessToken": "oauth-access-token",
         "refreshToken": "oauth-refresh-token"
       }
     }
     ```
  - Tokens are automatically refreshed when expired
  - Store tokens securely (encrypted in production)

#### Testing Storage Configuration

Test storage provider connection:
```bash
# Via API
POST /api/v1/bludesign/storage/{provider}/test
{
  "storageConfig": { ... }
}

# Via frontend
Navigate to BluDesign Configuration > Storage Configuration
Click "Test Connection" button
```

#### Switching Providers

- Switching providers does NOT migrate existing files
- New files go to the new provider
- Old files remain in the original provider
- Consider manual migration if needed

### Deployment

1. **Build**:
   ```bash
   # Backend
   cd backend
   npm run build
   
   # Frontend
   cd ../frontend
   npm run build
   ```

2. **Docker Production**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **GCP Deployment**:
   ```bash
   ./scripts/deploy.sh
   ```
