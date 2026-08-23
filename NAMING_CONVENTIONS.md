# AI Ticket System Naming Conventions

This document defines the naming conventions for the AI Ticket System codebase.

## Project identity

- Canonical package and project slug: `ai-ticket-system`
- Human-readable product name: `AI Ticket System`
- Use lowercase kebab-case for package, repository, and URL slugs.
- The existing workspace directory name may remain `AI_TICKETS_SYSTEM`.

## TypeScript and API

- Use `camelCase` for variables, object properties, request fields, response fields, parameters, and functions.
- Use `PascalCase` for interfaces and type aliases.
- Use `UPPER_SNAKE_CASE` for constants and environment variable names.
- Use `.js` extensions in relative imports from TypeScript source files because the project uses Node ESM and emits JavaScript.
- Use kebab-case for multi-word filenames, for example `not-found.middleware.ts` and `auth-session.repository.ts`.

## Username terminology exception

The existing username terminology is intentionally preserved.

- TypeScript/API fields use `userName`.
- Existing identifiers such as `findUserByUserName` and `existingUserName` remain unchanged.
- Database fields use `user_name`.
- Do not normalize these names to `username` unless this convention is intentionally changed later.

## Database

- Use `snake_case` for tables, columns, indexes, constraints, and migration filenames.
- Use plural table names, such as `users`, `tickets`, and `auth_sessions`.
- Keep database names separate from application names through repository mapping.
- Existing persisted column `token_hash` remains the database representation; application code uses the more explicit `refreshTokenHash` name.

## Users and IDs

- Use `DbUser` for the complete database user model, including `password_hash`.
- Use `PublicUser` for user data safe to return outside the authentication boundary.
- Use `DbUserRow` for database query rows used to construct public users.
- Use `CreateUserInput` for user-creation input.
- Use `UserId` throughout the application. It is represented as a `string` to preserve PostgreSQL `BIGSERIAL` values safely.
- Use `userId` for application properties and `user_id` for database columns.

## Authentication

- Use `login`, `LoginInput`, and `loginSchema`; do not mix `signin` and `login`.
- Use `role` consistently for signup input and persisted user role.
- Use `accessToken` and `refreshToken` for token values.
- Use `refreshTokenHash` in application code.
- Use `AuthSession` and `CreateAuthSessionInput` for session models.
- Prefix exported session repository functions with `AuthSession`, for example `createAuthSession` and `revokeAuthSessionByRefreshTokenHash`.
- Use `ACCESS_TOKEN_EXPIRES_IN_MINUTES` and `REFRESH_TOKEN_EXPIRES_IN_DAYS` for expiry configuration.
- Use `BCRYPT_SALT_ROUNDS` for password hashing configuration.
- JWT issuer and audience values use the canonical product identity: `ai-ticket-system-api` and `ai-ticket-system-web`.

## Middleware

- Use `Middleware` with a lowercase `w` in identifier names, for example `notFoundMiddleware`.
- Use descriptive handler names such as `errorHandler` and `notFoundMiddleware`.

## Allowed source-script exception

`scripts/migrate.mjs` currently imports the TypeScript environment module directly because it is a source-running migration script. Its `../src/config/env.ts` import is an intentional script-runtime exception to the `.js` import convention used by compiled TypeScript application files.

## Tooling

- Formatting is owned by Prettier (`npm run format`): single quotes, semicolons, 80-character print width, trailing commas.
- Linting is owned by oxlint (`npm run lint`). ESLint + typescript-eslint is deferred until typescript-eslint supports TypeScript >= 7 (see typescript-eslint issue #10940).
- Type-only imports should use `import type` (`consistent-type-imports`).
