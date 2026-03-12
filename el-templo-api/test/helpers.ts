/**
 * Test helpers for API integration tests.
 *
 * Provides createTestApp() using the existing buildApp() factory,
 * and auth helpers for registering users and obtaining JWT tokens.
 */

import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";

/**
 * Create a Fastify test app instance connected to the eltemplo_test database.
 * Environment variables are set by vitest.config.ts env block, but we
 * reinforce the critical ones here for safety.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  process.env.DB_NAME = "eltemplo_test";
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-for-testing";

  const app = await buildApp();
  await app.ready();
  return app;
}

/**
 * Log in with email/password and return the JWT token.
 */
export async function getAuthToken(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  const body = JSON.parse(response.body);
  if (!body.token) {
    throw new Error(`Login failed for ${email}: ${response.body}`);
  }
  return body.token;
}

/**
 * Register a new user and return the token + user object.
 * Provides defaults for dni, phone, firstName, and lastName so existing
 * callers across all test files work without modification.
 */
export async function registerUser(
  app: FastifyInstance,
  data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    branchId: number;
    dni?: string;
    phone?: string;
  },
): Promise<{ token: string; user: Record<string, unknown> }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      firstName: "Test",
      lastName: "User",
      dni: `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      phone: "+5491100000000",
      ...data,
    },
  });
  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(
      `registerUser failed for ${data.email}: ${response.statusCode} ${response.body}`,
    );
  }
  return JSON.parse(response.body);
}
