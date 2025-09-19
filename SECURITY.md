# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please help us by reporting it responsibly.

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Email security reports to: mahzzangg@gmail.com
3. Include the following information:
   - A clear description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact and severity
   - Any suggested fixes or mitigations
   - Your contact information for follow-up

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 24 hours
- **Investigation**: We'll investigate and provide regular updates
- **Resolution**: We'll work on a fix and coordinate disclosure
- **Credit**: We'll credit you (if desired) once the issue is resolved

### Scope

This security policy applies to:
- Backend API (Node.js/Express)
- Frontend React application
- Smart contracts (Solidity)
- AI service (Python)
- Infrastructure and deployment scripts

### Out of Scope

- Third-party dependencies (report to respective maintainers)
- Browser extensions or client-side security in user browsers
- Physical security of infrastructure
- Social engineering attacks

## Security Best Practices

### For Contributors
- Never commit sensitive data (API keys, passwords, etc.)
- Use environment variables for configuration
- Follow the principle of least privilege
- Keep dependencies updated
- Write tests for security-critical code

### For Users
- Use strong, unique passwords
- Enable two-factor authentication where available
- Keep your software and dependencies updated
- Use HTTPS when accessing the application
- Be cautious with wallet private keys and seed phrases

## Security Measures

This project implements several security measures:

- **Input Validation**: All user inputs are validated and sanitized
- **Authentication**: JWT-based authentication with secure token handling
- **Authorization**: Role-based access control (RBAC)
- **Encryption**: Sensitive data is encrypted at rest and in transit
- **Rate Limiting**: API endpoints are protected against abuse
- **Audit Logging**: Security events are logged for monitoring
- **Dependency Scanning**: Automated vulnerability scanning
- **Code Review**: All changes require security review

## Contact

For security-related questions or concerns:
- Email: mahzzangg@gmail.com
- Response Time: Within 24 hours

Thank you for helping keep our project secure!
