# Test Suite Documentation

This directory contains comprehensive unit tests for the Eirvana API endpoints. The test suite covers registration, login, and waitlist functionality with both positive and negative test cases.

## Test Files

### 1. `setup.ts`
- Common test utilities and setup functions
- Database reset functionality for clean test state
- Test data factories for consistent test data generation

### 2. `registration.test.ts`
Tests for `/api/register` endpoint:
- ✅ Successful user registration
- ✅ Email field alternative to username
- ✅ Username normalization (lowercase, trimming)
- ✅ Input validation (missing fields, invalid data)
- ✅ Duplicate user prevention
- ✅ Password hashing verification
- ✅ Malformed JSON handling

### 3. `login.test.ts`
Tests for `/api/login` endpoint:
- ✅ Successful login with valid credentials
- ✅ Email/username field flexibility
- ✅ Case insensitive username handling
- ✅ Input validation (missing credentials)
- ✅ Security (consistent error messages)
- ✅ Multiple login attempts
- ✅ Password verification

### 4. `waitlist.test.ts`
Tests for `/api/waitlist` endpoint:
- ✅ Successful waitlist registration
- ✅ Optional interests field handling
- ✅ Email validation and uniqueness
- ✅ Name field validation
- ✅ Special characters and long text support
- ✅ Unique ID generation
- ✅ Duplicate email prevention

## Running Tests

```bash
# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run with coverage report
npm run test:coverage
```

## Test Coverage

The test suite covers:
- **API endpoint functionality** (32 tests)
- **Input validation** with Zod schemas
- **Error handling** and edge cases
- **Security aspects** (password hashing, consistent error messages)
- **Data persistence** using in-memory storage for tests

## Test Environment

- **Framework**: Vitest
- **HTTP Testing**: Supertest
- **Database**: In-memory storage (MemStorage) for isolated tests
- **Validation**: Zod schemas with comprehensive validation rules

## Schema Validation Rules

### User Registration
- Username: Required, valid email format
- Password: Required, minimum 6 characters

### Waitlist Registration  
- Name: Required, non-empty string
- Email: Required, valid email format, unique
- Interests: Optional string field

## Best Practices

1. **Test Isolation**: Each test starts with a clean database state
2. **Comprehensive Coverage**: Both positive and negative test cases
3. **Security Testing**: Consistent error messages, password protection
4. **Edge Cases**: Special characters, long text, malformed data
5. **Real-world Scenarios**: Duplicate registrations, multiple logins