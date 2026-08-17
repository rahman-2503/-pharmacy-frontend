# 💊 Pharmacare — Pharmacy Management System (Microservices)

**Pharmacare** is a full-stack, microservices-based medical ordering platform that connects **doctors**, a **store administrator**, and **medicine suppliers** in one system.

- 👩‍⚕️ **Doctors** sign up, log in, browse the medicine catalog, add items to a cart, place orders, pay online (Razorpay sandbox), and track order status in real time.
- 🛠️ **Admin** (single hardcoded account) manages the full medicine catalog, suppliers, doctor accounts (block / delete / **reset passwords**), verifies and picks up orders, and views live analytics and sales reports.
- 🔔 Everything stays in sync with **live notifications** delivered over a RabbitMQ message bus.

> 🚀 **Live demo:** <https://pharmacy-frontend-0ftx.onrender.com>
>
> 📘 **Full documentation:** [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md)

---

## Table of Contents

1. [What Does It Do? (Simple Explanation)](#-what-does-it-do-simple-explanation)
2. [Tech Stack](#-tech-stack)
3. [Prerequisites](#-prerequisites)
4. [Local Setup & Installation](#-local-setup--installation)
5. [Environment Variables](#-environment-variables)
6. [Project Structure](#-project-structure)
7. [API Gateway Routes](#-api-gateway-routes)
8. [24/7 Keep-Alive (Render Free Tier)](#-247-keep-alive-render-free-tier)
9. [Deploying to Render](#-deploying-to-render)

---

## 🌟 What Does It Do? (Simple Explanation)

Imagine a hospital pharmacy that used to take medicine orders over phone calls and paper. **Pharmacare** replaces that with a website:

1. A **doctor** creates an account (takes 30 seconds).
2. The doctor opens the **online medicine catalog**, searches for a medicine, and adds it to a **cart**.
3. The doctor **checks out** and pays with a **test (sandbox) payment gateway**.
4. The order appears **instantly on the admin dashboard** with a live notification.
5. The **admin verifies** the order, packs the medicine, marks it **Verified**, then marks it **Picked Up** with a pickup date.
6. The doctor sees the **status change live** on their dashboard.

Everything is built as small independent **microservices** (like separate small apps that talk to each other), each with its own database — so the system is easy to scale, maintain, and fix.

---

## 🧱 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Angular 22 (TypeScript), Express static server, Chart.js analytics, custom CSS design system (glassmorphism + animations) |
| **API Gateway** | Spring Cloud Gateway (WebFlux, reactive) — single entry point on port **8080** |
| **Service Discovery** | Eureka Server — the "phone directory" on port **8761** |
| **Microservices** | Spring Boot 3 (Java 21) — User, Order, Supplier-Inventory, Payment, Notification |
| **Service-to-service** | OpenFeign (HTTP clients) + Resilience4j circuit breakers |
| **Messaging** | RabbitMQ — order events & live notifications |
| **Auth** | JWT (JSON Web Tokens) — signed digital ID cards |
| **Payments** | Razorpay test/sandbox gateway |
| **Databases** | PostgreSQL × 5 (one database per service) |
| **Deployment** | Render (free tier), Docker images, GitHub Actions keep-alive |

### The 5 Microservices + Ports

| Service | Port | Database | Responsibility |
|---------|------|----------|----------------|
| `eureka-server` | 8761 | — | Service registry (phone directory) |
| `api-gateway` | 8080 | — | Single front door, JWT checks, routing |
| `user-service` | 8081 | `pharmacy_db` | Signup, login, JWT, doctor & admin management, password resets |
| `order-service` | 8082 | `order_db` | Order creation, status (PENDING → PLACED → VERIFIED → PICKED UP) |
| `supplier-inventory-service` | 8083 | `pharmacy_inventory` | Medicine catalog, stock, suppliers |
| `notification-service` | 8084 | `notification_db` | Live alerts & notifications (RabbitMQ) |
| `payment-service` | 8085 | `payment_db` | Razorpay integration, payment records |

---

## 🛠 Prerequisites

Install these before starting:

| Tool | Why | Version |
|------|-----|---------|
| **Node.js + npm** | Run the Angular frontend | Node 22+ (project pins 22.22.3), npm 11+ |
| **Java JDK** | Compile & run the microservices | Java 21 (Temurin/OpenJDK) |
| **Maven** (or use `./mvnw`) | Build Spring Boot services | 3.9+ (Maven Wrapper included) |
| **PostgreSQL** | 5 databases used by the services | 14+ |
| **RabbitMQ** | Message bus for notifications | 3.x (Erlang) |
| **Docker** *(optional)* | Easier Postgres/RabbitMQ, Render deployments | 24+ |
| **Git** | Clone the repositories | any recent |

> 💡 **Windows tip:** Docker Desktop makes Postgres + RabbitMQ trivial — see Step 2.

---

## ⚙️ Local Setup & Installation

### Step 1 — Clone both repositories

```bash
# Frontend (Angular app)
git clone https://github.com/rahman-2503/-pharmacy-frontend.git
cd -pharmacy-frontend

# Backend (microservices) — separate terminal
git clone https://github.com/rahman-2503/pharmacy-managment-system.git
cd pharmacy-managment-system
```

### Step 2 — Start PostgreSQL & RabbitMQ (Docker)

From a terminal (or Docker Desktop):

```bash
# PostgreSQL
docker run -d --name pharma-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres postgres:16

# RabbitMQ (with management UI at http://localhost:15672, guest/guest)
docker run -d --name pharma-rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

Then create the **5 databases**:

```bash
docker exec -it pharma-pg psql -U postgres -c "CREATE DATABASE pharmacy_db;"
docker exec -it pharma-pg psql -U postgres -c "CREATE DATABASE order_db;"
docker exec -it pharma-pg psql -U postgres -c "CREATE DATABASE pharmacy_inventory;"
docker exec -it pharma-pg psql -U postgres -c "CREATE DATABASE payment_db;"
docker exec -it pharma-pg psql -U postgres -c "CREATE DATABASE notification_db;"
```

> Tables are created automatically by Hibernate (`ddl-auto=update`). No SQL migration files needed.

### Step 3 — Run the microservices (in order!)

Start each service in its own terminal. **Order matters:** Eureka first, then the services, then the gateway.

```bash
# 1) Eureka Server  -> http://localhost:8761
cd eureka-server
./mvnw spring-boot:run

# 2) User Service  -> http://localhost:8081
cd user-service
./mvnw spring-boot:run

# 3) Supplier-Inventory Service  -> http://localhost:8083
cd supplier-inventory-service
./mvnw spring-boot:run

# 4) Order Service  -> http://localhost:8082
cd order-service
./mvnw spring-boot:run

# 5) Notification Service  -> http://localhost:8084
cd notification-service
./mvnw spring-boot:run

# 6) Payment Service  -> http://localhost:8085
cd payment-service
./mvnw spring-boot:run

# 7) API Gateway (last)  -> http://localhost:8080
cd API-Gateway
./mvnw spring-boot:run
```

> On Windows PowerShell use `.\mvnw.cmd spring-boot:run`. Give each service ~15–30 seconds to register with Eureka before starting the next one. You can watch them appear at `http://localhost:8761`.

### Step 4 — Run the frontend

```bash
cd -pharmacy-frontend
npm install
npm start          # production mode  -> http://localhost:10000
# OR for development with hot reload + API proxy:
npx ng serve       # dev mode        -> http://localhost:4200
```

During development, `proxy.conf.json` forwards every `/api` request to the gateway at `http://localhost:8080`, so the frontend never needs to know where the backend lives.

### Step 5 — Log in

The **admin account is created automatically** on first start of the user-service:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@gmail.com` | `admin@123` |

Doctors simply click **Sign Up** and create their own account. 👨‍⚕️

---

## 🔑 Environment Variables

Every value has a sensible local default, so you can run without configuring anything. Override these on Render/cloud:

| Variable | Used By | Default (local) |
|----------|---------|------------------|
| `DB_URL` | all services | `jdbc:postgresql://localhost:5432/<db>` |
| `DB_USERNAME` / `DB_PASSWORD` | all services | `postgres` / `postgres` |
| `EUREKA_URL` | all services | `http://localhost:8761/eureka/` |
| `JWT_SECRET` | user, payment, gateway | `architect-evaluation-secure-key-...` |
| `RABBITMQ_HOST` / `RABBITMQ_PORT` | order, inventory, payment, notification | `localhost` / `5672` |
| `RABBITMQ_USERNAME` / `RABBITMQ_PASSWORD` | same | `guest` / `guest` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | payment-service | test keys (sandbox) |
| `SERVER_PORT` | each service | per-service port |
| `CORS_ALLOWED_ORIGINS` | api-gateway | `http://localhost:4200` + render domains |

---

## 📁 Project Structure

```
pharmacy-managment-system/            # Backend (Java microservices)
├── eureka-server/                    # Service registry (8761)
├── API-Gateway/                      # Spring Cloud Gateway (8080) + JWT filter
├── user-service/                     # Auth, users, admin management (8081)
├── order-service/                    # Orders & status lifecycle (8082)
├── supplier-inventory-service/       # Drugs catalog, stock, suppliers (8083)
├── notification-service/             # Live notifications via RabbitMQ (8084)
└── payment-service/                  # Razorpay sandbox payments (8085)

-pharmacy-frontend/                   # Frontend (Angular 22)
└── src/app/
    ├── pages/
    │   ├── home/                     # Landing page (hero, marquee, features)
    │   ├── login/                    # Signup + login (auto-redirect, banners)
    │   ├── doctor-dashboard/         # Catalog, cart, checkout, order tracking
    │   ├── admin-dashboard/          # Catalog/doctors/orders/analytics/sales
    │   ├── about/ services/ contact/ learn/ pricing/   # Marketing pages
    ├── components/ header/ footer/   # Shared layout
    ├── services/ api.service.ts      # All backend calls
    │             auth.service.ts     # Session + JWT handling
    │             razorpay.service.ts # Payment widget
    ├── guards/ auth.guard.ts         # Protect /doctor & /admin routes
    ├── interceptors/ auth.interceptor.ts  # Attaches JWT to requests
    ├── shared/animations/            # Scroll-reveal animations
    └── styles.css                    # Global design system + animations
```

---

## 🌐 API Gateway Routes

All requests go through the gateway (`/api` prefix on the frontend, direct path on Render):

| Route | Service | Example |
|-------|---------|---------|
| `/users/**` | user-service | `/users/signup`, `/users/login`, `/users/{id}/reset-password` |
| `/orders/**` | order-service | `POST /orders`, `GET /orders` |
| `/inventory/**` | supplier-inventory-service | `GET /inventory/drugs` |
| `/payment/**` | payment-service | `POST /payment/success` (Razorpay callback) |
| `/notification/**` | notification-service | user notifications |
| `/health` | every service | uptime checks (used by keep-alive) |

---

## ⏰ 24/7 Keep-Alive (Render Free Tier)

**Render free tier spins down any service after ~15 minutes of inactivity**, which would make the site slow or asleep. This project prevents that with a **GitHub Actions cron job that pings every 5 minutes**:

- 📄 `-pharmacy-frontend/.github/workflows/keep-alive.yml`
- 📄 `pharmacy-managment-system/.github/workflows/keep-warm.yml`

Both workflows run on `*/5 * * * *` (every 5 minutes) and curl the `/health` endpoint of **all 8 services** in parallel. As long as one of the two workflows fires, no service ever sleeps.

**Verified working:**
- ✅ All 8 `/health` endpoints return `200 OK` (checked live).
- ✅ Both workflows run successfully (GitHub Actions runs marked `success`).
- ✅ Both repos are **public**, so GitHub Actions minutes are **free & unlimited** — this cron costs nothing.

> ⚠️ **Note:** GitHub Actions schedules are "best effort" and can occasionally fire late. If you ever see a slow first page load (~30–60 s cold start), that means pings were delayed. For a bulletproof setup, add a free **UptimeRobot** monitor (5-min interval) for each service URL — see [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md#-247-keep-alive-verification) for exact steps.

---

## 🚀 Deploying to Render

**Frontend** (web service, Node):
1. Connect the repo `rahman-2503/-pharmacy-frontend`, branch `master`.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Health check path: `/health`

**Backend services** (Docker images): each service builds via its `Dockerfile` and is pushed to Docker Hub as `rahman5187/<service>:4.0.0`. Point the Render service at the image and set the env vars from the table above (use an Aiven PostgreSQL and a hosted RabbitMQ in production).

---

## 📄 License

Private project — all rights reserved.
