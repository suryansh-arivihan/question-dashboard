# Admin Dashboard - Question Management System

A Next.js 14+ TypeScript application for managing NEET question topics with hierarchical navigation and generation queue functionality.

## Features

- **Hierarchical Navigation**: Browse through Subjects → Chapters → Topics
- **Question Status Tracking**: View VERIFIED, PENDING, and IN_PROGRESS questions
- **Ready to Go Workflow**: Queue topics for generation with one click
- **Authentication**: Clerk-based auth with invite code validation
- **Admin Controls**: Restricted access for authorized users
- **Real-time Updates**: Toast notifications for actions
- **Responsive Design**: Mobile-first UI with Tailwind CSS

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Authentication**: Clerk
- **Database**: AWS DynamoDB (SDK v3)
- **Icons**: lucide-react
- **Notifications**: sonner

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Update `.env.local` with your credentials:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_publishable_key_here
CLERK_SECRET_KEY=your_secret_key_here

# AWS DynamoDB
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1

# Invite Codes (comma-separated)
VALID_INVITE_CODES=ADMIN2025,TECHIE2025,NEET2025

# Admin user emails (comma-separated)
ADMIN_EMAILS=admin@example.com,superadmin@example.com
```

### 3. Set Up Clerk

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Create a new application
3. Copy your API keys to `.env.local`
4. Configure redirect URLs:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in: `/dashboard`
   - After sign-up: `/dashboard`

### 4. Set Up DynamoDB Tables

Ensure the following tables exist:

- `ExamChapterTopicMappings` - Topic mappings
- `NEETAdaptiveQuestionGeneratorData` - PENDING/IN_PROGRESS questions
- `NEETAdaptiveQuestionGeneratorDataVerified` - VERIFIED questions
- `generation_queue` - Queue entries (create this)

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard pages
│   ├── sign-in/          # Authentication pages
│   └── sign-up/
├── components/            # React components
│   └── ui/               # shadcn/ui components
├── lib/                  # Utilities and DB clients
├── types/                # TypeScript types
└── middleware.ts         # Clerk middleware
```

## Key Features

### Hierarchical Navigation
Navigate from subjects → chapters → topics with breadcrumb navigation

### Status Tracking
Real-time question counts with visual status badges

### Ready to Go Queue
Admin-only feature to queue topics for generation

## Development

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
```

## License

MIT
