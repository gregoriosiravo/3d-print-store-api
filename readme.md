# 3D Print Shop - Backend API

Express.js + TypeScript REST API for a 3D printing ecommerce platform. Handles STL file uploads, automatic pricing calculations, user authentication, and order management.

## 🚀 Features

- **STL File Processing**: Upload and analyze 3D models (volume, surface area, dimensions)
- **Automatic Pricing**: Calculate print costs based on material, infill, print time, and machine costs
- **User Authentication**: JWT-based auth with email verification
- **Email Service**: Gmail SMTP integration for verification and notifications
- **Quote Management**: Generate and store pricing quotes
- **Database**: PostgreSQL with Docker
- **File Storage**: Local uploads (ready for AWS S3 integration)

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **ORM**: pg (node-postgres)
- **Authentication**: JWT + bcrypt
- **Email**: Nodemailer (Gmail SMTP)
- **STL Parsing**: node-stl
- **File Upload**: Multer
- **Containerization**: Docker & Docker Compose

## 📋 Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Gmail account (for email verification)

## 🔧 Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/3dprint-store.git
cd 3dprint-store/3d-print-shop-api

npm install
npx prisma init --datasource-provider postgresql

cp .env.example .env
# Edit .env with your configuration

```
