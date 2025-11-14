import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createTestUser } from './setup.js'
import express from 'express'
import { registerRoutes } from '../server/routes.js'

describe('Login API', () => {
  let app: Express
  let server: any

  beforeAll(async () => {
    app = express()
    app.use(express.json())
    server = await registerRoutes(app)
  })

  afterAll(async () => {
    if (server) {
      server.close()
    }
  })

  describe('POST /api/login', () => {
    it('should successfully login with valid credentials', async () => {
      // First register a user
      const userData = createTestUser({
        username: 'logintest@example.com',
        password: 'securePassword123'
      })

      const registerResponse = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Now try to login
      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200)

      expect(loginResponse.body).toMatchObject({
        id: registerResponse.body.id,
        username: userData.username,
        message: 'Login successful'
      })
      expect(loginResponse.body).not.toHaveProperty('password')
    })

    it('should successfully login using email field', async () => {
      // Register with email field
      const userData = {
        email: 'emaillogin@example.com',
        password: 'securePassword123'
      }

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Login using email field
      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          email: userData.email,
          password: userData.password
        })
        .expect(200)

      expect(loginResponse.body).toMatchObject({
        username: userData.email,
        message: 'Login successful'
      })
    })

    it('should handle case insensitive username', async () => {
      const userData = createTestUser({
        username: 'CaseTest@Example.com',
        password: 'securePassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Login with different case
      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: 'casetest@example.com',
          password: userData.password
        })
        .expect(200)

      expect(loginResponse.body.username).toBe('casetest@example.com')
    })

    it('should return 400 for missing username', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          password: 'somepassword'
        })
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Username and password are required'
      })
    })

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: 'test@example.com'
        })
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Username and password are required'
      })
    })

    it('should return 400 for empty credentials', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: '',
          password: ''
        })
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Username and password are required'
      })
    })

    it('should return 401 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: 'nonexistent@example.com',
          password: 'anypassword'
        })
        .expect(401)

      expect(response.body).toMatchObject({
        message: 'Invalid credentials'
      })
    })

    it('should return 401 for wrong password', async () => {
      // Register a user
      const userData = createTestUser({
        username: 'wrongpass@example.com',
        password: 'correctPassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Try to login with wrong password
      const response = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: 'wrongPassword456'
        })
        .expect(401)

      expect(response.body).toMatchObject({
        message: 'Invalid credentials'
      })
    })

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/login')
        .send('invalid json')
        .expect(400)
    })

    it('should trim whitespace from username', async () => {
      const userData = createTestUser({
        username: 'trimtest@example.com',
        password: 'securePassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Login with whitespace
      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: '  trimtest@example.com  ',
          password: userData.password
        })
        .expect(200)

      expect(loginResponse.body.username).toBe('trimtest@example.com')
    })

    it('should not reveal whether user exists vs wrong password', async () => {
      // Register a user
      const userData = createTestUser({
        username: 'security@example.com',
        password: 'correctPassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Wrong password for existing user
      const wrongPasswordResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: 'wrongpassword'
        })
        .expect(401)

      // Non-existent user
      const nonExistentResponse = await request(app)
        .post('/api/login')
        .send({
          username: 'nonexistent@example.com',
          password: 'anypassword'
        })
        .expect(401)

      // Both should return the same error message
      expect(wrongPasswordResponse.body.message).toBe(nonExistentResponse.body.message)
    })

    it('should work with multiple successful logins', async () => {
      const userData = createTestUser({
        username: 'multilogin@example.com',
        password: 'securePassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Multiple login attempts should all succeed
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/login')
          .send({
            username: userData.username,
            password: userData.password
          })
          .expect(200)

        expect(response.body.message).toBe('Login successful')
      }
    })

    it('should handle very long passwords in login', async () => {
      const longPassword = 'a'.repeat(500)
      const userData = createTestUser({
        username: 'longlogin@example.com',
        password: longPassword
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: longPassword
        })
        .expect(200)

      expect(loginResponse.body.message).toBe('Login successful')
    })

    it('should handle special characters in login password', async () => {
      const specialPassword = 'P@$$w0rd!@#$%^&*()_+-=[]{}|;:,.<>?'
      const userData = createTestUser({
        username: 'speciallogin@example.com',
        password: specialPassword
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: specialPassword
        })
        .expect(200)

      expect(loginResponse.body.message).toBe('Login successful')
    })

    it('should be case sensitive for passwords', async () => {
      const userData = createTestUser({
        username: 'casepass@example.com',
        password: 'CaseSensitivePassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Wrong case should fail
      const wrongCaseResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: 'casesensitivepassword123' // lowercase
        })
        .expect(401)

      expect(wrongCaseResponse.body.message).toBe('Invalid credentials')

      // Correct case should succeed
      const correctResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200)

      expect(correctResponse.body.message).toBe('Login successful')
    })

    it('should handle concurrent login attempts', async () => {
      const userData = createTestUser({
        username: 'concurrent@example.com',
        password: 'securePassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Try multiple concurrent logins
      const loginPromises = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/login')
          .send({
            username: userData.username,
            password: userData.password
          })
      )

      const responses = await Promise.all(loginPromises)

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
        expect(response.body.message).toBe('Login successful')
      })
    })

    it('should handle login attempt with wrong password multiple times', async () => {
      const userData = createTestUser({
        username: 'bruteforce@example.com',
        password: 'correctPassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Multiple failed attempts
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/login')
          .send({
            username: userData.username,
            password: 'wrongPassword'
          })
          .expect(401)

        expect(response.body.message).toBe('Invalid credentials')
      }

      // Correct password should still work
      const correctResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200)

      expect(correctResponse.body.message).toBe('Login successful')
    })

    it('should validate request content-type for login', async () => {
      const userData = createTestUser({
        username: 'contentlogin@example.com',
        password: 'securePassword123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Send login as form data instead of JSON
      const response = await request(app)
        .post('/api/login')
        .type('form')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(400)
    })

    it('should handle international domain names in login', async () => {
      const userData = createTestUser({
        username: 'test@xn--e1afmkfd.xn--p1ai', // пример.рф in punycode
        password: 'pässwörd123'
      })

      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200)

      expect(loginResponse.body.username).toBe('test@xn--e1afmkfd.xn--p1ai')
    })

    it('should return consistent response structure', async () => {
      const userData = createTestUser({
        username: 'structure@example.com',
        password: 'securePassword123'
      })

      const registerResponse = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      const loginResponse = await request(app)
        .post('/api/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200)

      // Response should have exactly these fields
      expect(Object.keys(loginResponse.body).sort()).toEqual(['id', 'message', 'username'])
      expect(loginResponse.body.id).toBe(registerResponse.body.id)
      expect(loginResponse.body.username).toBe(userData.username)
      expect(loginResponse.body.message).toBe('Login successful')
    })
  })

  describe('Login Security Tests', () => {
    it('should not provide timing attack vulnerabilities', async () => {
      const existingUser = createTestUser({
        username: 'timing@example.com',
        password: 'securePassword123'
      })

      await request(app)
        .post('/api/register')
        .send(existingUser)
        .expect(201)

      // Time login attempt for existing user with wrong password
      const start1 = Date.now()
      await request(app)
        .post('/api/login')
        .send({
          username: existingUser.username,
          password: 'wrongpassword'
        })
        .expect(401)
      const time1 = Date.now() - start1

      // Time login attempt for non-existent user
      const start2 = Date.now()
      await request(app)
        .post('/api/login')
        .send({
          username: 'nonexistent@example.com',
          password: 'anypassword'
        })
        .expect(401)
      const time2 = Date.now() - start2

      // Response times should be similar (within reasonable margin)
      // This is a basic timing attack prevention test
      const timeDifference = Math.abs(time1 - time2)
      expect(timeDifference).toBeLessThan(50) // Allow 50ms difference
    })

    it('should not leak user existence through error messages', async () => {
      const existingUser = createTestUser({
        username: 'leaked@example.com',
        password: 'securePassword123'
      })

      await request(app)
        .post('/api/register')
        .send(existingUser)
        .expect(201)

      // Wrong password for existing user
      const wrongPasswordResponse = await request(app)
        .post('/api/login')
        .send({
          username: existingUser.username,
          password: 'wrongpassword'
        })
        .expect(401)

      // Non-existent user
      const nonExistentResponse = await request(app)
        .post('/api/login')
        .send({
          username: 'nonexistent@example.com',
          password: 'anypassword'
        })
        .expect(401)

      // Both should have identical error messages
      expect(wrongPasswordResponse.body.message).toBe(nonExistentResponse.body.message)
      expect(wrongPasswordResponse.body.message).toBe('Invalid credentials')
    })
  })

  describe('Login Edge Cases', () => {
    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({})
        .expect(400)

      expect(response.body.message).toBe('Username and password are required')
    })

    it('should handle null values', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: null,
          password: null
        })
        .expect(400)

      expect(response.body.message).toBe('Username and password are required')
    })

    it('should handle undefined values', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: undefined,
          password: undefined
        })
        .expect(400)

      expect(response.body.message).toBe('Username and password are required')
    })
  })
})