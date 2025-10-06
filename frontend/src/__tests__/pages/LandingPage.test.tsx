import { render, screen } from '@testing-library/react';
import LandingPage from '../../pages/LandingPage';

describe('LandingPage', () => {
  it('renders the main heading', () => {
    render(<LandingPage />);
    
    expect(screen.getByText('Secure Storage')).toBeInTheDocument();
    expect(screen.getByText('Management')).toBeInTheDocument();
  });

  it('renders the BluLok Cloud brand', () => {
    render(<LandingPage />);
    
    expect(screen.getByText('BluLok Cloud')).toBeInTheDocument();
  });

  it('renders the main description', () => {
    render(<LandingPage />);
    
    expect(screen.getByText(/Advanced cloud platform for managing BluLok storage facility/)).toBeInTheDocument();
  });

  it('renders call-to-action links', () => {
    render(<LandingPage />);
    
    expect(screen.getByRole('link', { name: 'Get Started' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('renders features section', () => {
    render(<LandingPage />);
    
    expect(screen.getByText('Enterprise Security & Control')).toBeInTheDocument();
    expect(screen.getByText('Advanced Security')).toBeInTheDocument();
    expect(screen.getByText('Remote Control')).toBeInTheDocument();
    expect(screen.getByText('Cloud Infrastructure')).toBeInTheDocument();
    expect(screen.getByText('Real-time Analytics')).toBeInTheDocument();
  });

  it('renders feature descriptions', () => {
    render(<LandingPage />);
    
    expect(screen.getByText(/End-to-end encryption, multi-factor authentication/)).toBeInTheDocument();
    expect(screen.getByText(/Manage storage containers, gates, and elevator access remotely/)).toBeInTheDocument();
    expect(screen.getByText(/Scalable cloud architecture built on Google Cloud Platform/)).toBeInTheDocument();
    expect(screen.getByText(/Comprehensive reporting and analytics dashboard/)).toBeInTheDocument();
  });
});
