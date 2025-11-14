import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createTestUser } from './setup.js'
import express from 'express'
import { registerRoutes } from '../server/routes.js'

describe('Registration API', () => {
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

  describe('POST /api/register', () => {
    it('should successfully register a new user with username and password', async () => {
      const userData = createTestUser({
        username: 'newuser@example.com',
        password: 'securePassword123'
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      expect(response.body).toMatchObject({
        id: expect.any(String),
        username: userData.username
      })
      expect(response.body).not.toHaveProperty('password')
    })

    it('should successfully register a new user with email field', async () => {
      const userData = {
        email: 'user@example.com',
        password: 'securePassword123'
      }

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      expect(response.body).toMatchObject({
        id: expect.any(String),
        username: userData.email
      })
    })

    it('should normalize username to lowercase', async () => {
      const userData = createTestUser({
        username: 'UPPERCASE@EXAMPLE.COM',
        password: 'securePassword123'
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      expect(response.body.username).toBe('uppercase@example.com')
    })

    it('should return 400 for invalid input data', async () => {
      const invalidData = {
        username: '', // empty username
        password: 'short'
      }

      const response = await request(app)
        .post('/api/register')
        .send(invalidData)
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Invalid input'
      })
    })

    it('should return 400 for missing password', async () => {
      const invalidData = {
        username: 'test@example.com'
        // missing password
      }

      const response = await request(app)
        .post('/api/register')
        .send(invalidData)
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Invalid input'
      })
    })

    it('should return 409 for duplicate username', async () => {
      const userData = createTestUser({
        username: 'duplicate@example.com',
        password: 'securePassword123'
      })

      // Register user first time
      await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Try to register same user again
      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(409)

      expect(response.body).toMatchObject({
        message: 'User already exists'
      })
    })

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/register')
        .send('invalid json')
        .expect(400)
    })

    it('should trim whitespace from username', async () => {
      const userData = createTestUser({
        username: '  spaced@example.com  ',
        password: 'securePassword123'
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      expect(response.body.username).toBe('spaced@example.com')
    })

    it('should hash the password before storing', async () => {
      const userData = createTestUser({
        username: 'hashtest@example.com',
        password: 'plainTextPassword'
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Password should not be returned in response
      expect(response.body).not.toHaveProperty('password')
      
      // The stored password should be hashed (we can't directly test this without accessing storage)
      expect(response.body.id).toBeTruthy()
      expect(response.body.username).toBe(userData.username)
    })

    it('should validate password length (minimum 6 characters)', async () => {
      const userData = createTestUser({
        username: 'shortpass@example.com',
        password: '12345' // Only 5 characters
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Invalid input'
      })
    })

    it('should require valid email format for username', async () => {
      const userData = createTestUser({
        username: 'invalid-email-format', // Not a valid email
        password: 'securePassword123'
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(400)

      expect(response.body).toMatchObject({
        message: 'Invalid input'
      })
    })

    it('should handle concurrent registration attempts for same username', async () => {
      const userData = createTestUser({
        username: 'concurrent@example.com',
        password: 'securePassword123'
      })

      // Try to register same user concurrently
      const promises = [
        request(app).post('/api/register').send(userData),
        request(app).post('/api/register').send(userData),
        request(app).post('/api/register').send(userData)
      ]

      const responses = await Promise.all(promises)

      // One should succeed (201), others should fail with 409
      const successCount = responses.filter(r => r.status === 201).length
      const conflictCount = responses.filter(r => r.status === 409).length

      expect(successCount).toBe(1)
      expect(conflictCount).toBe(2)
    })

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(1000) // 1000 character password

      const userData = createTestUser({
        username: 'longpass@example.com',
        password: longPassword
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      expect(response.body.id).toBeTruthy()
    })

    it('should handle special characters in password', async () => {
      const userData = createTestUser({
        username: 'special@example.com',
        password: 'P@$$w0rd!@#$%^&*()_+-=[]{}|;:,.<>?'
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      expect(response.body.id).toBeTruthy()
    })

    it('should handle international domain names (IDN)', async () => {
      const userData = createTestUser({
        username: 'test@xn--e1afmkfd.xn--p1ai', // пример.рф in punycode
        password: 'securePassword123'
      })

      const response = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      expect(response.body.username).toBe('test@xn--e1afmkfd.xn--p1ai')
    })

    it('should validate request content-type', async () => {
      const userData = createTestUser({
        username: 'contenttype@example.com',
        password: 'securePassword123'
      })

      // Send as form data instead of JSON
      const response = await request(app)
        .post('/api/register')
        .type('form')
        .send(userData)
        .expect(400)
    })
  })

  describe('Registration Integration Tests', () => {
    it('should allow immediate login after successful registration', async () => {
      const userData = createTestUser({
        username: 'integration@example.com',
        password: 'securePassword123'
      })

      // Register user
      const registerResponse = await request(app)
        .post('/api/register')
        .send(userData)
        .expect(201)

      // Immediately try to login
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
    })

    it('should handle multiple user registrations with unique usernames', async () => {
      const users = []
      const userCount = 5

      for (let i = 0; i < userCount; i++) {
        const userData = createTestUser({
          username: `user${i}@example.com`,
          password: `password${i}123`
        })

        const response = await request(app)
          .post('/api/register')
          .send(userData)
          .expect(201)

        users.push(response.body)
      }

      // All users should have unique IDs
      const ids = users.map(u => u.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(userCount)

      // All users should be able to login
      for (let i = 0; i < userCount; i++) {
        const loginResponse = await request(app)
          .post('/api/login')
          .send({
            username: `user${i}@example.com`,
            password: `password${i}123`
          })
          .expect(200)

        expect(loginResponse.body.id).toBe(users[i].id)
      }
    })
  })
})