# Ours

A personal web application for couples to document their relationship journey, manage shared goals, and create lasting memories together.

## ✨ Features

- **Moments**: Share photos and messages on a shared bulletin board to capture your special moments
- **Two Do**: Collaborate on a shared todo list to plan adventures and track relationship goals
- **Profile Management**: Personalized user profiles with avatars
- **Secure Authentication**: Invite-code based registration system for privacy
- **Dark/Light Mode**: Theme switching for comfortable viewing
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🛠️ Tech Stack

### Frontend

- **[Next.js 15](https://nextjs.org)** - React framework with App Router
- **[React 19](https://react.dev)** - UI library
- **[TypeScript](https://www.typescriptlang.org)** - Type-safe JavaScript
- **[Tailwind CSS 4](https://tailwindcss.com)** - Utility-first CSS framework
- **[Radix UI](https://www.radix-ui.com)** - Headless UI components
- **[Shadcn/ui](https://ui.shadcn.com)** - Beautiful component library
- **[Lucide React](https://lucide.dev)** - Icon library

### Backend & Database

- **[Prisma](https://www.prisma.io)** - Database ORM and migrations
- **[Turso](https://turso.tech)** - Database
- **[Prisma Adapter for LibSQL](https://www.prisma.io/docs/orm/database-connectors/turso)** - Database connectivity

### Storage & Media

- **[Cloudflare R2](https://www.cloudflare.com/products/r2/)** - File storage for images
- **[AWS SDK](https://aws.amazon.com/sdk-for-node-js/)** - S3 integration

### Authentication & Security

- **[bcryptjs](https://github.com/dcodeIO/bcrypt.js)** - Password hashing
- **[Oslo](https://oslo.js.org)** - Cryptographic utilities
- **[Zod](https://zod.dev)** - Schema validation

### State Management & Data Fetching

- **[SWR](https://swr.vercel.app)** - Data fetching with caching
- **[React Hook Form](https://react-hook-form.com)** - Form handling
- **[Ky](https://github.com/sindresorhus/ky)** - HTTP client

### Development Tools

- **[pnpm](https://pnpm.io)** - Package manager
- **[ESLint](https://eslint.org)** - Code linting
- **[Prettier](https://prettier.io)** - Code formatting
- **[Husky](https://typicode.github.io/husky/)** - Git hooks
- **[lint-staged](https://github.com/okonet/lint-staged)** - Run linters on staged files

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **pnpm** (recommended package manager)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/CurlyTeddy/ours.git
   cd ours
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory:

   ```env
   # Database
   LIBSQL_DATABASE_URL="file:./prisma/dev.db"
   LIBSQL_DATABASE_TOKEN="" # Optional for local development

   # Environment
   NEXT_PUBLIC_ENVIRONMENT="dev"

   # File Storage (R2/S3)
   R2_ENDPOINT="https://your-account-id.r2.cloudflarestorage.com"
   R2_ACCESS_KEY="your-access-key"
   R2_SECRET_ACCESS_KEY="your-secret-key"
   NEXT_PUBLIC_R2_ENDPOINT="https://your-public-r2-domain.com"
   ```

4. **Set up the database**

   ```bash
   # Generate Prisma client
   pnpm dlx prisma generate

   # Run database migrations
   pnpm dlx prisma migrate dev

   # (Optional) Seed the database
   pnpm dlx prisma db seed
   ```

5. **Start the development server**

   ```bash
   pnpm dev
   ```

6. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

## 📝 Usage

### First Time Setup

1. **Generate an invite code** (you can do this directly in the database or through [Prisma Seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding))
2. **Sign up** using the invite code at `/signup`
3. **Login** at `/login`
4. **Start using the app** to document your journey together!

### Features Overview

- **Moments Page** (`/moments`): Upload photos and share messages
- **Two Do Page** (`/twodo`): Create and manage shared todos with images and priorities
- **Profile Management**: Update your profile and avatar

## 🗄️ Database Schema

The application uses the following main models:

- **User**: User profiles and authentication
- **InviteCode**: Secure registration system
- **Todo**: Shared todo items with priorities and images
- **Session**: User session management
- **MomentPhoto**: Shared photo gallery
- **BulletinMessage**: Shared message board

## 🚀 Deployment

### Environment Setup

For production deployment, ensure you have:

1. **Database**: Set up a Turso database or similar LibSQL-compatible service
2. **File Storage**: Configure Cloudflare R2 or AWS S3
3. **Environment Variables**: Update all production environment variables

### Deploy on Vercel

1. **Connect your repository** to Vercel
2. **Set environment variables** in the Vercel dashboard
3. **Deploy** - Vercel will automatically build and deploy your application

For other deployment platforms, ensure you have Node.js 18+ and run:

```bash
pnpm build
pnpm start
```

## 🤝 Contributing

This is a personal project, but if you'd like to contribute or use it as inspiration for your own relationship app:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

Private project - All rights reserved.

## ❤️ About

Built with love for documenting and planning our journey together. This application serves as a private space for couples to share moments, plan adventures, and keep track of their shared goals.

---

_"A place for me and my girlfriend to record our lives."_
