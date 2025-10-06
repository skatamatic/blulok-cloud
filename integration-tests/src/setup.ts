/**
 * Integration Test Setup
 * 
 * This file sets up the test environment for integration tests
 * that test the actual frontend-backend API contracts.
 */

import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';

// Test configuration
const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

let backendProcess: ChildProcess | null = null;
let frontendProcess: ChildProcess | null = null;

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting integration test environment...');
  
  // Start backend server
  console.log('📡 Starting backend server...');
  backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd() + '/../backend',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: BACKEND_PORT.toString(),
      DB_HOST: process.env.TEST_DB_HOST || 'localhost',
      DB_PORT: process.env.TEST_DB_PORT || '3306',
      DB_USER: process.env.TEST_DB_USER || 'root',
      DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
      DB_NAME: process.env.TEST_DB_NAME || 'blulok_test',
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-for-testing-only-32-chars'
    },
    stdio: 'pipe'
  });

  // Wait for backend to be ready
  await waitForBackend();
  
  console.log('✅ Backend server ready');
}, 60000); // 60 second timeout

// Global test teardown
afterAll(async () => {
  console.log('🛑 Shutting down integration test environment...');
  
  if (backendProcess) {
    console.log('📡 Stopping backend server...');
    backendProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      backendProcess!.on('exit', () => {
        console.log('✅ Backend server stopped');
        resolve();
      });
      // Force kill after 5 seconds
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill('SIGKILL');
          resolve();
        }
      }, 5000);
    });
  }
  
  if (frontendProcess) {
    console.log('🎨 Stopping frontend server...');
    frontendProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      frontendProcess!.on('exit', () => {
        console.log('✅ Frontend server stopped');
        resolve();
      });
      // Force kill after 5 seconds
      setTimeout(() => {
        if (frontendProcess && !frontendProcess.killed) {
          frontendProcess.kill('SIGKILL');
          resolve();
        }
      }, 5000);
    });
  }
}, 10000);

/**
 * Wait for backend server to be ready
 */
async function waitForBackend(): Promise<void> {
  const maxAttempts = 30; // 30 seconds
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(`${BACKEND_URL}/health`, { timeout: 1000 });
      if (response.status === 200) {
        return;
      }
    } catch (error) {
      // Server not ready yet, wait and try again
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Backend server failed to start within ${maxAttempts} seconds`);
}

/**
 * Wait for frontend server to be ready
 */
export async function waitForFrontend(): Promise<void> {
  const maxAttempts = 30; // 30 seconds
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(`${FRONTEND_URL}`, { timeout: 1000 });
      if (response.status === 200) {
        return;
      }
    } catch (error) {
      // Server not ready yet, wait and try again
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Frontend server failed to start within ${maxAttempts} seconds`);
}

/**
 * Start frontend server for tests that need it
 */
export async function startFrontend(): Promise<void> {
  if (frontendProcess) {
    return; // Already running
  }
  
  console.log('🎨 Starting frontend server...');
  frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd() + '/../frontend',
    env: {
      ...process.env,
      VITE_API_BASE_URL: BACKEND_URL,
      PORT: FRONTEND_PORT.toString()
    },
    stdio: 'pipe'
  });
  
  await waitForFrontend();
  console.log('✅ Frontend server ready');
}

// Export configuration
export const config = {
  BACKEND_URL,
  FRONTEND_URL,
  BACKEND_PORT,
  FRONTEND_PORT
};

