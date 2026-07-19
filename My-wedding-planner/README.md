# Swayam2027 - Wedding Planner 💍

A fully custom, modern, and agentic wedding planning dashboard built to orchestrate the grand **#Swayam2027** wedding! 

This centralized platform allows the families of the bride (Swati) and groom (Satyam) to seamlessly coordinate the most important aspects of the wedding, complete with beautiful analytics, strict budget controls, and guest list management.

## ✨ Features

- **Dual-Side Architecture:** Dedicated views and unified analytics for both the Ladkewale (Groom) and Ladkiwale (Bride) sides.
- **Budget Tracking:** Track total expenses against custom limits, organized meticulously by categories (e.g., Venue, Catering, Decor) and detailed sub-categories.
- **Guest List Management:** A powerful CRM-style manager to group guests into families, assign relationship tiers (Immediate Family vs. Close Circle), and track adults/kids.
- **Function Attendance (RSVP):** Beautiful toggle grids to instantly assign specific family members to specific wedding functions (Haldi, Sangeet, Wedding, Reception).
- **Role-Based Access Control (RBAC):** A 3-tier security system protecting the dashboard:
  - **Super Admin:** Full control, can promote/revoke users.
  - **Planner:** Full access to edit budgets and guests, but cannot manage users.
  - **Guest:** View-only access to their own profile and event details.

## 🛠 Tech Stack
- **Frontend:** Next.js 16 (React), Tailwind CSS, shadcn/ui, Lucide Icons.
- **Backend/Database:** Supabase (PostgreSQL, Row Level Security, Auth).
- **Styling:** Custom "Maroon & Marigold" wedding theme utilizing deep traditional Indian wedding colors.

## 🚀 Getting Started

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Set up your environment variables. Create a `.env.local` file with your Supabase credentials:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the dashboard.

---
*Built with love for Swati & Satyam.*
