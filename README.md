# CodeSync Frontend

CodeSync is an advanced collaborative coding platform. This repository contains the frontend client application built with **Angular 21**, **TypeScript**, and **Monaco Editor**. It connects to a Spring Boot microservices backend via an API Gateway and utilizes WebSockets (STOMP/SockJS) for real-time collaborative editing.

##  Technologies Used

- **Framework:** [Angular 21](https://angular.io/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Code Editor:** [Monaco Editor](https://microsoft.github.io/monaco-editor/) (The editor that powers VS Code)
- **WebSockets:** [STOMP.js](https://stomp-js.github.io/) & [SockJS](https://github.com/sockjs/sockjs-client)
- **Styling:** Vanilla CSS / SCSS
- **Testing:** [Vitest](https://vitest.dev/)
- **Containerization:** Docker

##  Prerequisites

Before you begin, ensure you have the following installed on your local machine:
- **Node.js** (v20 or higher recommended)
- **npm** (v11.x or higher)
- **Angular CLI** (`npm install -g @angular/cli`)

You must also have the **CodeSync Backend Microservices** running either locally via Docker Compose or deployed on a remote server, as the frontend relies on the API Gateway for authentication, file management, and code execution.

##  Local Development Setup

Follow these steps to run the frontend application locally:

### 1. Clone the repository
If you haven't already, clone the repository and navigate to the frontend directory:
```bash
git clone <repository-url>
cd frontend
```

### 2. Install Dependencies
Install all required npm packages:
```bash
npm install
```

### 3. Configure Environment Variables
Locate the `src/environments/` folder. Ensure the backend API URL is pointing to your API Gateway.
- **Development:** `environment.ts` usually points to `http://localhost:8080` (or your remote API Gateway URL).
- **Production:** `environment.prod.ts` points to your production domain or EC2 IP.

### 4. Start the Development Server
Run the Angular development server:
```bash
npm start
```
*Alternatively, you can run `ng serve`.*

Open your browser and navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

##  Building for Production

To build the project for a production environment, run:

```bash
npm run build
```
This command compiles the Angular application into an output directory (usually `dist/codesync-frontend/`). The build artifacts will be optimized, minified, and ready for deployment to any static hosting service (e.g., Nginx, AWS S3, Vercel).

##  Running with Docker

This project includes a `Dockerfile` for containerized deployment.

**To build the Docker image:**
```bash
docker build -t codesync-frontend:latest .
```

**To run the Docker container:**
```bash
docker run -d -p 80:80 codesync-frontend:latest
```
*Note: In production, the frontend is typically orchestrated alongside the backend using the main `docker-compose.yml` file.*

##  Running Unit Tests

The frontend uses Vitest for blazing-fast unit testing.
To execute the unit tests, run:
```bash
npm run test
```

##  Code Quality (SonarQube)

This project integrates with SonarQube for static code analysis.
If you have a SonarQube server running, you can execute the scanner via:
```bash
npm run sonar
```
*(Requires `sonar-scanner` to be configured in your environment).*

##  Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit your changes (`git commit -m 'Add some amazing feature'`)
3. Push to the branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request
