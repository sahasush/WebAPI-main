# API Security Guide

This document explains how to securely integrate with the Eirvana API endpoints.

## Security Measures Implemented

### 1. API Key Authentication
All public endpoints (`/api/register`, `/api/waitlist`) now require a valid API key in the request headers.

**Required Header:**
```
x-api-key: your-api-key-here
```

### 2. Origin Validation
Requests are validated against allowed origins to prevent unauthorized domains from accessing your API.

**Allowed Origins (configured in environment):**
- `http://localhost:3000` (development)
- `http://localhost:5173` (Vite development)
- `https://yourdomain.com` (production)

### 3. Rate Limiting
- **Register endpoint**: 5 requests per hour per IP address
- **Waitlist endpoint**: 10 requests per hour per IP address
- **Authenticated endpoints**: 100 requests per 15 minutes per user

### 4. CORS Configuration
Cross-Origin Resource Sharing is configured to only allow requests from your specified domains.

## Frontend Integration

### Environment Variables
Add these to your frontend app's environment variables:

```bash
# Frontend .env file
VITE_API_URL=http://localhost:4000
VITE_API_KEY=dev-api-key-123456789
```

### Example Integration Code

#### React/Vite Integration
```javascript
// api.js
const API_URL = import.meta.env.VITE_API_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

const apiCall = async (endpoint, options = {}) => {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }
  
  return response.json();
};

// Registration
export const registerUser = async (userData) => {
  return apiCall('/api/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
};

// Waitlist signup
export const joinWaitlist = async (waitlistData) => {
  return apiCall('/api/waitlist', {
    method: 'POST',
    body: JSON.stringify(waitlistData),
  });
};

// Authenticated requests
export const getProfile = async (token) => {
  return apiCall('/api/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
};
```

#### Next.js Integration
```javascript
// lib/api.js
const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

export class ApiClient {
  constructor() {
    this.baseURL = API_URL;
    this.apiKey = API_KEY;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  // Public endpoints
  async register(userData) {
    return this.request('/api/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async joinWaitlist(waitlistData) {
    return this.request('/api/waitlist', {
      method: 'POST',
      body: JSON.stringify(waitlistData),
    });
  }

  // Authenticated endpoints
  async getProfile(token) {
    return this.request('/api/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }
}

export const api = new ApiClient();
```

## Environment Configuration

### Development (.env)
```bash
API_KEY=dev-api-key-123456789
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

### Production (.env)
```bash
API_KEY=your-production-api-key-make-it-strong-and-random
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
JWT_SECRET=your-production-jwt-secret-make-it-very-long-and-random
```

## Security Best Practices

### 1. API Key Management
- **Never commit API keys to version control**
- Use environment variables in production
- Rotate API keys regularly
- Use different keys for development and production

### 2. Error Handling
```javascript
try {
  const result = await api.register(userData);
  // Handle success
} catch (error) {
  if (error.message === 'API key required') {
    // Handle missing API key
  } else if (error.message === 'Rate limit exceeded') {
    // Handle rate limiting
  } else {
    // Handle other errors
  }
}
```

### 3. Rate Limit Handling
```javascript
const handleRateLimit = async (apiCall, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      if (error.message.includes('Rate limit exceeded') && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
};
```

## Testing

### Valid Request
```bash
curl -X POST http://localhost:4000/api/waitlist \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-123456789" \
  -d '{"name": "Test User", "email": "test@example.com", "interests": "testing"}'
```

### Invalid Request (should fail)
```bash
curl -X POST http://localhost:4000/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com", "interests": "testing"}'
```

## Troubleshooting

### Common Errors

1. **"API key required"**
   - Ensure you're sending the `x-api-key` header
   - Check that the API key is not empty

2. **"Invalid API key"**
   - Verify the API key matches the server configuration
   - Check environment variables are loaded correctly

3. **"Origin not allowed"**
   - Verify your domain is in the ALLOWED_ORIGINS list
   - Check CORS configuration

4. **"Rate limit exceeded"**
   - Implement exponential backoff in your requests
   - Consider caching responses to reduce API calls

## Migration Guide

If you have existing frontend code, you'll need to:

1. Add the API key to all public endpoint requests
2. Update environment variables
3. Add error handling for new security responses
4. Test thoroughly in development before deploying

The authenticated endpoints (`/api/me`, etc.) work the same way but now have the additional API key requirement for consistency.