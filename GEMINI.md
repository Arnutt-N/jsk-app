# Project Overview

JskApp is a modern LINE Official Account system designed for Community Justice Services. It integrates the LINE Messaging API and LIFF (LINE Frontend Framework) to provide a seamless user experience.

The project is structured as a full-stack application with a clear separation between the backend (FastAPI) and frontend (Next.js).

## Tech Stack

*   **Backend:** FastAPI (Python 3.11+), PostgreSQL, SQLAlchemy (Async), Alembic, Redis.
*   **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS.
*   **Integrations:** LINE Messaging API, LINE Login (LIFF).

## Architecture & Directory Structure

*   **`backend/`**: Contains the FastAPI application.
    *   `app/api/`: API endpoints and router configuration.
    *   `app/core/`: Application configuration and security settings.
    *   `app/db/`: Database session and base model definitions.
    *   `app/models/`: SQLAlchemy database models.
    *   `app/schemas/`: Pydantic schemas for request/response validation.
    *   `app/services/`: Business logic layer.
*   **`frontend/`**: Contains the Next.js application.
    *   `app/`: Next.js App Router pages and layouts.
    *   `components/`: Reusable React components.
    *   `lib/`: Utility functions and API clients.
*   **`.agents/`**: Contains project-specific standards and guidelines (Skills).

## Building and Running

### Backend

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment (if not already done).
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Run database migrations:
    ```bash
    alembic upgrade head
    ```
5.  Start the development server:
    ```bash
    uvicorn app.main:app --reload
    ```
    The API will be available at `http://localhost:8000`.

### Frontend

1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:3000`.

## Development Conventions

This project adheres to strict development standards defined in the `.agents/skills/` directory. Key conventions include:

*   **Async by Default:** Use `async/await` for all I/O-bound operations in the backend.
*   **Strict Typing:** Use Pydantic V2 models for data validation and schema definitions.
*   **Dependency Injection:** Utilize FastAPI's `Depends` for managing dependencies like database sessions and services.
*   **Database Interactions:** Use SQLAlchemy 2.0 style (Core expression language) for database queries.
*   **Frontend Architecture:** Follow the Next.js App Router patterns and use Tailwind CSS for styling.

Refer to the specific skill files in `.agents/skills/` for detailed guidelines on API development, security, testing, and more.
