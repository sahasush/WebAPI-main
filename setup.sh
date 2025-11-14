#!/bin/bash

# API Repository Setup Script

echo "🚀 Setting up Eirvana API Repository..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create environment file
echo "🔧 Creating .env file..."
cat > .env << EOF
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://euser:epassword@localhost:5432/eirvana_db
CLIENT_URL=http://localhost:3000

# Email configuration (optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
EOF

# Create .gitignore
echo "📝 Creating .gitignore..."
cat > .gitignore << EOF
# Dependencies
node_modules/
npm-debug.log*

# Build output
dist/
build/

# Environment files
.env
.env.local
.env.production

# Database
*.db
*.sqlite

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Cache
.cache/
*.tsbuildinfo

# Logs
logs/
*.log

# Runtime
pids/
*.pid
*.seed
*.pid.lock
EOF

echo "✅ API repository setup complete!"
echo "📋 Next steps:"
echo "   1. Update DATABASE_URL in .env to point to your database"
echo "   2. Configure email settings if using email features"
echo "   3. Run 'npm run db:migrate' to set up database schema"
echo "   4. Run 'npm run dev' to start development server"
echo "   5. Run 'npm run build' to build for production"