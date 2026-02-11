# Bilibili Video Parser

[中文文档](./README_CH.md) | English

A comprehensive TypeScript-based solution for parsing Bilibili video URLs and converting video content to structured Markdown documents with AI-powered note organization capabilities.

## Overview

This project provides a complete workflow for working with Bilibili videos:
1. **Parse** various Bilibili URL formats (including short links)
2. **Convert** video content to Markdown using Alibaba Cloud Tingwu transcription service
3. **Organize** transcribed content into structured notes using AI services
4. **Download** organized notes individually or in batch
5. **Manage** generated content in a Vue-based web interface (notes, drafts, task progress, and settings)

The project includes both a REST API backend and a Vue 3 frontend app. The backend can still be consumed by any API tool or custom client.

## Key Features

### Video Parsing
- Support for multiple Bilibili URL formats:
  - Standard video URLs: `https://www.bilibili.com/video/BV...`
  - Short links: `https://b23.tv/...`
  - Mobile URLs and other variants
- Automatic URL normalization and validation
- RESTful API endpoint for programmatic access

### Video-to-Markdown Conversion
- Automated transcription using Alibaba Cloud Tingwu
- Automatic video upload to Aliyun OSS
- Asynchronous task processing with status tracking
- Batch download support (ZIP format)
- Automatic cleanup of temporary files

### AI-Powered Notes Organization
- Integration with external AI services (OpenAI, Claude, etc.)
- Customizable prompts for different note-taking styles
- Structured output with clear hierarchy
- Error handling with detailed feedback
- Secure API key management

### API Features
- RESTful endpoints for video parsing and summarization
- Structured JSON error responses with stage-aware error codes
- CORS support for cross-origin API access
- Health check endpoint for monitoring

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [API Endpoints](#api-endpoints)
- [Development](#development)
- [Docker Deployment](#docker-deployment)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [License](#license)

## Requirements

### System Requirements
- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **Operating System**: Windows, macOS, or Linux

### External Services (Optional)
For video-to-Markdown conversion, you'll need:
- **Alibaba Cloud Tingwu** account with API access
- **Aliyun OSS** bucket for video storage
- **AI Service** (OpenAI, Claude, etc.) for notes organization

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bilibili-video-parser
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- Express.js for the web server
- TypeScript for type safety
- Alibaba Cloud SDKs for Tingwu and OSS
- Archiver for ZIP file creation

### 3. Environment Configuration

Create a `.env` file in the project root by copying the example:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000
CORS_ORIGIN=http://localhost:3000

# Bilibili API (Optional - improves parsing)
SESSDATA=your_bilibili_sessdata_cookie

# Alibaba Cloud Tingwu (Required for video conversion)
TINGWU_APP_KEY=your_tingwu_app_key

# Aliyun OSS (Required for video conversion)
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your_bucket_name
OSS_REGION=oss-cn-hangzhou
```

### 4. Start the Application

**Development Mode** (with hot reload):
```bash
npm run dev
```

This starts the Express API server on `http://localhost:3000`.

To run the Vue frontend in development:

```bash
cd frontend-vue
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` by default and proxies `/api` requests to the backend (configured in `frontend-vue/vite.config.ts`).
If you run backend and frontend separately, change one of the ports first.

**Production Mode**:
```bash
npm run build
node dist/web/server/index.js
```

The API will be available at `http://localhost:3000`.

To build frontend assets for static serving by Express:

```bash
cd frontend-vue
npm run build
```

If `frontend-vue/dist/index.html` exists, the backend serves the frontend build automatically.

## Docker Deployment

The repository includes a multi-stage `Dockerfile` and a ready-to-use `docker-compose.yml`.

### 1. Prepare environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill the required keys (for parsing only, minimal config is enough; for transcription and AI notes, set Tingwu/OSS/API settings too).

### 2. Build and start with Docker Compose

```bash
docker compose up -d --build
```

After startup:
- Web app and API: `http://localhost:3000`
- Health check: `http://localhost:3000/health`

### 3. Useful commands

```bash
# View logs
docker compose logs -f app

# Stop containers
docker compose down

# Rebuild after code updates
docker compose up -d --build
```

### 4. Data persistence

`docker-compose.yml` maps local folders to the container:
- `./data` -> `/app/data` (notes, drafts, settings, task records)
- `./temp` -> `/app/temp` (temporary files)

So data remains after container restart/recreate.

## Configuration

### Basic Mode (Parse Only)

For basic URL parsing functionality, you only need:
- `PORT`: Server port (default: 3000)
- `CORS_ORIGIN`: Allowed origin for CORS (default: http://localhost:3000)
- `SESSDATA`: (Optional) Bilibili session cookie for improved parsing

### Full Mode (Parse + Convert + AI)

For complete functionality including video conversion and AI notes:

#### Bilibili Configuration
- `SESSDATA`: Your Bilibili session cookie
  - Login to bilibili.com
  - Open browser DevTools → Application → Cookies
  - Copy the `SESSDATA` value

#### Tingwu Configuration
- `TINGWU_APP_KEY`: Your Tingwu application key
  - Register at [Alibaba Cloud Tingwu](https://tingwu.aliyun.com/)
  - Create an application
  - Copy the App Key

#### Aliyun OSS Configuration
- `ALIYUN_ACCESS_KEY_ID`: Your Aliyun Access Key ID
- `ALIYUN_ACCESS_KEY_SECRET`: Your Aliyun Access Key Secret
- `OSS_BUCKET`: Your OSS bucket name
- `OSS_REGION`: OSS region (e.g., oss-cn-hangzhou)

To obtain Aliyun credentials:
1. Login to [Aliyun Console](https://ram.console.aliyun.com/)
2. Navigate to AccessKey Management
3. Create a new AccessKey pair
4. Create an OSS bucket in your desired region

#### AI Service Configuration
AI configuration (apiUrl, apiKey, prompt) is provided per-request in the `/api/summarize` endpoint body.

## Usage

### API Endpoints

The API now includes note lifecycle and settings management in addition to parsing and summarization.

#### Parse Video URL

```http
POST /api/parse
Content-Type: application/json

{
  "url": "https://www.bilibili.com/video/BV1xx411c7XD"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "bvid": "BV1xx411c7XD",
    "title": "Video Title",
    "duration": 1234,
    "streams": [...]
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "stage": "server",
    "code": "MISSING_URL",
    "message": "Request body must contain a non-empty \"url\" field"
  }
}
```

#### Summarize Video

```http
POST /api/summarize
Content-Type: application/json

{
  "url": "https://www.bilibili.com/video/BV1xx411c7XD",
  "apiUrl": "https://api.openai.com/v1/chat/completions",
  "apiKey": "sk-...",
  "prompt": "Organize this content..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "title": "Video Title",
    "summary": "# Organized Notes\n\n...",
    "markdown": "# Original Markdown\n\n..."
  }
}
```

**Error Response (400/500):**
```json
{
  "success": false,
  "error": {
    "stage": "validate",
    "code": "MISSING_URL",
    "message": "Request body must contain a non-empty \"url\" field"
  }
}
```

#### Health Check

```http
GET /health
```

**Response (200):**
```json
{
  "status": "ok"
}
```

#### Additional Endpoint Groups

- `POST /api/notes/generate`: Start async note generation task
- `GET /api/tasks/:taskId`: Check task status and progress
- `GET/POST/PUT/DELETE /api/notes`: Manage saved notes
- `GET/POST/PUT/DELETE /api/drafts`: Manage drafts and publish to notes
- `GET/PUT /api/settings/models`: Manage model provider configuration
- `GET/PUT /api/settings/prompts`: Manage prompt templates
- `GET/PUT /api/settings/integrations`: Manage OSS, Tingwu, and Jina Reader integration settings

## Troubleshooting

### Video Conversion Issues

#### Problem: Conversion fails immediately
**Symptoms:**
- Task status shows "failed"
- Error message appears

**Solutions:**
1. Check `.env` file has all required variables:
   - TINGWU_APP_KEY
   - ALIYUN_ACCESS_KEY_ID
   - ALIYUN_ACCESS_KEY_SECRET
   - OSS_BUCKET
   - OSS_REGION
2. Verify Aliyun credentials are valid
3. Check OSS bucket exists and is accessible
4. Ensure Tingwu service is enabled
5. Check server logs for detailed error messages

#### Problem: Conversion stuck at "uploading"
**Symptoms:**
- Progress bar stops at upload stage
- No error message

**Solutions:**
1. Check internet connection speed
2. Verify OSS bucket permissions (write access)
3. Check if video file is too large (>2GB may fail)
4. Restart the server and try again
5. Check OSS console for failed uploads

#### Problem: Conversion stuck at "transcribing"
**Symptoms:**
- Upload completes but transcription doesn't start
- Status remains "transcribing" for hours

**Solutions:**
1. Tingwu may be processing (can take 10-30 minutes)
2. Check Tingwu console for task status
3. Verify Tingwu service quota hasn't been exceeded
4. Check if video format is supported
5. Try with a shorter video first

### URL Parsing Issues

#### Problem: "Invalid URL" error
**Symptoms:**
- Parse button doesn't work
- Error message about URL format

**Solutions:**
1. Ensure URL is from bilibili.com or b23.tv
2. Copy the full URL from browser address bar
3. Remove any extra characters or spaces
4. Try the mobile URL format
5. Check if video is available (not deleted/private)

#### Problem: Parsed video has no play URL
**Symptoms:**
- Video info appears but no playable URL
- Cannot start conversion

**Solutions:**
1. Add SESSDATA to `.env` file
2. Video may require login to access
3. Video may be region-restricted
4. Try a different video to test
5. Check if video is still available on Bilibili

### Server Issues

#### Problem: Server won't start
**Symptoms:**
- `npm run dev` fails
- Port already in use error

**Solutions:**
1. Check if port 3000 is already in use
   ```bash
   # Windows
   netstat -ano | findstr :3000
   # Kill the process using the port
   taskkill /PID <process_id> /F
   ```
2. Change PORT in `.env` file
3. Check for syntax errors in code
4. Delete `node_modules` and run `npm install` again
5. Check Node.js version (must be >= 18)

#### Problem: CORS errors
**Symptoms:**
- API requests fail with CORS error
- "Access-Control-Allow-Origin" error

**Solutions:**
1. Check CORS_ORIGIN in `.env` matches your client URL
2. Restart the server after changing `.env`
3. Try accessing from the correct origin

### General Debugging

#### Enable Detailed Logging
Add to your `.env`:
```env
NODE_ENV=development
DEBUG=*
```

#### Check Server Logs
Server logs show detailed error information:
- API request/response details
- Tingwu API responses
- OSS upload progress
- Error stack traces

#### Common Error Codes
- `400`: Bad request (check input data)
- `401`: Unauthorized (check API keys)
- `403`: Forbidden (check permissions)
- `404`: Not found (check URL/endpoint)
- `429`: Rate limit exceeded (wait and retry)
- `500`: Server error (check server logs)
- `503`: Service unavailable (check external services)



## Development

### Available Scripts

```bash
# Build TypeScript project only
npm run build
# Compiles TypeScript source files from src/ to dist/
# Generates type definitions (.d.ts files)
# Output: dist/ directory with compiled JavaScript

# Type checking only (no compilation)
npm run typecheck
# Runs TypeScript compiler in check mode
# Reports type errors without generating files
# Useful for CI/CD pipelines

# Clean build artifacts
npm run clean
# Removes the dist/ directory
# Use before fresh builds

# Start API server (Express + tsx, with hot reload)
npm run dev
# Express: http://localhost:3000
```

### Development Workflow

1. **Make code changes** in `src/` or `web/server/`
2. **Start dev mode** with `npm run dev`
3. **API auto-restarts** when backend files change (`tsx`)
4. **Run typecheck** with `npm run typecheck` before committing

### Adding New Features

#### Adding a New API Endpoint

1. Create route handler in `web/server/routes/`
2. Register route in `web/server/index.ts`
3. Add TypeScript types in `src/types.ts`
4. Update API documentation in README

#### Adding a New Service

1. Create service file in `web/server/services/`
2. Implement service logic with proper error handling
3. Add unit tests (if applicable)
4. Import and use in route handlers

### Code Style Guidelines

- Use **TypeScript** for type safety
- Follow **async/await** pattern for asynchronous code
- Implement proper **error handling** with try-catch
- Add **JSDoc comments** for public APIs
- Use **meaningful variable names**
- Keep functions **small and focused**
- Validate **user inputs** on the server

### Testing

Tests are custom TypeScript test programs executed via `tsx`:

```bash
# Run individual test files
npx tsx web/server/routes/summarize.test.ts
npx tsx web/server/services/summary-pipeline.test.ts
npx tsx web/server/services/pipeline-utils.test.ts
npx tsx web/server/services/ai-organizer.test.ts
```

The project uses `fast-check` for property-based testing alongside manual assertion-style unit tests.

## Project Structure

```text
bilibili-video-parser/
│
├── src/                          # Core parser library
│   ├── config.ts                 # Configuration management
│   ├── extractor.ts              # Video info extraction
│   ├── http-client.ts            # HTTP request handling
│   ├── index.ts                  # Main entry point
│   ├── metadata-fetcher.ts       # Video metadata fetching
│   ├── normalizer.ts             # URL normalization
│   ├── parser.ts                 # Main parser logic
│   ├── playurl-fetcher.ts        # Play URL fetching
│   ├── serializer.ts             # Data serialization
│   ├── synthesizer.ts            # Data synthesis
│   └── types.ts                  # TypeScript type definitions
│
├── web/                          # Web application
│   └── server/                   # Backend API server
│       ├── routes/               # API route handlers
│       ├── services/             # Business logic services
│       │   ├── ai-organizer.ts         # AI notes organization
│       │   ├── config-loader.ts        # Config file loading
│       │   ├── file-cleaner.ts         # Temp file cleanup
│       │   ├── markdown-generator.ts   # Markdown generation
│       │   ├── oss-uploader.ts         # OSS upload handling
│       │   ├── pipeline-utils.ts       # Pipeline utility functions
│       │   ├── summary-pipeline.ts     # Unified summary pipeline
│       │   └── tingwu-client.ts        # Tingwu API client
│       ├── middleware/           # Express middleware
│       │   └── cors.ts                 # CORS configuration
│       ├── utils/                # Utility functions
│       │   └── error-messages.ts       # Error handling
│       ├── config.ts             # Server configuration
│       └── index.ts              # Server entry point
│
├── frontend-vue/                 # Vue 3 frontend (Vite + TypeScript)
│   ├── src/                      # Frontend source code
│   ├── dist/                     # Frontend build output (generated)
│   ├── package.json              # Frontend dependencies and scripts
│   └── vite.config.ts            # Dev server and proxy configuration
│
├── dist/                         # Compiled output (generated)
├── node_modules/                 # Dependencies (generated)
├── temp/                         # Temporary files (runtime)
│
├── .dockerignore                 # Docker ignore rules
├── .env                          # Environment variables (create from .env.example)
├── .env.example                  # Environment template
├── .gitignore                    # Git ignore rules
├── Dockerfile                    # Docker configuration
├── package.json                  # Project dependencies
├── package-lock.json             # Dependency lock file
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

### Key Directories

- **src/**: Core parsing library, can be used independently
- **web/server/**: Backend API, runs on Node.js
- **web/server/services/**: Business logic, separated from routes
- **web/server/routes/**: API endpoints, thin controllers
- **frontend-vue/**: Vue frontend for creating, editing, and managing notes
- **dist/**: Compiled JavaScript (git-ignored)
- **temp/**: Temporary video files (git-ignored)

## Security

### Environment Variables

- **Never commit** `.env` file to version control
- `.env` is listed in `.gitignore` by default
- Use `.env.example` as a template without real credentials
- Rotate credentials regularly
- Use different credentials for development and production

### API Keys

#### Bilibili SESSDATA
- Obtained from browser cookies after login
- Provides access to user-specific content
- Expires periodically (re-login required)
- **Risk**: Low (read-only access to your account)

#### Aliyun Credentials
- Access Key ID and Secret provide full account access
- **Risk**: High (can incur costs, access all services)
- **Best Practice**:
  - Create RAM user with minimal permissions
  - Only grant OSS and Tingwu access
  - Set spending limits
  - Enable MFA on Aliyun account
  - Rotate keys every 90 days

#### AI Service API Keys
- Provided per-request in the `/api/summarize` endpoint body
- **Risk**: Medium (can incur API costs)
- **Best Practice**:
  - Use API keys with spending limits
  - Monitor usage through provider dashboard
  - Rotate keys regularly
  - Use separate keys for dev/prod

### Data Privacy

#### User Data
- No user data is stored on the server
- Markdown content is processed in memory only
- Temporary files are cleaned up automatically

#### Video Content
- Videos are uploaded to your OSS bucket
- You control retention and access policies
- Consider enabling OSS encryption
- Set lifecycle rules to auto-delete old files

#### AI Processing
- Markdown content is sent to AI service
- Review AI service privacy policy
- Consider data residency requirements
- Use self-hosted AI for sensitive content

### Network Security

#### HTTPS
- All external API calls use HTTPS
- AI API URL must be HTTPS (enforced)
- OSS uploads use HTTPS
- Tingwu API uses HTTPS

#### CORS
- Configure CORS_ORIGIN to restrict access
- Default: `http://localhost:3000`
- Production: Set to your domain
- Never use `*` in production

### Deployment Security

#### Production Checklist
- [ ] Use environment variables (not hardcoded)
- [ ] Enable HTTPS on your server
- [ ] Set secure CORS_ORIGIN
- [ ] Use process manager (PM2, systemd)
- [ ] Enable firewall rules
- [ ] Set up log rotation
- [ ] Monitor error logs
- [ ] Implement rate limiting
- [ ] Add authentication if needed
- [ ] Regular security updates

#### Docker Security
If using Docker:
- Don't include `.env` in image
- Use secrets management
- Run as non-root user
- Scan images for vulnerabilities
- Keep base images updated

### Audit and Monitoring

#### What to Monitor
- API usage and costs (Aliyun, AI service)
- Failed authentication attempts
- Unusual traffic patterns
- Error rates and types
- Storage usage (OSS bucket)

#### Logging
- Server logs include timestamps
- API errors are logged with details
- No sensitive data in logs (API keys filtered)
- Consider centralized logging (ELK, Splunk)

### Incident Response

#### If Credentials are Compromised

1. **Immediate Actions**:
   - Revoke compromised API keys
   - Generate new credentials
   - Update `.env` file
   - Restart server

2. **Investigation**:
   - Check access logs
   - Review recent API usage
   - Identify unauthorized access
   - Assess damage

3. **Prevention**:
   - Rotate all related credentials
   - Review security practices
   - Update documentation
   - Train team members

### Compliance

#### GDPR Considerations
- No personal data is collected by default
- User configuration is stored locally
- Video content may contain personal data
- Implement data retention policies

#### Data Residency
- Choose OSS region based on requirements
- Select AI service with appropriate data centers
- Consider self-hosted alternatives for sensitive data

### Security Best Practices

1. **Principle of Least Privilege**
   - Grant minimum necessary permissions
   - Use RAM users instead of root account
   - Separate dev and prod credentials

2. **Defense in Depth**
   - Multiple layers of security
   - Don't rely on single control
   - Validate input on client and server

3. **Regular Updates**
   - Keep dependencies updated
   - Monitor security advisories
   - Apply patches promptly

4. **Secure Development**
   - Code review for security issues
   - Use TypeScript for type safety
   - Validate all user inputs
   - Sanitize outputs

5. **Monitoring and Alerting**
   - Set up alerts for unusual activity
   - Monitor API usage and costs
   - Review logs regularly
   - Track error rates

## Contributing

Contributions are welcome! Please follow these guidelines:

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed
4. **Test your changes**
   - Ensure existing functionality works
   - Test new features thoroughly
5. **Commit your changes**
   ```bash
   git commit -m "Add: description of your changes"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Create a Pull Request**
   - Describe your changes
   - Reference any related issues
   - Wait for review

### Code Style

- Use TypeScript for type safety
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use async/await for asynchronous code

### Reporting Issues

When reporting bugs, please include:
- Description of the issue
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Node version, browser)
- Error messages or logs

### Feature Requests

When requesting features, please include:
- Clear description of the feature
- Use case and benefits
- Possible implementation approach
- Any related examples or references

## Roadmap

Planned features and improvements:

- [ ] Automated tests (unit and integration)
- [ ] Support for more video platforms
- [ ] Batch video processing
- [ ] User authentication and multi-user support
- [ ] Database for persistent storage
- [ ] WebSocket for real-time updates
- [ ] Docker compose for easy deployment
- [ ] CLI tool for command-line usage
- [ ] Plugin system for extensibility
- [ ] Advanced AI prompt templates

## FAQ

### General Questions

**Q: Is this project free to use?**
A: Yes, the project is open source under MIT license. However, you'll need to pay for external services (Aliyun, AI APIs).

**Q: Can I use this commercially?**
A: Yes, the MIT license allows commercial use.

**Q: Does this work with other video platforms?**
A: Currently only Bilibili is supported. Other platforms may be added in the future.

### Technical Questions

**Q: Why do I need Aliyun services?**
A: Tingwu provides video transcription, and OSS stores video files temporarily. You can modify the code to use alternatives.

**Q: Can I self-host the AI service?**
A: Yes, any AI service with a compatible API can be used. Consider Ollama, LocalAI, or other self-hosted solutions.

**Q: What video formats are supported?**
A: Bilibili videos are typically in FLV or MP4 format. Tingwu supports most common video formats.

**Q: Is there a file size limit?**
A: OSS and Tingwu have their own limits. Typically, videos up to 2GB work well.

**Q: Can I process multiple videos simultaneously?**
A: Currently, videos are processed sequentially. Parallel processing may be added in the future.

### Troubleshooting Questions

**Q: Why is my conversion taking so long?**
A: Tingwu transcription time depends on video length. Expect 10-30 minutes for typical videos.

**Q: Why do I get CORS errors?**
A: Ensure CORS_ORIGIN in `.env` matches your frontend URL exactly.

**Q: Can I use this without Docker?**
A: Yes, Docker is optional. You can run directly with Node.js.

## Acknowledgments

This project uses the following services and libraries:

- **Bilibili**: Video platform
- **Alibaba Cloud Tingwu**: Video transcription service
- **Aliyun OSS**: Object storage service
- **Express.js**: Web framework
- **TypeScript**: Type-safe JavaScript
- **OpenAI/Claude**: AI services for notes organization

## Support

### Getting Help

- **Documentation**: Read this README thoroughly
- **Issues**: Check existing GitHub issues
- **Discussions**: Use GitHub Discussions for questions
- **Email**: Contact maintainers (if provided)

### Commercial Support

For commercial support, custom development, or consulting:
- Contact the maintainers
- Consider hiring a developer familiar with the stack
- Review the code and documentation first

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

**Made with ❤️ for the developer community**
