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

---

# PART II � Building Everything From Scratch (Step by Step, Very Simple English)

> This part is written for a **beginner / non-technical person**. Every step is explained in simple words. You can follow it to rebuild the entire project yourself.

## 8. All Application Properties Explained (in Simple Words)

Every microservice has a small settings file called `application.properties`. It works like a **settings menu on your phone** � each line is one setting. Here is what every line means, service by service.

### 8.1 Eureka Server (`eureka-server`)

| Property | What it does (simple words) |
|----------|-----------------------------|
| `server.port=8761` | The phone book app lives on **port 8761** of your computer |
| `eureka.client.register-with-eureka=false` | The phone book does NOT add itself to the phone book (it is the book, not a caller) |
| `eureka.client.fetch-registry=false` | It does not need to look up anyone � it already knows everyone |
| `eureka.server.enable-self-preservation=false` | Removes dead services from the list immediately instead of keeping ghosts |
| `eureka.instance.hostname=localhost` | Its address name when running on your computer |

### 8.2 API Gateway (`API-Gateway`)

| Property | What it does (simple words) |
|----------|-----------------------------|
| `server.port=8080` | The front door lives on **port 8080** |
| `spring.application.name=api-gateway` | Its name in the phone book |
| `spring.cloud.gateway...routes[i]` | The **door signs**: `Path=/users/**` means "requests starting with /users go to user-service", `/orders/**` ? order-service, `/inventory/**` ? inventory-service, `/payment/**` ? payment-service, `/notification/**` ? notification-service |
| `uri=lb://USER-SERVICE` | `lb://` = "look up the real address in Eureka (load-balanced)" |
| `spring.cloud.loadbalancer.ribbon.enabled=false` | Uses the new load balancer, not the old one |
| `eureka.client.service-url.defaultZone=...` | Where the phone book lives (default `http://localhost:8761/eureka/`) |
| `jwt.secret=...` | The **secret key** used to check ID cards (tokens). Same key everywhere |
| `cors.allowed.origins=...` | Which website addresses are allowed to talk to the gateway |

### 8.3 User Service (`user-service`) � port 8081

| Property | What it does (simple words) |
|----------|-----------------------------|
| `server.port=8081` | Lives on **port 8081** |
| `spring.application.name=USER-SERVICE` | Its name in the phone book (written in capital letters) |
| `spring.datasource.url=jdbc:postgresql://localhost:5432/pharmacy_db` | How to connect to **its** database (PostgreSQL, database `pharmacy_db`) |
| `spring.datasource.username/password` | Database login (default `postgres`/`postgres` on a local computer) |
| `spring.jpa.hibernate.ddl-auto=update` | **Auto-creates/updates tables** from the code � no SQL files needed |
| `spring.jpa.database-platform=PostgreSQLDialect` | Tells Hibernate it is talking to PostgreSQL |
| `management.endpoints.web.exposure.include=health` | Makes the `/health` URL public (used by the keep-alive pinger) |
| `jwt.secret=...` | The secret key that **signs** the ID cards |

### 8.4 Order Service (`order-service`) � port 8082

Same database settings (uses database `order_db`), plus:

| Property | What it does (simple words) |
|----------|-----------------------------|
| `resilience4j.circuitbreaker...` | **Circuit breakers**: if the inventory or payment service is sick, the breaker opens and the order service does not hang forever waiting |
| `spring.rabbitmq.host/port/username/password` | Where the **post office (RabbitMQ)** lives (default `localhost:5672`, login `guest`/`guest`) |
| `spring.rabbitmq.ssl.enabled=false` | No SSL when running locally (SSL is switched on in the cloud) |

### 8.5 Supplier-Inventory Service (`supplier-inventory-service`) � port 8083

Same settings, database `pharmacy_inventory`, plus the same RabbitMQ settings. It stores the **medicine catalog** (`drug` table) and the **suppliers** table.

### 8.6 Notification Service (`notification-service`) � port 8084

Same settings, database `notification_db`, plus the same RabbitMQ settings. It **listens** to the post office for new messages.

### 8.7 Payment Service (`payment-service`) � port 8085

Same settings, database `payment_db`, plus:

| Property | What it does (simple words) |
|----------|-----------------------------|
| `razorpay.key.id=rzp_test_...` | Your Razorpay **test** API key (test payments only) |
| `razorpay.key.secret=...` | The secret half of the Razorpay key (like a password) |
| `jwt.secret=...` | Same secret key (so it can check the same ID cards) |
| `jwt.expiration=86400000` | Token life in milliseconds (86 400 000 ms = 24 hours) |

### 8.8 The Port Summary (memorize this little table)

| Service | Port |
|---------|------|
| Eureka Server | **8761** |
| API Gateway | **8080** |
| User Service | **8081** |
| Order Service | **8082** |
| Supplier-Inventory Service | **8083** |
| Notification Service | **8084** |
| Payment Service | **8085** |
| Frontend (dev / production) | **4200 / 10000** |

---

## 9. Building the Backend � Step by Step

### Step 9.1 � Create the project skeleton

1. Go to **https://start.spring.io** (Spring Initializr � a website that creates Spring Boot projects for you).
2. Choose: **Maven**, **Java 21**, **Spring Boot 4.x**.
3. Group: `com.example` � Artifact: the service name (e.g. `eureka-server`, `user-service`, �).
4. Add dependencies, click **Generate**, and unzip the downloaded project into your `backend` folder. Repeat for each service with its own dependencies (see 9.9).

> Instead of the website, you can also just copy this project's folders � they are already correct.

### Step 9.2 � Eureka Server (the phone directory)

1. Add dependency: `spring-cloud-starter-netflix-eureka-server`.
2. Add `@EnableEurekaServer` above the main class:

```java
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication { ... }
```

3. Set `server.port=8761` and the two "don't register yourself" settings (Section 8.1).
4. Run it ? open **http://localhost:8761** ? you see the Eureka dashboard (empty for now).

### Step 9.3 � User Service (accounts + JWT authentication)

1. Dependencies: Web, Security, Data JPA, Validation, Eureka Client, Actuator, PostgreSQL, Lombok, **jjwt (0.11.5)**, java-dotenv (Section 9.9 explains each).
2. Create the `User` entity: `id`, `name`, `email`, `contact`, `password`, `role` (DOCTOR/ADMIN), `status`.
3. Create `SecurityConfig` with a **BCryptPasswordEncoder** bean � passwords are stored as scrambled hashes, never as plain text.
4. Create **`JwtUtil`** � the ID-card machine:

```java
public String generateToken(Long userId, String role) {
    return Jwts.builder()
        .setSubject(userId.toString())      // who this card belongs to
        .claim("role", role)                // their job title (DOCTOR/ADMIN)
        .setIssuedAt(new Date())
        .setExpiration(new Date(System.currentTimeMillis() + 60 * 60 * 1000)) // valid 1 hour
        .signWith(getKey(), SignatureAlgorithm.HS256) // signed with the secret key
        .compact();
}
```

5. `UserService`:
   - `signup(...)` ? checks the email is not already used ? saves with BCrypt-hashed password.
   - `login(...)` ? finds the user ? checks the password with BCrypt ? returns the **JWT** (the ID card).
   - **Admin auto-creation**: on startup, if no user exists, it creates `admin@gmail.com` / `admin@123`.
   - `resetDoctorPassword(id, newPassword)` ? new BCrypt hash for a doctor (admin-only feature).
6. `UserController` (all endpoints under `/users`):

| Method | Endpoint | What it does |
|--------|----------|--------------|
| POST | `/users/signup` | Register a doctor |
| POST | `/users/login` | Log in ? returns JWT |
| POST | `/users/admin/change-password` | Admin changes own password |
| POST | `/users/{id}/reset-password?newPassword=` | **Admin resets a doctor's password** |
| GET | `/users/{id}` | Get one user's profile |
| GET | `/users` | List all users (admin) |
| PATCH | `/users/{id}/status` | Block / unblock a user |
| DELETE | `/users/{id}` | Delete a user |

### Step 9.4 � Supplier-Inventory Service (the medicine catalog)

1. Dependencies: Web, Data JPA, PostgreSQL, Eureka Client, RabbitMQ.
2. Entities: `Drug` (id, name, category, price, quantity) and `Supplier`.
3. Endpoints under `/inventory`:

| Method | Endpoint | What it does |
|--------|----------|--------------|
| POST | `/inventory/drug` | Add a medicine |
| GET | `/inventory/drug` | List medicines (used by the catalog) |
| GET | `/inventory/drug/{id}` | Get one medicine |
| PUT | `/inventory/drug/{id}` | Edit a medicine |
| DELETE | `/inventory/drug/{id}` | Remove a medicine |
| PUT | `/inventory/drug/reduce/{id}/{qty}` | Reduce stock (called by order service) |
| PUT | `/inventory/drug/increase/{id}/{qty}` | Increase stock |
| POST/GET/PUT/DELETE | `/inventory/supplier...` | Manage suppliers |

### Step 9.5 � Order Service (orders + **Feign Client** + **RabbitMQ**)

1. Dependencies: Web, Data JPA, PostgreSQL, Eureka Client, **OpenFeign**, Resilience4j, RabbitMQ.
2. Add `@EnableFeignClients` on the main class.
3. Create **Feign clients** � "ask a colleague" interfaces:

```java
@FeignClient(name = "SUPPLIER-INVENTORY-SERVICE")   // ask the phone book for this service
public interface InventoryClient {
    @GetMapping("/inventory/drug/{id}") Drug getDrug(@PathVariable Long id);
    @PutMapping("/inventory/drug/reduce/{id}/{qty}") void reduceStock(@PathVariable Long id, @PathVariable int qty);
}
```

   The order service calls `inventoryClient.reduceStock(...)` like a normal function � Feign finds the real service through Eureka and sends the HTTP request for you. Wrap the calls in a **Resilience4j circuit breaker** so the order service survives if inventory is down.

4. Create the RabbitMQ post office box (`RabbitMQConfig`): exchange `order_exchange`, queue `order_queue`, routing key `order_routing`.
5. `RabbitMQProducer` � sends the "order placed" message after a successful payment.
6. `OrderController`:

| Method | Endpoint | What it does |
|--------|----------|--------------|
| POST | `/orders` | Place an order (status PENDING, reduces stock via Feign) |
| GET | `/orders` | List orders (admin sees all) |
| PUT | `/orders/verify/{id}` | Admin verifies the order |
| PUT | `/orders/pick/{id}` | Admin marks it picked up |
| PUT | `/orders/cancel/{id}` | Cancel an order |
| PUT | `/orders/fail/{id}` / `retry/{id}` | Handle failed / retried payments |
| GET | `/orders/sales` | Sales report data |
| PUT | `/orders/update-status/{orderId}/{status}` | Direct status update |

### Step 9.6 � Payment Service (Razorpay sandbox)

1. Dependencies: Web, Data JPA, PostgreSQL, Eureka Client, RabbitMQ, **Razorpay SDK**.
2. Configure the test keys (`razorpay.key.id`, `razorpay.key.secret`) in `application.properties`.
3. Endpoints:

| Method | Endpoint | What it does |
|--------|----------|--------------|
| POST | `/payment/create` | Ask Razorpay to prepare a payment |
| POST | `/payment/success?orderId&amount&paymentId&signature&razorpayOrderId` | Frontend calls this after the payment popup; demo mode accepts the test signature, records the payment, and the order becomes **PLACED** |
| POST | `/payment/fail` | Record a failed payment |

### Step 9.7 � Notification Service (the RabbitMQ listener)

1. Dependencies: Web, Data JPA, PostgreSQL, Eureka Client, **RabbitMQ**.
2. Create `NotificationConsumer` with `@RabbitListener(queues = "order_queue")` � it wakes up whenever a message is in the box and saves a `Notification` row (user, message, read/unread).
3. Endpoints:

| Method | Endpoint | What it does |
|--------|----------|--------------|
| GET | `/notification` | My notifications |
| GET | `/notification/unread` | Only unread ones |
| PUT | `/notification/read` | Mark as read |
| POST | `/notification` | Send a broadcast |

### Step 9.8 � API Gateway (the front door + role-based authorization)

1. Dependencies: `spring-cloud-starter-gateway-server-webflux` (reactive gateway), Eureka Client, jjwt, Actuator.
2. Set `server.port=8080` and define the **routes** (the door signs) � Section 8.2 table.
3. Write a **JWT filter** (`JwtAuthFilter`) that runs on every request:
   - Reads the `Authorization: Bearer <token>` header.
   - Checks the signature with the same secret key (like checking the hologram).
   - Puts the user's ID and **role** into the request.
4. **Role-based rules** (who is allowed where):

| Path | Allowed for |
|------|-------------|
| `/users/login`, `/users/signup`, `/health` | Everyone (public) |
| `/users/{id}/reset-password` | **ADMIN only** (a DOCTOR token gets **403 Forbidden**) |
| `/users/**` (profile etc.) | Logged-in doctors & admin |
| `/orders/**`, `/payment/**` | Logged-in doctors & admin |
| `/inventory/**` | Logged-in users (doctors read, admin writes) |

### Step 9.9 � The Dependencies (each one in simple words)

| Dependency | What it does |
|------------|--------------|
| **Spring Boot DevTools** | Makes development nicer: auto-restart when code changes (optional in this project) |
| **Spring Data JPA** | Lets you save/read database rows using Java code, no SQL needed |
| **Lombok** | Removes boring boilerplate code � `@Data` creates getters/setters automatically |
| **Spring Web** | Makes a REST API (endpoints like `/users/login`) |
| **Spring Security** | Password hashing (BCrypt) and login rules |
| **Spring Validation** | Checks inputs (e.g. "email is required") |
| **Eureka Client** | Registers the service in the phone book |
| **OpenFeign** | Lets services call each other easily |
| **Resilience4j** | Circuit breakers � protects services when others are down |
| **RabbitMQ** | Message bus � the post office |
| **jjwt** | Creates and checks JWT ID cards |
| **PostgreSQL Driver** | Lets Java talk to the database |
| **Actuator** | Adds the `/health` check URL |
| **java-dotenv** | Reads environment variables / `.env` files |

---

## 10. Testing Every Endpoint in Postman

**Postman** is a free app for testing APIs. Download it from https://www.postman.com.

### Step 10.1 � Prepare

1. Start all services (Eureka first, then the 6 services, then the gateway) � Section 4 of the README.
2. Open Postman ? **New ? HTTP Request**.
3. Use the **gateway** address: `http://localhost:8080`.

### Step 10.2 � The test list (do them in this order)

| # | Method | URL | Body (JSON) | Expected |
|---|--------|-----|-------------|----------|
| 1 | GET | `/health` | � | `200` |
| 2 | POST | `/users/signup` | `{ "name": "Dr Test", "email": "dr1@test.com", "contact": "9876543210", "password": "pass1234", "role": "doctor" }` | `200` + user JSON |
| 3 | POST | `/users/login` | `{ "email": "dr1@test.com", "password": "pass1234" }` | `200` + **JWT token** (copy it) |
| 4 | GET | `/inventory/drug` | � | `200` + list of medicines |
| 5 | POST | `/orders` | `{ "drugId": 9, "quantity": 2 }` | `200` + order (PENDING) |
| 6 | POST | `/payment/success?orderId=1&amount=50&paymentId=test&signature=test&razorpayOrderId=test` | � | `200` + order ? PLACED |
| 7 | GET | `/notification` | � | `200` + "order placed" notification |
| 8 | POST | `/users/login` | `{ "email": "admin@gmail.com", "password": "admin@123" }` | `200` + **admin token** |
| 9 | GET | `/orders` (admin token) | � | `200` + all orders |
| 10 | PUT | `/orders/verify/1` (admin token) | � | `200` ? VERIFIED |
| 11 | PUT | `/orders/pick/1` (admin token) | � | `200` ? PICKED UP |
| 12 | POST | `/users/2/reset-password?newPassword=newpass1` (admin token) | � | `200` "Password updated successfully" |
| 13 | POST | `/users/2/reset-password?newPassword=hack` (doctor token) | � | **`403`** (doctors are blocked) |

> **Tip:** In Postman, create an Environment with `base = http://localhost:8080` and use `{{base}}` in every URL.

---

## 11. Building the Angular Frontend � Step by Step

### Step 11.1 � Create the Angular app

```bash
npm install -g @angular/cli        # install the Angular command tool
ng new pharmacare                  # creates the project (choose SCSS or CSS)
cd pharmacare
npm install                        # install packages
ng serve                           # start the dev server ? http://localhost:4200
```

### Step 11.2 � Create the pages (components)

```bash
ng generate component pages/home
ng generate component pages/login
ng generate component pages/doctor-dashboard
ng generate component pages/admin-dashboard
ng generate component pages/about
ng generate component pages/services
ng generate component pages/contact
ng generate component pages/learn
ng generate component pages/pricing
ng generate component components/header
ng generate component components/footer
```

### Step 11.3 � Create the services, guard and interceptor

```bash
ng generate service services/api
ng generate service services/auth
ng generate service services/razorpay
ng generate guard guards/auth
ng generate interceptor interceptors/auth
```

- **api.service.ts** � one central file with every backend call (`login`, `signup`, `getDrugs`, `createOrder`, `verifyOrder`, `resetDoctorPassword`, �).
- **auth.service.ts** � saves the JWT in `localStorage`, remembers the current user.
- **auth.interceptor.ts** � automatically adds `Authorization: Bearer <token>` to every request.
- **auth.guard.ts** � blocks `/doctor` and `/admin` when nobody is logged in.

### Step 11.4 � Wire the routes

In `app.routes.ts`, map paths to pages and protect the dashboards with the guard:

```ts
{ path: 'login',  component: LoginComponent },
{ path: 'doctor', component: DoctorDashboardComponent, canActivate: [authGuard] },
{ path: 'admin',  component: AdminDashboardComponent, canActivate: [authGuard] },
{ path: '**', redirectTo: '' }
```

### Step 11.5 � Add the dev proxy (frontend ? backend connection)

Create `proxy.conf.json` � it makes the frontend talk to the gateway during development:

```json
{ "/api": { "target": "http://localhost:8080", "changeOrigin": true, "pathRewrite": { "^/api": "" } } }
```

Use `apiUrl: '/api'` in `environments/environment.ts`, so every request goes to `/api/users/login` and the proxy quietly forwards it to `http://localhost:8080/users/login`.

### Step 11.6 � Production server

Create `server.js` (Express) that serves the built files + SPA fallback + `/health`:

```bash
npm install express compression
```

`npm start` ? runs `node server.js` on port 10000 (or Render's port). Build first with `npm run build`.

---

## 12. Connecting Frontend & Backend + Full Working Tests

### How the two sides connect

| What the user does | Frontend calls | Backend handles |
|--------------------|----------------|-----------------|
| Signs up | `POST /api/users/signup` | user-service saves the doctor |
| Logs in | `POST /api/users/login` | user-service checks password, returns JWT |
| Searches medicines | `GET /api/inventory/drug` | inventory-service searches the catalog |
| Places order | `POST /api/orders` | order-service reduces stock (Feign) + creates order |
| Pays | `POST /api/payment/success?...` | payment-service records payment ? PLACED |
| Doctor opens dashboard | `GET /api/orders`, `GET /api/notification/...` | order + notification services |
| Admin verifies/picks up | `PUT /api/orders/verify/{id}`, `/pick/{id}` | order-service updates status |
| Admin resets password | `POST /api/users/{id}/reset-password` | user-service (ADMIN only) |

### The full working tests we ran (and they passed)

1. **Signup test** � new doctor registers ? page auto-redirects to login with email pre-filled + success banner. ?
2. **Login test** � doctor logs in ? JWT stored ? dashboard opens. ?
3. **Catalog test** � 13 medicines shown, search "Dolo" returns exactly 1 card. ?
4. **Order + payment test** � cart ? checkout ? order PENDING ? Razorpay demo payment ? order PLACED. ?
5. **Admin test** � order appears on admin dashboard in real time ? Verify ? Picked Up with date. ?
6. **Password reset test** � admin resets doctor's password in the new modal ? old password rejected ("Invalid password") ? new password logs in. ?
7. **Security test** � a doctor token calling the reset endpoint gets **403**. ?
8. **Keep-alive test** � all 8 `/health` URLs return 200. ?

---

## 13. Pushing & Committing to GitHub (the Git Commands)

Open a terminal in your project folder and run these commands **in order**:

```bash
git init                              # 1. start tracking files in this folder
git add .                             # 2. add all files to the "staging area"
git commit -m "Initial commit"        # 3. save a snapshot with a message
git branch -M main                    # 4. rename the branch to "main"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git   # 5. connect to GitHub
git push -u origin main               # 6. upload the snapshot to GitHub
```

Useful everyday commands:

```bash
git status            # what changed?
git add file.js       # stage one file
git commit -m "fix"   # commit with a message
git pull              # download the latest from GitHub
git push              # upload your commits
git log --oneline     # show commit history
```

The two real repos for this project are:

- Backend: `https://github.com/rahman-2503/pharmacy-managment-system` (branch `main`)
- Frontend: `https://github.com/rahman-2503/-pharmacy-frontend` (branches `master` and `main`)

> **Tip:** create a **GitHub Personal Access Token** (Settings ? Developer settings ? Tokens) and use it as the password when GitHub asks � it is more secure than your real password.

---

## 14. Creating Docker Images � Step by Step

**Docker** packages an app with everything it needs (like a moving box with the furniture already inside). Render runs these boxes.

### Step 14.1 � The Dockerfile (one per service)

Each service folder contains a `Dockerfile` like this:

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS build   # stage 1: build with Java 21
WORKDIR /app
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN chmod +x mvnw
RUN ./mvnw dependency:go-offline -B           # download libraries
COPY src src
RUN ./mvnw package -DskipTests -B             # compile into app.jar

FROM eclipse-temurin:21-jre-alpine            # stage 2: small runtime image
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8081                                   # the service port
ENTRYPOINT ["java", "-jar", "app.jar"]        # start the app
```

### Step 14.2 � Build, tag and push

```bash
docker login                     # log in to Docker Hub (your username + password)
docker build -t rahman5187/user-service:4.0.0 .        # build the image
docker push rahman5187/user-service:4.0.0              # upload it to Docker Hub
```

Repeat for each service with its own name and port:

| Service | Image name | Port |
|---------|------------|------|
| Eureka Server | `rahman5187/eureka-server:4.0.0` | 8761 |
| User Service | `rahman5187/user-service:4.0.0` | 8081 |
| Order Service | `rahman5187/order-service:4.0.0` | 8082 |
| Supplier-Inventory Service | `rahman5187/supplier-inventory-service:4.0.0` | 8083 |
| Notification Service | `rahman5187/notification-service:4.0.0` | 8084 |
| Payment Service | `rahman5187/payment-service:4.0.0` | 8085 |
| API Gateway | `rahman5187/api-gateway:4.0.0` | 8080 |

```bash
docker images        # see your local images
docker run -p 8081:8081 rahman5187/user-service:4.0.0   # test an image locally
```

---

## 15. Free Database: Aiven PostgreSQL (Step by Step)

The project uses **5 databases** (one per service). Aiven gives you a **free PostgreSQL** where you can create all five.

### Step 15.1 � Create the account & the free database

1. Go to **https://aiven.io** ? **Sign Up** (free).
2. After login: **Create a new service**.
3. Choose **Aiven for PostgreSQL**.
4. **Cloud:** choose the provider with the "Free" tag (e.g. Google Cloud free region).
5. **Plan:** choose **Hobbyist (Free)** � 1 GB RAM, 5 GB storage.
6. **Service name:** `pharmacy-postgres` ? **Create**.
7. Wait ~1 minute until the service shows **Running**.

### Step 15.2 � Find the connection details

In the service overview you will see:

- **Host** � e.g. `pharmacy-postgres-xxxxxx-project.aivencloud.com`
- **Port** � e.g. `28766`
- **User** � `avnadmin`
- **Password** � shown once after creation (copy and save it!)
- **SSL** � Aiven requires `sslmode=require`

### Step 15.3 � Create the 5 databases

Install `psql` (PostgreSQL command tool) or use a free GUI like **pgAdmin / DBeaver**, connect with the details above, and run:

```sql
CREATE DATABASE pharmacy_db;
CREATE DATABASE order_db;
CREATE DATABASE pharmacy_inventory;
CREATE DATABASE payment_db;
CREATE DATABASE notification_db;
```

### Step 15.4 � Integrate with the services (environment variables)

The services already read `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`. Set them like this (on Render or in a `.env` file):

```
DB_URL=jdbc:postgresql://pharmacy-postgres-xxxxxx.aivencloud.com:28766/pharmacy_db?sslmode=require
DB_USERNAME=avnadmin
DB_PASSWORD=your-aiven-password
```

Use the same host/port/password for all 5 services � only the database name changes (`order_db`, `pharmacy_inventory`, `payment_db`, `notification_db`). Hibernate creates the tables automatically on first startup.

---

## 16. Deploying Everything on Render (Free Tier) � Step by Step

### Step 16.1 � Create a Render account

Go to **https://render.com** ? **Sign Up** (free) with GitHub (recommended � connecting GitHub makes deploys one click).

### Step 16.2 � Deploy the frontend (from the GitHub repo)

1. Dashboard ? **New** ? **Web Service**.
2. **Connect the repository** `rahman-2503/-pharmacy-frontend` (branch `master`).
3. Name: `pharmacy-frontend`.
4. Runtime: **Node**.
5. Build command: `npm install && npm run build`
6. Start command: `npm start`
7. **Health Check Path:** `/health` (Render uses it to know the app is alive).
8. Plan: **Free** ? **Create Web Service**.
9. Wait for the deploy to finish (you see "Live" + your URL `https://pharmacy-frontend-xxxx.onrender.com`).

### Step 16.3 � Deploy the 7 backend services (from Docker images)

Render can run a Docker image directly without building anything:

1. **New ? Web Service ? "Deploy an existing image from a registry".**
2. Image: `docker.io/rahman5187/eureka-server:4.0.0` ? **deploy first**.
3. Then deploy the others in this order: user-service ? inventory-service ? order-service ? notification-service ? payment-service ? **api-gateway last**.
4. For each service set the environment variables (Section 15.4 + the ones below) and the health check path `/health`.
5. Free plan for all.

**Environment variables to set on Render (example values):**

| Variable | Example value |
|----------|---------------|
| `DB_URL` | `jdbc:postgresql://<aiven-host>:28766/user_db?sslmode=require` (per service) |
| `DB_USERNAME` | `avnadmin` |
| `DB_PASSWORD` | your Aiven password |
| `EUREKA_URL` | `http://eureka-server-xxxx.onrender.com/eureka/` |
| `RABBITMQ_HOST` | your hosted RabbitMQ host (or a free CloudAMQP instance) |
| `RABBITMQ_USERNAME` / `RABBITMQ_PASSWORD` | RabbitMQ login |
| `JWT_SECRET` | a long random string (same on all services!) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay test keys |
| `CORS_ALLOWED_ORIGINS` | your frontend URL |

> For a totally free setup, RabbitMQ can also be a free **CloudAMQP** instance (register at cloudamqp.com ? free "Little Lemur" plan ? put its host/user/password in the variables).

### Step 16.4 � Start order matters (important!)

1. Eureka must be **live** first (other services crash-loop until it is up).
2. Start the 5 services next.
3. Start the **API Gateway last** � it connects to everything.

### Step 16.5 � Add the keep-alive so it never sleeps

Render free tier **sleeps after 15 minutes without traffic**. Add the two GitHub Actions workflows (Section 7) � they ping all 8 `/health` URLs every 5 minutes, so the apps never sleep. Both repos in this project already have them, and all checks pass.

### Step 16.6 � Final checks

- Visit your frontend URL ? you should see the home page.
- `https://<your-frontend>/health` ? `{"status":"UP"...}`.
- Log in as `admin@gmail.com` / `admin@123` ? admin dashboard works.
- Sign up a doctor ? order a medicine ? pay with the test gateway ? verify on the admin dashboard.
- Wait 30 minutes and check the site again � it should still be instant (keep-alive is working).

---

*End of Part II � Building Everything From Scratch. Combined with Part I, this document covers the entire Pharmacare platform: what it is, how it works, how to build it, test it, and put it live.*
