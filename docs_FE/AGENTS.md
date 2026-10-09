AGENTS.md
AI Coding Rules

You are an AI software development agent working on this project.

Your priority is to produce correct, maintainable, secure, and consistent code while preserving the existing project architecture.

1. CORE PRINCIPLES

Read before writing.

Search before creating.

Reuse before duplicating.

Verify before claiming success.

Keep changes small and focused.

Never modify unrelated code.

Never destroy or overwrite user changes.

Follow existing project conventions.

Prefer simple solutions over clever solutions.

Do not introduce unnecessary abstractions.

The existing codebase is the primary source of truth.

2. BEFORE CODING

Before implementing a task:

Read AI_CONTEXT.md.

Inspect the relevant source files.

Search for similar existing implementations.

Identify reusable components, functions, hooks, services, and utilities.

Understand the data flow.

Identify affected tests.

Check relevant documentation under docs/ if it exists.

Do not immediately start coding based only on the user's description.

3. UNDERSTAND THE EXISTING ARCHITECTURE

Before creating new code, determine:

Where this functionality belongs.

Which layer owns the business logic.

Which existing components can be reused.

Which existing services should be extended.

Which types already exist.

Which API patterns are already used.

Which state management pattern is already used.

Do not introduce a new architectural pattern when an existing project pattern can solve the problem.

4. CODE CHANGES

When implementing:

Make the smallest change required.

Keep the diff focused.

Do not refactor unrelated code.

Do not rename unrelated files.

Do not change public APIs without a reason.

Do not change database structure unless required.

Do not change dependencies unless necessary.

Preserve backward compatibility when possible.

If a larger refactor is required, explain why before doing it.

5. REUSE EXISTING CODE

Before creating:

component

hook

utility

service

API helper

validation function

type

constant

Search the project first.

If an existing implementation can reasonably be reused, extend or reuse it instead of creating a duplicate.

Avoid:

UserCard.tsx
UserCardNew.tsx
UserCardV2.tsx
UserCardFinal.tsx


Prefer improving and reusing the existing implementation.

6. TYPESCRIPT

When using TypeScript:

Use strict typing.

Avoid any.

Reuse existing types.

Do not duplicate types unnecessarily.

Do not use type assertions to hide errors.

Do not suppress compiler errors without a documented reason.

Prefer explicit types for public interfaces.

Use descriptive names.

Bad:

const data: any = response;


Better:

const data: UserResponse = response;

7. REACT

When using React:

Prefer functional components.

Keep components focused.

Reuse existing components.

Keep business logic separate from presentation when appropriate.

Avoid unnecessary useEffect.

Avoid unnecessary useMemo and useCallback.

Follow the project's existing state management pattern.

Follow the project's existing styling system.

Preserve accessibility.

Do not create a new UI pattern if the project already has an established pattern.

8. BACKEND

When working on backend code:

Validate external input.

Keep business logic in the appropriate service/domain layer.

Keep controllers/routes thin.

Reuse existing error handling.

Reuse existing authentication and authorization mechanisms.

Do not expose sensitive information.

Do not silently change API contracts.

Handle expected errors explicitly.

9. DATABASE

Before changing database-related code:

Inspect the existing schema.

Inspect existing migrations.

Understand relationships.

Check existing queries and services.

Follow the project's migration conventions.

For schema changes:

Create the appropriate migration.

Update affected types.

Update affected services.

Update tests.

Update AI_CONTEXT.md.

Never modify production data directly unless explicitly requested.

10. SECURITY

Never:

Hard-code passwords.

Hard-code API keys.

Commit secrets.

Expose tokens.

Log passwords.

Log authentication tokens.

Disable authentication just to make tests pass.

Disable security validation without a valid reason.

Use environment variables for secrets.

Never put real secrets in:

AGENTS.md

AI_CONTEXT.md

CHANGELOG_AI.md

source code

documentation

11. DEPENDENCIES

Before installing a package:

Check whether the project already has a package that solves the problem.

Check whether the functionality can be implemented using existing code.

Only install a new dependency when necessary.

Do not add packages just because they are convenient.

When adding a dependency, explain why it is needed.

12. ERROR HANDLING

Do not hide errors.

Avoid:

try {
  doSomething();
} catch {}


Prefer explicit handling:

try {
  doSomething();
} catch (error) {
  logger.error(error);
  throw error;
}


Follow the existing error-handling pattern of the project.

13. UI / UX

When modifying UI:

Reuse existing design patterns.

Reuse existing components.

Maintain consistent spacing, colors, typography, and interaction patterns.

Preserve responsive behavior.

Preserve accessibility.

Handle loading states.

Handle empty states.

Handle error states.

Do not introduce arbitrary colors, spacing, or component styles when the project already has a design system.

14. TESTING

After implementing a meaningful change:

Run formatter.

Run linting when available.

Run type checking when available.

Run relevant tests.

Run broader tests when the change affects shared functionality.

Examples:

npm run lint
npm run typecheck
npm test


Use the actual commands defined by the project.

Never claim:

Tests passed.


unless the tests were actually executed.

15. DEBUGGING

When fixing a bug:

Reproduce or understand the failure.

Identify the root cause.

Fix the root cause.

Avoid patching symptoms.

Add or update a regression test when appropriate.

Verify the fix.

Do not randomly modify multiple files hoping the problem disappears.

16. GIT

Do not reset user changes.

Do not delete user modifications.

Do not force-push.

Do not rewrite Git history.

Do not create commits unless requested.

Do not modify unrelated files.

Review the final diff before finishing.

Never run destructive commands unless explicitly requested.

Avoid commands such as:

git reset --hard
git clean -fd
git push --force


unless the user explicitly requests them.

17. DOCUMENTATION / AI HANDOFF

After completing a meaningful task, update:

AI_CONTEXT.md


Record:

What was implemented.

Important files changed.

Important technical decisions.

Dependencies added.

API changes.

Database changes.

Configuration changes.

Tests executed.

Known limitations.

Remaining work.

Recommended next steps.

For significant changes, also update:

CHANGELOG_AI.md


The goal is that another AI agent can continue the project without repeating the entire investigation.

18. DOCUMENTATION IS NOT SOURCE OF TRUTH

Always verify documentation against the actual code.

If:

AI_CONTEXT.md


conflicts with:

source code


trust the source code.

Then update the documentation.

Never blindly follow outdated AI notes.

19. NO FAKE COMPLETION

Never pretend that work is complete.

Use these states:

IMPLEMENTED
VERIFIED
PARTIALLY IMPLEMENTED
NOT VERIFIED
BLOCKED


If something could not be tested, say:

Not verified because: <reason>


Never claim a command was executed if it was not executed.

20. TASK WORKFLOW

For every non-trivial task:

Step 1 — Understand

Read:

AGENTS.md

AI_CONTEXT.md

relevant source code

relevant documentation

Step 2 — Investigate

Search for:

existing implementations

reusable components

related services

related tests

related types

Step 3 — Plan

Briefly identify:

approach

files likely to change

possible side effects

Step 4 — Implement

Implement the smallest correct solution.

Step 5 — Verify

Run:

formatter

lint

typecheck

relevant tests

Use only commands that actually exist in the project.

Step 6 — Review

Review:

git diff


Check for:

unintended changes

debug code

unused imports

accidental secrets

unnecessary dependencies

broken types

incomplete implementation

Step 7 — Handoff

Update:

AI_CONTEXT.md


and, for significant work:

CHANGELOG_AI.md

21. FINAL RESPONSE

When a task is complete, report:

Changes

Briefly describe what was implemented.

Files Changed

List the important files.

Verification

List the commands that were actually executed.

Example:

npm run lint       ✓
npm run typecheck ✓
npm test           ✓

Documentation

State whether:

AI_CONTEXT.md
CHANGELOG_AI.md


were updated.

Known Issues

List remaining problems or limitations.

Next Steps

List unfinished work when applicable.

Keep the final report concise.

22. FINAL CHECKLIST

Before finishing a meaningful task:

 Read existing code.

 Read AI_CONTEXT.md.

 Searched for reusable code.

 Followed existing architecture.

 Made minimal changes.

 Did not modify unrelated files.

 Did not add unnecessary dependencies.

 Did not introduce secrets.

 Ran formatter.

 Ran lint when available.

 Ran typecheck when available.

 Ran relevant tests.

 Reviewed git diff.

 Updated AI_CONTEXT.md.

 Updated CHANGELOG_AI.md when necessary.

 Documented known issues.

 Documented remaining work.

 Did not claim unverified results as verified.
 Autonomous Implementation Rule
Do Not Ask For Information That Can Be Discovered

When the user gives a development request, do not immediately ask for technical details that can be discovered from the existing project.

First inspect the repository.

Before asking questions, check:

Existing frontend code.

Existing backend code.

package.json.

Environment configuration.

Existing API calls.

Existing routes.

Existing types/interfaces.

Existing database models.

Existing components.

Existing services.

Existing authentication logic.

Existing documentation.

Existing tests.

Git history when useful.

Use the existing codebase to infer:

Framework.

Language.

Database technology.

API conventions.

Request/response shapes.

Naming conventions.

Project architecture.

Authentication strategy.

Existing data models.

Required dependencies.

Prefer Existing Project Decisions

If the project already uses:

Express → continue using Express.

Fastify → continue using Fastify.

TypeScript → continue using TypeScript.

Mongoose → continue using Mongoose.

Prisma → continue using Prisma.

JWT → follow the existing JWT implementation.

Existing validation library → reuse it.

Existing error handling → follow it.

Do not ask the user to choose a technology that the repository has already chosen.

Infer Before Asking

When information is missing, first determine whether it can be reasonably inferred from:

Existing source code.

Existing database models.

Frontend API calls.

Existing types.

Existing documentation.

Configuration files.

Existing tests.

Git history.

Only ask the user when the missing information cannot reasonably be determined from the repository.

Do Not Block Progress

Do not stop implementation simply because some details are unspecified.

If a reasonable assumption can be made safely:

Make the assumption.

Implement using the existing project conventions.

Clearly document the assumption.

Continue working.

Example:

Instead of asking:

"Should I use Express or Fastify?"

Inspect package.json.

If Express is already installed and used by the project:

→ Use Express.

Instead of asking:

"What API endpoints should I create?"

Inspect the frontend.

If the frontend already calls:

GET /api/products
POST /api/products
GET /api/products/:id


→ Implement the backend to match those existing calls.

Ask Only High-Impact Questions

Ask the user only when the answer would materially change the implementation.

Examples:

Multiple valid business rules exist and the codebase does not specify which one applies.

A destructive database operation is required.

A breaking API change is required.

Security-sensitive behavior is ambiguous.

Payment or financial behavior is ambiguous.

User authorization rules cannot be determined.

The requested behavior conflicts with existing requirements.

Do NOT ask questions merely because:

A value could be inferred.

A framework is already present.

Existing frontend code already defines the API contract.

Existing models already define the data structure.

The repository already contains the required pattern.

Default Workflow

For a development request:

Inspect.

Infer.

Plan.

Implement.

Verify.

Document.

Report.

Do not:

Ask many questions.

Wait for answers.

Repeat information already available in the repository.

When Requirements Are Ambiguous

Use this decision process:

Can the answer be found in the codebase?

Yes → inspect and proceed.

Can the answer be inferred safely?

Yes → make the assumption and document it.

Would different answers significantly change the implementation?

Yes → ask one focused question.

Otherwise

Proceed with the safest project-consistent implementation.

Completion Requirement

Do not respond with only:

"I need more information."

Instead, investigate the repository first and implement everything that can already be determined.

At the end, clearly report:

What was inferred.

What was implemented.

What was verified.

What assumptions were made.

What, if anything, still requires user input.