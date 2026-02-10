# Module Development Command

Execute module development workflow for a specific service.

## Usage

```
module-dev <service-name>
```

## Available Services

- `backend` - Backend service (Node.js + Express)
- `frontend` - Frontend service (React + TypeScript)
- `market-data-service` - Market Data Service (Python + FastAPI)
- `trading-ai-service` - Trading AI Service (Python + FastAPI)
- `news-service` - News Service (Python + FastAPI)
- `miniprogram` - WeChat Mini Program (UniApp + Vue 3)

## Example

```
module-dev backend
module-dev trading-ai-service
```

## What This Command Does

1. **Project Initialization**: Run /pro-init to familiarize with the project
2. **Read Development Plan**: Read docs/modules/<service>/TODO.md
3. **Identify Next Task**: Find the next pending development entry (🔲 待开发)
4. **Switch Context**: Guide switching to the correct git worktree branch
5. **Create Execution Plan**: Analyze test requirements and acceptance criteria
6. **Wait for Instructions**: Present the plan and wait for your go-ahead

## Workflow

When you run this command:

1. The system will first initialize by reading CLAUDE.md and core documentation
2. It will then read the specific service's TODO.md from docs/modules/<service>/
3. Identify the next uncompleted task (marked as 🔲 待开发)
4. Check current git branch and guide you to the correct worktree
5. Present the task details including:
   - Task name and description
   - Test requirements (must be implemented)
   - Acceptance criteria
   - Dependencies on other modules
   - Estimated development time

After presenting the plan, the system will **wait for your explicit instructions** before proceeding with any development work.

## Development Standards

All development follows TDD (Test-Driven Development):

1. Write tests FIRST before implementation
2. All tests must pass before submission
3. Update TODO.md progress table when completing tasks
4. Commit with format: `test(<service>): [T-XXX] description`

## Service Communication

Each module's TODO.md includes communication standards:

- **Backend**: HTTP REST (3001), Redis Pub/Sub, PostgreSQL
- **Frontend**: HTTP/WebSocket via Backend (3000)
- **Market Data Service**: HTTP/WebSocket (8001), TimescaleDB, Redis
- **Trading AI Service**: HTTP (8000), PostgreSQL, Redis
- **News Service**: HTTP/WebSocket (8002), PostgreSQL, Redis
- **Miniprogram**: HTTPS via Backend API

---

## Implementation

When this command is invoked with a service name:

<$if$>

### Step 1: Project Initialization

Run /pro-init to read CLAUDE.md and familiarize with:
- Project structure and architecture
- Development standards (CODING_STANDARDS.md)
- Module collaboration plan

### Step 2: Read Service TODO

Read `docs/modules/<service>/TODO.md` to understand:
- Service responsibilities and data sovereignty
- Communication standards with other services
- Development entries with test requirements
- Current progress status

### Step 3: Identify Next Task

Parse the TODO.md to find:
- First entry marked with 🔲 待开发 (pending)
- Extract T-XXX task ID, name, and description
- Identify test requirements and acceptance criteria
- List dependencies on other modules

### Step 4: Check Git Context

Check current git branch and compare with expected worktree branch:
- backend → worktree-backend
- frontend → worktree-frontend
- market-data-service → worktree-market-data-service
- trading-ai-service → worktree-trading-ai-service
- news-service → worktree-news-service
- miniprogram → worktree-miniprogram

If not on correct branch, guide user to switch.

### Step 5: Create Execution Plan

Present a development plan including:
1. **Task Overview**: T-XXX - Task Name
2. **Description**: What needs to be implemented
3. **Test Requirements**: List of tests that must be written
4. **Acceptance Criteria**: How to verify completion
5. **Dependencies**: Other modules or tasks required
6. **Estimated Time**: Development effort estimate
7. **Checklist**: Step-by-step development workflow

### Step 6: Wait for Instructions

Explicitly state:
"I have analyzed the development plan for [service]. I am ready to begin implementation of [T-XXX], but I will wait for your explicit go-ahead before proceeding."

Then wait for user to indicate:
- "开始" / "开始开发" / "go" → Proceed with development
- Questions → Answer and continue waiting
- Modifications → Adjust plan and wait again

<$endif$>
