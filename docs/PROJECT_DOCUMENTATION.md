# Pharmacare — Comprehensive Project Documentation

**Pharmacy Management System · Microservices Architecture · Version 4.0**

> A state-of-the-art pharmacy management platform connecting doctors, admin staff, and suppliers — built with Spring Boot microservices, Angular, RabbitMQ, JWT, and Razorpay (sandbox).

---

## Table of Contents

1. [Project Overview & Problem Statement](#1-project-overview--problem-statement)
2. [Target Users & Roles](#2-target-users--roles)
3. [Architecture & Microservices Overview (Explained Simply)](#3-architecture--microservices-overview-explained-simply)
4. [Complete Project Workflow](#4-complete-project-workflow)
5. [Frontend File & Component Breakdown](#5-frontend-file--component-breakdown)
6. [Architecture Flow Diagrams & Visuals](#6-architecture-flow-diagrams--visuals)
7. [24/7 Keep-Alive Verification (Render Free Tier)](#7-247-keep-alive-verification-render-free-tier)

---

## 1. Project Overview & Problem Statement

### The Problem

A medical store / clinic pharmacy relies on **phone calls and paper registers** to order medicines. This creates:

- ❌ **Slow orders** — doctors wait on hold or drive to the store.
- ❌ **No stock visibility** — doctors can't see what is actually available.
- ❌ **Lost paperwork** — orders get misplaced, payments go untracked.
- ❌ **No live status** — nobody knows if an order was verified, packed, or picked up.
- ❌ **No management dashboard** — the admin has no way to see sales, pending orders, or doctor activity in one place.

### The Solution: Pharmacare

Pharmacare is a **web platform** that digitizes the entire flow:

- ✅ **Online medicine catalog** with live stock, search, and one-click cart ordering.
- ✅ **Secure doctor accounts** with signup, login, and JWT-protected sessions.
- ✅ **Online payment** through Razorpay's **sandbox (test) gateway**.
- ✅ **Real-time order lifecycle**: `PENDING → PLACED → VERIFIED → PICKED UP`.
- ✅ **Live notifications** delivered over a RabbitMQ message bus.
- ✅ **Admin control center**: catalog management, supplier management, doctor account management (including **password resets**), order verification & pickup, analytics charts, and sales reports.
- ✅ **24/7 availability** on Render's free tier, kept awake by an automated health-check cron.

### Live Environment

| Component | URL |
|-----------|-----|
| Frontend (App) | <https://pharmacy-frontend-0ftx.onrender.com> |
| API Gateway | <https://api-gateway-dbuu.onrender.com> |
| Eureka Dashboard | <https://eureka-server-f8h8.onrender.com> |

---

## 2. Target Users & Roles

### 👑 Admin (Store Administrator)

- **Single, hardcoded account** — created automatically by the `user-service` on startup:
  `admin@gmail.com` / `admin@123`
- Full control over the platform:

| Capability | Details |
|-----------|---------|
| 📦 Catalog management | Add / edit / delete medicines, set prices & stock |
| 🚚 Supplier management | Manage suppliers & low-stock alerts |
| 👥 Doctor management | View all doctors, **block / unblock**, permanently **delete**, and **reset a doctor's password** (new feature — protected so doctors cannot reset their own passwords) |
| 📋 Order verification | See every order in real time, mark as **Verified**, then **Picked Up** with a pickup date |
| 📊 Analytics | Overview stats: total doctors, orders, revenue, pending payments, Chart.js graphs |
| 📈 Sales reports | Per-medicine sales performance |
| 🔔 Broadcasting | Send notifications to doctors |
| 🔑 Own password change | Change admin password from the dashboard |

### 👨‍⚕️ Doctors

- **Multiple users** who register themselves (no admin approval required).
- After signup they are **auto-redirected to the login page with their email pre-filled** and a success banner — one click and they're in.

| Capability | Details |
|-----------|---------|
| 📝 Signup & login | Name, contact, email, password → JWT issued |
| 💊 Browse catalog | Carousel + search (server-side) over the medicine catalog |
| 🛒 Cart & checkout | Add quantity, review cart drawer, place order |
| 💳 Payment | Razorpay sandbox checkout (demo — any fake signature accepted) |
| 📜 Order tracking | Order history with live status (PENDING / PLACED / VERIFIED / PICKED UP) |
| 🔔 Live alerts | In-dashboard alerts: new drugs added, order status changes, broadcasts |
| 🏪 Clinic sync | "Clinic Sync Active" indicator while session is valid |

---

## 3. Architecture & Microservices Overview (Explained Simply)

The system is split into **7 small applications** (microservices) that each do one job and talk to each other. Think of a hospital: instead of one person doing everything, you have specialized departments that coordinate.

### 🗂 Eureka Server — "The Phone Directory"

Port **8761**. Every microservice **registers itself** with Eureka on startup (name + address), and asks Eureka where the other services live. When the order-service needs the inventory-service, it doesn't hard-code a URL — it asks the directory. If a service crashes and restarts on a new address, nothing breaks.

```
               ┌─────────────────────────────┐
               │      EUREKA SERVER          │
               │    (the phone directory)    │
               └─────────────────────────────┘
        registers ▲         │ finds each other
  ┌───────────────┴─────────┴────────────────┐
  │ USER   ORDER  INVENTORY  PAYMENT  NOTIF. │
  └──────────────────────────────────────────┘
```

### 🚪 API Gateway — "The Single Front Door"

Port **8080**. The frontend **never talks to microservices directly** — every request goes through the gateway, which:

1. **Checks the JWT** (digital ID card) — rejects requests without a valid one.
2. **Routes** the request to the right service: `/users/**` → user-service, `/orders/**` → order-service, `/inventory/**` → inventory-service, `/payment/**` → payment-service, `/notification/**` → notification-service.
3. **Enforces role rules** — e.g., only ADMIN may reset doctor passwords; DOCTOR tokens are blocked from that endpoint.

```
  Angular App  ──▶  API GATEWAY (8080)  ──▶  the right microservice
                      │  (JWT check + route)
```

### 🤝 Feign Client — "Calling a Colleague"

When the **order-service** needs to check stock or reduce quantity, it calls the **inventory-service** using a **Feign Client** — a built-in HTTP client that makes the call look like a local function call. Wrapped in **Resilience4j circuit breakers**: if the inventory service is down, the breaker "opens" and the system returns a friendly fallback instead of hanging.

### 📬 RabbitMQ — "The Post Office"

After an order is placed, the order-service doesn't directly notify anyone — it **posts a message** to RabbitMQ. The **notification-service** (a subscriber) picks the message up and writes it to the notifications database, which the frontend polls for **live alerts**. This decouples services: the order flow never blocks on notification delivery.

```
  ORDER-SERVICE ──publishes──▶ RABBITMQ ──consumes──▶ NOTIFICATION-SERVICE ──▶ DB ──▶ UI
```

### 🪪 JWT Authentication — "The Digital ID Card"

At login, the user-service issues a **signed JWT** (a token containing the user's ID, name, role). The browser stores it and attaches it to every request. The gateway verifies the **signature** on every request — like checking an ID card's hologram. Expiry: 24 hours (`jwt.expiration`). Tokens are signed with a shared `JWT_SECRET`.

### 💳 Razorpay — "Test Payment Gateway"

The payment-service integrates Razorpay's **sandbox mode** — a realistic test payment flow that uses test keys and accepts demo payments. Payment records are stored in the payment database, linked to orders.

### 🗄 The 5 Databases (one per service)

| Database | Owned by | Stores |
|----------|----------|--------|
| `pharmacy_db` | user-service | users (admin + doctors), passwords (BCrypt-hashed) |
| `order_db` | order-service | orders (drug_id, doctor_id, quantity, status, timestamps) |
| `pharmacy_inventory` | supplier-inventory-service | `drug` catalog + `suppliers` |
| `payment_db` | payment-service | payment transactions |
| `notification_db` | notification-service | notifications for users / broadcasts |

Each service owns its data — no other service touches it directly. This is **database-per-service** isolation, a core microservices pattern.

### 🧩 Services Summary Table

| Service | Port | Tech | Job (one sentence) |
|---------|------|------|--------------------|
| eureka-server | 8761 | Spring Cloud Netflix | Tells every service where every other service lives |
| api-gateway | 8080 | Spring Cloud Gateway (WebFlux) | One front door: JWT check + routing to services |
| user-service | 8081 | Spring Boot + JPA | Accounts, login, JWT, admin/doctor management, password resets |
| order-service | 8082 | Spring Boot + JPA | Creates orders, drives status lifecycle, emits RabbitMQ events |
| supplier-inventory-service | 8083 | Spring Boot + JPA | Medicine catalog, stock levels, suppliers, low-stock alerts |
| payment-service | 8085 | Spring Boot + Razorpay SDK | Razorpay sandbox payments, payment records |
| notification-service | 8084 | Spring Boot + RabbitMQ | Consumes messages → writes notifications → feeds live alerts |

---

## 4. Complete Project Workflow

The full journey of one order, from signup to pickup:

### Step 1 — Signup (Doctor)

```
  Doctor fills form (name, contact, email, password)
        │
        ▼
  POST /users/signup  ──▶  user-service  ──▶  pharmacy_db (BCrypt-hashed password)
        │
        ▼
  Auto-redirect to /login?tab=login&email=…&signedup=1
  (email pre-filled + green "Registration successful" banner)
```

> The frontend intentionally **does not auto-login** — it takes the doctor to the login form with their email pre-filled, so they confirm their credentials once.

### Step 2 — Login (JWT issued)

```
  POST /users/login ──▶ user-service verifies password (BCrypt)
        │
        ▼
  JWT signed with JWT_SECRET ──▶ stored in localStorage ──▶ attached to every request
```

### Step 3 — Browse & Order

```
  Doctor opens catalog ──▶ GET /inventory/drugs (server-side search)
        │
        ▼
  Adds medicine + quantity to cart (frontend state, cart drawer)
        │
        ▼
  POST /orders  ──▶  order-service
        │              ├─ calls inventory-service (Feign + circuit breaker):
        │              │     "reduce stock by N, deduct the price"
        │              └─ creates order: status = PENDING
        │
        ▼
  Order appears in doctor's "Order History" as PENDING
```

### Step 4 — Payment (Razorpay sandbox)

```
  Doctor clicks Pay ──▶ frontend loads Razorpay checkout widget (test mode)
        │
        ▼
  POST /payment/success?orderId&amount&paymentId&signature&razorpayOrderId
        │   (demo mode: accepts the test signature)
        ▼
  payment-service records payment ──▶ order status → PLACED
```

### Step 5 — RabbitMQ Notification

```
  order-service publishes "order placed" message to RabbitMQ
        │
        ▼
  notification-service consumes it ──▶ writes notification to notification_db
        │
        ▼
  Admin dashboard (polling) shows the new order + live alert in real time
```

### Step 6 — Admin Verification & Pickup

```
  Admin sees the order in real-time sync (no refresh needed)
        │
        ▼
  Admin clicks VERIFY  ──▶ order status → VERIFIED
  Admin clicks PICK UP  ──▶ order status → PICKED UP + pickup date recorded
        │
        ▼
  Doctor dashboard live-updates: VERIFIED → Picked Up (with date)
```

### Step 7 — Admin Password Reset (Admin-only capability)

```
  Admin → Registered Doctors → "Change Password" on a doctor row
        │
        ▼
  Modal: new password + confirm ──▶ POST /users/{id}/reset-password
        │   (gateway blocks this endpoint for DOCTOR role — only ADMIN)
        ▼
  user-service BCrypt-hashes the new password ──▶ success screen
        │
        ▼
  Doctor's old password no longer works; new password signs in successfully
```

---

## 5. Frontend File & Component Breakdown

The Angular app lives in `-pharmacy-frontend/src/app`.

### Pages (`pages/`)

| File/Folder | What it does |
|-------------|--------------|
| `home/` | Marketing landing page — hero section, features, trusted-brands **marquee** (auto-scrolling logo strip), CTA buttons |
| `login/` | **Signup + Login** in one screen (tabs). Signup validates name/email/contact/password, then **auto-redirects** to login with pre-filled email + success banner. Admin/Doctor role toggle, "remember me". Error messages render for failed logins |
| `doctor-dashboard/` | The doctor's workspace — **Overview Stats** (orders placed, total spent, pending payments), **Place Drug Orders** (searchable catalog carousel, quantity steppers, cart drawer, checkout, Razorpay), **Order History Logs** (live status tracking), **View Drugs** list, **Live Alerts** panel |
| `admin-dashboard/` | The admin control center — **Overview Analytics** (stat cards + Chart.js graphs), **View Drugs List** (add/edit/delete medicines), **Add New Drug** form, **Suppliers & Alerts**, **Doctor Orders** (real-time sync + Verify / Pick Up), **Sales Reports**, **Registered Doctors** (block/unblock/delete/**change password modal**), **Change Password** (own), notification composer |
| `about/`, `services/`, `contact/`, `learn/`, `pricing/` | Marketing & info pages |

### Core building blocks

| File/Folder | What it does |
|-------------|--------------|
| `components/header/` | Sticky top navigation with role-aware links & logout |
| `components/footer/` | Footer with contact info (sales@eVital.in, Ahmedabad) |
| `services/api.service.ts` | **One central API client** — every HTTP call to the gateway, typed responses |
| `services/auth.service.ts` | Login/logout/session management, `localStorage` persistence, current-user observable |
| `services/razorpay.service.ts` | Loads and drives the Razorpay checkout widget |
| `guards/auth.guard.ts` | Route protection — `/doctor` and `/admin` require a valid session |
| `interceptors/auth.interceptor.ts` | Attaches the JWT `Authorization: Bearer …` header to every request |
| `models.ts` | TypeScript models (User, Drug, Order, Supplier, …) |
| `shared/animations/reveal.ts` | Scroll-reveal animation directives (elements fade up as you scroll) |
| `styles.css` | **Global design system**: CSS tokens (colors, shadows, gradients), glassmorphism cards, gradient borders, button shine effects, hover lifts, skeleton loaders, modal/panel animations, marquee keyframes, reduced-motion accessibility block |
| `server.js` | Express static server for production — serves the built app + SPA fallback + `/health` endpoint |
| `proxy.conf.json` | Dev-only: forwards `/api` → `http://localhost:8080` (the gateway) |

### Routing (`app.routes.ts`)

| Path | Page | Guard |
|------|------|-------|
| `/` | Home | — |
| `/login` | Login/Signup | — |
| `/doctor` | Doctor dashboard | `auth.guard` (doctor/admin) |
| `/admin` | Admin dashboard | `auth.guard` (admin only) |
| `/about`, `/services`, `/contact`, `/learn`, `/pricing` | Marketing | — |

---

## 6. Architecture Flow Diagrams & Visuals

### 6.1 High-Level Architecture Map

```
                              ┌───────────────────────────┐
                              │      ANGULAR FRONTEND      │
                              │   (pharmacy-frontend)      │
                              │  home · login · /doctor ·  │
                              │  /admin · marketing pages  │
                              └─────────────┬─────────────┘
                                            │  HTTPS (JWT in header)
                                            ▼
                              ┌───────────────────────────┐
                              │     API GATEWAY (8080)     │  JWT verify + route
                              └──┬───────┬───────┬─────┬──┘
                                 │       │       │     │
                 ┌───────────────▼───┐ ┌─▼─────────┴──┐ ┌▼──────────────┐
                 │     EUREKA        │ │  routes by   │ │   RABBITMQ    │
                 │  (service registry│ │  path prefix  │ │  (message bus)│
                 │   · 8761)         │ │               │ └───────┬──────┘
                 └───────┬───────────┘ └───┬───────────┘         │
                 registers ▲               │                     │
                 ┌────────┴────────────────┴─────────────────────┴──────────┐
                 ▼                                                          ▼
     ┌──────────────┐ ┌──────────────┐ ┌────────────────┐ ┌─────────────┐ ┌───────────────┐
     │ USER-SERVICE │ │ ORDER-SERVICE│ │ SUPPLIER-INV.  │ │ PAYMENT-    │ │ NOTIFICATION- │
     │    8081      │ │    8082      │ │ SERVICE  8083  │ │ SERVICE 8085│ │ SERVICE  8084 │
     └──────┬───────┘ └──────┬───────┘ └───────┬────────┘ └──────┬──────┘ └───────┬───────┘
            │                │                 │                │                │
     ┌──────▼───────┐ ┌──────▼───────┐ ┌───────▼────────┐ ┌──────▼──────┐ ┌──────▼───────┐
     │ pharmacy_db  │ │  order_db    │ │pharmacy_inv.   │ │ payment_db  │ │notification_ │
     │  (users)     │ │  (orders)    │ │ (drugs,supp.)  │ │ (payments)  │ │    db        │
     └──────────────┘ └──────────────┘ └────────────────┘ └─────────────┘ └──────────────┘
                            PostgreSQL × 5 (database-per-service)
```

### 6.2 Order Placement Sequence (with Feign + RabbitMQ)

```
Doctor                Frontend          Gateway          Order-Svc    Inventory-Svc   RabbitMQ
  │  add to cart         │                │                │             │              │
  │──▶                  │                │                │             │              │
  │  checkout            │                │                │             │              │
  │─────────────────────▶│  POST /orders  │                │             │              │
  │                      │───────────────▶│───▶ JWT ok ──▶│             │              │
  │                      │                │                │── Feign ───▶│ reduce stock │
  │                      │                │                │◀───────────│  qty, price  │
  │                      │                │                │── publish ─────────────────▶
  │                      │                │                │  order.placed               │
  │                      │                │                │                              │
  │  PENDING shown       │                │                │                              │
  │◀─────────────────────│                │                │                              │
  │  Pay (Razorpay)      │                │                │                              │
  │─────────────────────▶│ POST /payment/success           │                              │
  │                      │───────────────────────────────▶│  record payment              │
  │                      │                │                │  status → PLACED            │
  │  PLACED shown        │                │                │                              │
  │◀─────────────────────│                │                │                              │
```

### 6.3 Payment Flow (Razorpay Sandbox)

```
Doctor clicks "Pay Now"
      │
      ▼
Razorpay checkout modal (test keys rzp_test_…)
      │
      ▼
Doctor completes demo payment ──▶ Razorpay returns orderId, paymentId, signature
      │
      ▼
POST /payment/success?orderId&amount&paymentId&signature&razorpayOrderId
      │
      ▼
payment-service validates + records ──▶ order-service marks order PLACED
      │
      ▼
Admin dashboard sees the paid order in real time (RabbitMQ-backed alert)
```

### 6.4 Admin Verification & Pickup Flow

```
Admin dashboard (Doctor Orders section, auto-refreshing)
      │
      ▼
New order appears with doctor name, drug, qty, amount, payment status
      │
      ▼
Click VERIFY ──▶ status = VERIFIED          (doctor sees it live)
      │
      ▼
Click PICK UP ──▶ status = PICKED UP + pickup date stored
      │
      ▼
Doctor's Order History shows "Picked Up on <date>" + live alert
```

### 6.5 Authentication Flow (JWT)

```
Doctor logs in ──▶ user-service verifies BCrypt hash
      │
      ▼
Signs JWT { userId, name, role, exp: 24h } with JWT_SECRET
      │
      ▼
Frontend stores token in localStorage, sends "Authorization: Bearer <token>"
      │
      ▼
Gateway verifies signature + role on EVERY request
      │
      ├─ ADMIN token ─▶ may hit /users/{id}/reset-password (admin-only rule)
      └─ DOCTOR token ─▶ blocked from resetting passwords (403)
```

### 6.6 24/7 Keep-Alive Diagram

```
GitHub Actions (public repos = free minutes)
  cron: */5 every 5 minutes
      │
      ├─ -pharmacy-frontend/.github/workflows/keep-alive.yml
      │        │  pings 8 URLs in parallel (max 7)
      │        ▼
      └─ pharmacy-managment-system/.github/workflows/keep-warm.yml
               │  pings the same 8 URLs (redundant layer)
               ▼
      curl https://<service>.onrender.com/health  for each of:
        api-gateway · user-service · order-service · payment-service
        supplier-inventory-service · notification-service
        eureka-server · pharmacy-frontend
               ▼
      Services never idle 15 min ──▶ Render never spins them down ──▶ 24/7 online
```

---

## 7. 24/7 Keep-Alive Verification (Render Free Tier)

### Why it's needed

Render's **free tier automatically spins down a web service after ~15 minutes of zero traffic**. When someone visits a sleeping service, it cold-starts (~30–60 s first load) — bad for a "production-ready" demo.

### The solution (implemented)

Two **GitHub Actions workflows** ping every `/health` endpoint **every 5 minutes**, so no service ever reaches the 15-minute inactivity threshold:

| Workflow | Repo | Cron | Pings |
|----------|------|------|-------|
| `Keep-Alive (Render 24/7)` | `-pharmacy-frontend` | `*/5 * * * *` | all 8 services |
| `Keep Render Services Warm` | `pharmacy-managment-system` | `*/5 * * * *` | all 8 services (redundant) |

Each run curls the 8 endpoints in parallel (`max-parallel: 7`, `fail-fast: false`), prints the HTTP code, and tolerates cold starts on the first ping.

### Verification evidence (checked live on 17 Aug 2026)

| Check | Result |
|-------|--------|
| `api-gateway-dbuu.onrender.com/health` | ✅ `200` |
| `user-service-5x8c.onrender.com/health` | ✅ `200` |
| `order-service-irvh.onrender.com/health` | ✅ `200` |
| `payment-service-6drh.onrender.com/health` | ✅ `200` |
| `supplier-inventory-service.onrender.com/health` | ✅ `200` |
| `notification-service-h2df.onrender.com/health` | ✅ `200` |
| `eureka-server-f8h8.onrender.com/health` | ✅ `200` |
| `pharmacy-frontend-0ftx.onrender.com/health` | ✅ `200` |
| GitHub Actions runs | ✅ `success` (both workflows) |
| Repo visibility (Actions billing) | ✅ both repos **public** → Actions minutes **free & unlimited** |

### Honest note + bulletproof recommendation

GitHub Actions cron is "best-effort" — runs are normally on time but **can occasionally be delayed**. If a delay ever lets a service sleep, the next ping wakes it (30–60 s cold start on first load). For an extra layer of protection, add free **UptimeRobot** monitors:

1. Create a free account at <https://uptimerobot.com> (50 monitors, free).
2. Add one **HTTP monitor** per service URL (use the `/health` endpoints from the table above).
3. Set **interval = 5 minutes**, alert contacts = your email.
4. UptimeRobot pings from independent servers — even if GitHub is delayed, Render never sleeps.

With both layers active, the platform stays **awake 24/7**.

---

*Documentation generated for the Pharmacare Pharmacy Management System — version 4.0.*
