# 🤖 AI Twin Project

Create your digital twin that communicates in your unique style!

## 🏗️ Project Structure

```
ai-twin-project/
├── 📁 backend/                 # Backend API & Server
│   ├── 📁 src/
│   │   ├── 📁 config/         # Database, env, logger
│   │   ├── 📁 middleware/      # Auth, CSRF, validation
│   │   ├── 📁 modules/        # Auth, twin, chat, profile
│   │   ├── 📁 routes/         # API routes
│   │   ├── 📁 services/       # Business logic
│   │   ├── 📁 utils/          # Helper functions
│   │   └── 📁 types/          # TypeScript interfaces
│   ├── 📁 prisma/             # Database schema & migrations
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
│
├── 📁 frontend/               # Frontend Views & Static Files
│   ├── 📁 src/
│   │   ├── 📁 views/          # EJS templates
│   │   ├── 📁 public/         # Static assets
│   │   ├── 📁 styles/         # CSS files
│   │   └── 📁 scripts/        # Client-side JS
│   └── package.json
│
├── 📁 tests/                  # All Test Files
│   ├── 📁 unit/               # Unit tests
│   ├── 📁 integration/        # Integration tests
│   ├── 📁 e2e/                # End-to-end tests
│   └── 📁 helpers/            # Test utilities
│
├── 📁 docs/                   # Documentation
│   ├── 📁 api/                # API documentation
│   ├── 📁 setup/              # Setup guides
│   ├── 📁 architecture/       # System design docs
│   └── 📁 deployment/         # Deployment guides
│
├── 📁 scripts/                # Build & Deployment Scripts
├── 📁 config/                 # Global Configuration
├── package.json               # Root package.json
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-twin-project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Setup database**
   ```bash
   npm run prisma:migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open browser**
   ```
   http://localhost:3000
   ```

## 📚 Documentation

- [Setup Guide](docs/setup/)
- [API Documentation](docs/api/)
- [Architecture](docs/architecture/)
- [Deployment](docs/deployment/)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 🛠️ Development

### Backend Development
```bash
cd backend
npm run dev
```

### Frontend Development
```bash
cd frontend
npm run dev
```

### Database Management
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio
```

## 📦 Build & Deploy

```bash
# Build for production
npm run build

# Start production server
npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- [Documentation](docs/)
- [Issues](https://github.com/your-username/ai-twin-project/issues)
- [Discussions](https://github.com/your-username/ai-twin-project/discussions)

---

**Made with ❤️ by the AI Twin Team**
