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
   - Copy `.env.example` to `.env` in root, backend, and frontend directories
   - Update database credentials and API keys as needed

### Running Locally

#### Backend (API Server)

1. Start the backend:
   ```bash
   cd backend
   npm run dev
   ```
   - Runs on `http://localhost:3000`
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

#### Docker Development

For full stack with database:

1. Start services:
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. Run backend and frontend in separate terminals:
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend  
   cd frontend
   npm run dev
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

**Backend (.env)**:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=blulok_dev
JWT_SECRET=your_jwt_secret
PORT=3000
```

**Frontend (.env)**:
```
VITE_API_URL=http://localhost:3000/api/v1
VITE_WS_URL=ws://localhost:3000/ws
```

#### Common Issues

1. **Database Connection Failed**:
   - Ensure MySQL is running
   - Check `.env` credentials
   - Run `npm run migrate` in backend

2. **CORS Errors**:
   - Backend runs on port 3000
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
