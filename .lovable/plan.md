
# QR Dine Pro - Multi-Tenant SaaS Platform

## Overview

Transform the existing restaurant ordering system into a comprehensive multi-tenant SaaS platform called "QR Dine Pro" where multiple restaurants can create QR-based digital menus with subscription access, real-time sync, modern animations, and no customer login required.

## Architecture Overview

```text
+------------------------------------------------------------------+
|                        QR DINE PRO SAAS                          |
+------------------------------------------------------------------+
|  PUBLIC LAYER (No Auth Required)                                 |
|  +------------------+  +------------------+  +------------------+ |
|  | Landing Page     |  | Customer Menu    |  | Feedback Page    | |
|  | (Animated Hero)  |  | (Per Restaurant) |  | (Star Rating)    | |
|  +------------------+  +------------------+  +------------------+ |
+------------------------------------------------------------------+
|  RESTAURANT LAYER (Staff Auth)                                   |
|  +------------------+  +------------------+  +------------------+ |
|  | Kitchen Display  |  | Waiter Dashboard |  | Billing Counter  | |
|  | (Sound Alerts)   |  | (Real-time)      |  | (Receipt Print)  | |
|  +------------------+  +------------------+  +------------------+ |
|  +------------------------------------------------------------+  |
|  | Restaurant Admin Dashboard                                  |  |
|  | - Menu CRUD  - Tables/QR  - Orders  - Analytics  - Settings |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
|  SUPER ADMIN LAYER                                               |
|  +------------------------------------------------------------+  |
|  | Super Admin Panel                                           |  |
|  | - Manage Restaurants - Subscription Plans - Ads - Revenue   |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
|  DATA LAYER (Supabase)                                           |
|  +------------------+  +------------------+  +------------------+ |
|  | Multi-tenant DB  |  | Real-time Sync   |  | Edge Functions   | |
|  | (RLS Policies)   |  | (Subscriptions)  |  | (Billing/Stripe) | |
|  +------------------+  +------------------+  +------------------+ |
+------------------------------------------------------------------+
```

---

## Phase 1: Foundation & Multi-Tenancy

### 1.1 Database Schema (Supabase)

**Core Tables:**

| Table | Purpose |
|-------|---------|
| `restaurants` | Restaurant profiles with branding, settings, subscription |
| `user_roles` | Role-based access (admin, staff, super_admin) |
| `subscription_plans` | Plan tiers (Free, Pro, Enterprise) |
| `menu_items` | Per-restaurant menu with images, pricing |
| `categories` | Menu categories per restaurant |
| `tables` | Table management with QR codes |
| `orders` | Orders with real-time status |
| `order_items` | Line items with customizations |
| `feedback` | Customer ratings and comments |
| `waiter_calls` | Service request queue |
| `ads` | Partner promotions and ads |
| `analytics_events` | Tracking for dashboards |

**Multi-tenancy:** All tables include `restaurant_id` with RLS policies ensuring data isolation.

### 1.2 Authentication & Roles

- **Customers**: No login required - identified by table QR code session
- **Restaurant Staff**: Email/password auth with role assignment
- **Super Admin**: Special role for platform management

Role hierarchy using `user_roles` table with enum:
```text
super_admin > restaurant_admin > staff (kitchen/waiter/billing)
```

---

## Phase 2: Public Customer Experience

### 2.1 Landing Page (Modern & Animated)

Inspired by Pinterest/yummy-dispatch design:
- Hero section with animated gradient background
- Floating food images with parallax
- "Scan to Dine" animated QR code demo
- Restaurant showcase carousel
- Feature highlights with scroll animations
- Testimonials section
- Footer with links

**Animations (Framer Motion):**
- Staggered fade-in on scroll
- Smooth page transitions
- Micro-interactions on hover
- Parallax scrolling effects

### 2.2 Customer Menu (Mobile-First)

**Route**: `/r/{restaurant_slug}/table/{table_id}` or `/order?r={id}&table={num}`

Features:
- Restaurant branding (logo, colors, theme)
- Category tabs with smooth scroll
- Menu cards with images and badges (veg/non-veg, spicy level, popular)
- Add to cart with quantity animations
- Special instructions per item
- Cart drawer with swipe gestures
- Order placement (no login)
- Real-time order tracking
- Estimated prep time display

### 2.3 Feedback & Google Review Redirection

**Flow:**
1. Post-meal feedback prompt appears
2. Customer rates 1-5 stars
3. If rating >= 4: Redirect to Google Review page
4. If rating < 4: Show internal feedback form for improvement

Components:
- Star rating animation
- Feedback textarea
- Smart redirect logic
- Thank you confirmation

---

## Phase 3: Kitchen & Staff Dashboards

### 3.1 Kitchen Display System (KDS)

**Enhancements:**
- **Sound Alerts**: Audio notification for new orders
  - Uses Web Audio API
  - Mute/unmute toggle (persisted)
  - Different sounds for priority orders
- **Real-time Updates**: Supabase real-time subscriptions
- **Order Cards**: Kanban-style columns (Pending > Preparing > Ready)
- **Timer Display**: Countdown for each order
- **Voice Announcement**: Optional TTS for order numbers

### 3.2 Waiter Dashboard

- Real-time table status grid
- Waiter call notifications with sound
- Quick order status updates
- Table assignment management

### 3.3 Billing Counter with Receipt Printing

**Thermal Receipt Format (80mm):**
```text
================================
      [RESTAURANT NAME]
      [Address Line 1]
      [Phone Number]
================================
Date: DD/MM/YYYY    Time: HH:MM
Table: T5           Order: #1234
================================
Qty  Item                 Amount
--------------------------------
2x   Classic Burger      ₹498.00
1x   Mango Lassi          ₹99.00
--------------------------------
Subtotal:               ₹597.00
Tax (5%):                ₹29.85
Service Charge:          ₹59.70
================================
TOTAL:                  ₹686.55
================================
Payment: CASH
================================
   Thank you for dining!
   Please visit again.
================================
```

**Print Implementation:**
- CSS print media queries for thermal format
- `window.print()` trigger
- Optional: Direct ESC/POS commands via browser extension

---

## Phase 4: Restaurant Admin Dashboard

### 4.1 Dashboard Tabs

| Tab | Features |
|-----|----------|
| Overview | Today's stats, revenue chart, popular items |
| Menu | CRUD items, categories, availability toggle, image upload |
| Tables | Add/edit tables, generate QR codes, download as PDF |
| Orders | Order history, filters, export to CSV |
| Feedback | View ratings, respond to feedback |
| Analytics | Charts for revenue, orders, peak hours, item performance |
| Settings | Restaurant profile, branding, tax rates, working hours |
| Subscription | Current plan, upgrade options, billing history |

### 4.2 QR Code Generation

- Per-table unique QR codes
- Include restaurant branding
- Download as PNG/PDF
- Print-ready templates (tent cards)

---

## Phase 5: Super Admin Panel

### 5.1 Dashboard

- Total restaurants count
- Active subscriptions breakdown
- Monthly revenue (from subscriptions)
- New registrations chart

### 5.2 Restaurant Management

- List all restaurants with search/filter
- View/edit restaurant details
- Suspend/activate accounts
- View restaurant analytics

### 5.3 Subscription Plans Management

- Create/edit plans (Free, Pro, Enterprise)
- Feature toggles per plan
- Trial period settings
- Pricing management

### 5.4 Ads & Promotions Module

- Create ad campaigns
- Target by location/category
- Set display rules (rotation, frequency)
- Track impressions and clicks

### 5.5 Revenue Analytics

- Subscription revenue by plan
- Churn rate tracking
- Restaurant growth metrics
- Export financial reports

---

## Phase 6: Real-Time & Notifications

### 6.1 Supabase Real-Time Subscriptions

Tables with real-time sync:
- `orders` - For kitchen, waiter, customer order tracking
- `waiter_calls` - For waiter notifications
- `order_items` - For status updates

### 6.2 Sound Notifications

```typescript
// Sound alert system
const playOrderSound = () => {
  const audio = new Audio('/sounds/new-order.mp3');
  audio.play();
};

// Subscribe to new orders
supabase
  .channel('kitchen-orders')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'orders' },
    (payload) => {
      if (!isMuted) playOrderSound();
      // Update UI
    }
  )
  .subscribe();
```

---

## Phase 7: Subscription Billing (Stripe Integration)

### 7.1 Plans

| Plan | Price/Month | Features |
|------|-------------|----------|
| Free | ₹0 | 1 table, basic menu, 50 orders/month |
| Pro | ₹999 | 20 tables, analytics, priority support |
| Enterprise | ₹2999 | Unlimited, API access, white-label |

### 7.2 Integration

- Stripe Checkout for subscriptions
- Webhook handling for events
- Invoice generation
- Usage tracking

---

## New Files to Create

```text
src/
├── components/
│   ├── landing/
│   │   ├── HeroSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── RestaurantShowcase.tsx
│   │   └── TestimonialsSection.tsx
│   ├── feedback/
│   │   ├── StarRating.tsx
│   │   └── FeedbackForm.tsx
│   ├── receipt/
│   │   └── ThermalReceipt.tsx
│   ├── sounds/
│   │   └── SoundPlayer.tsx
│   └── animations/
│       └── PageTransition.tsx
├── pages/
│   ├── LandingPage.tsx          (Public landing)
│   ├── RestaurantMenu.tsx       (Per-restaurant menu)
│   ├── FeedbackPage.tsx         (Post-order feedback)
│   ├── RestaurantSignup.tsx     (Restaurant registration)
│   ├── RestaurantDashboard.tsx  (Restaurant admin)
│   └── SuperAdminPanel.tsx      (Platform super admin)
├── stores/
│   ├── authStore.ts             (Auth state)
│   ├── restaurantStore.ts       (Restaurant context)
│   └── realtimeStore.ts         (Real-time subscriptions)
├── hooks/
│   ├── useSound.ts              (Sound notification hook)
│   ├── useRealtime.ts           (Supabase real-time hook)
│   └── useRestaurant.ts         (Restaurant context hook)
├── lib/
│   ├── supabase.ts              (Supabase client)
│   └── stripe.ts                (Stripe utilities)
└── types/
    └── database.types.ts        (Supabase generated types)
```

---

## UI/UX Design Principles

1. **Modern & Attractive**
   - Glassmorphism cards
   - Gradient accents
   - Smooth shadows
   - Inter/Poppins fonts

2. **Animations**
   - Page transitions with Framer Motion
   - Staggered list animations
   - Micro-interactions on buttons/cards
   - Loading skeletons

3. **Mobile-First**
   - Touch-optimized interfaces
   - Swipe gestures for cart
   - Bottom navigation for customers
   - Responsive grid layouts

4. **Accessibility**
   - Proper contrast ratios
   - Focus indicators
   - Screen reader support
   - Keyboard navigation

---

## Technical Details

### Database: Requires Lovable Cloud

The multi-tenant architecture requires Supabase/Lovable Cloud for:
- PostgreSQL database with RLS
- Real-time subscriptions
- Authentication
- Storage for images
- Edge functions for billing

### Dependencies to Add

- `@supabase/supabase-js` - Database client
- Sound files for notifications (public/sounds/)

### Key Patterns

1. **Multi-tenancy**: All queries filtered by `restaurant_id`
2. **Real-time**: Supabase channels for live updates
3. **Optimistic UI**: Immediate feedback, sync in background
4. **Error boundaries**: Graceful error handling

---

## Implementation Order

1. **Phase 1**: Enable Lovable Cloud, create database schema
2. **Phase 2**: Landing page with animations
3. **Phase 3**: Customer menu with cart and ordering
4. **Phase 4**: Kitchen dashboard with sound alerts
5. **Phase 5**: Billing counter with receipt printing
6. **Phase 6**: Restaurant admin dashboard
7. **Phase 7**: Feedback system with Google redirect
8. **Phase 8**: Super admin panel
9. **Phase 9**: Stripe subscription integration
10. **Phase 10**: Ads module and final polish

This is a comprehensive build. Shall I start with Phase 1 (database setup) or Phase 2 (landing page with animations) first?
