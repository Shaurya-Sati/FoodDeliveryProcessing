# Food Delivery Processing System

A browser-based food ordering demonstration built with C++17, Drogon, MySQL 8, and plain HTML/CSS/JavaScript. It illustrates relational data integrity and transactional order creation alongside a producer-consumer worker that advances order status in the background.

## Problem statement and objectives

The project models a small food menu and order workflow. Customers can find dishes, manage a cart, place orders, and see order progress. Menu maintenance and order reports are included as demonstration tools. The implementation is intended to make database and operating-system concepts visible in working code.

## Features

- Customer menu, search, category filter, quantity-based cart, checkout, and recent-order view.
- MySQL-backed menu, orders, and order items; order prices are read from the database, not trusted from the request.
- Atomic asynchronous order transaction: the order and all line items commit together or roll back.
- Menu management (add, edit, hide, restore) with backend validation.
- Aggregate reports for order count, value, average, and status counts.
- Mutex/condition-variable protected FIFO queue and a joinable background worker. It updates statuses from `PLACED` to `PREPARING` to `READY`, with a five-second preparation delay.
- SQL schema and repeatable sample menu seed.

## Technology stack

| Area | Technology |
|---|---|
| Backend | C++17, Drogon 1.9 |
| Database | MySQL 8, Drogon ORM/database client |
| Frontend | HTML, CSS, vanilla JavaScript |
| Build | CMake and Ninja |
| Concurrency | `std::thread`, `std::mutex`, `std::condition_variable`, `std::queue` |

## Architecture and data flow

The customer UI calls the Drogon HTTP API. The backend validates input and uses parameterized SQL. An order is inserted with its items inside a MySQL transaction. After commit, the order ID is submitted to a synchronized queue. A worker consumes IDs and updates status. The browser polls the orders API every five seconds. See [docs/architecture.md](./docs/architecture.md).

## Project structure

```text
backend/
  main.cpp
  adminroutes.cpp / adminroutes.h
  reportroutes.cpp / reportroutes.h
  orderprocessor.cpp / orderprocessor.h
  CMakeLists.txt
  config.example.json
database/
  schema.sql
  sample_data.sql
frontend/
  index.html
  script.js
  style.css
docs/
  architecture.md
  dbms_os_concepts.md
```

## Database schema

`food_items` holds menu details and availability. `orders` stores the total, status, and timestamp. `order_items` stores the price snapshot and quantity, with foreign keys to both parent tables. All tables use InnoDB. The schema includes primary/foreign keys, check constraints, and indexes for menu availability/category, order status/time, and line-item joins.

For a new database, run from a MySQL 8 client:

```sql
SOURCE C:/path/to/FoodDeliverySystem/database/schema.sql;
SOURCE C:/path/to/FoodDeliverySystem/database/sample_data.sql;
```

`CREATE TABLE IF NOT EXISTS` does not alter an existing table. These files do not drop tables or delete existing data. For an existing installation, inspect its schema first and apply any needed changes as a separately reviewed migration. The seed checks for each dish name before inserting it, so repeated execution does not create duplicates of these six sample dishes.

## Prerequisites and local configuration

- Windows with MSYS2 UCRT64, GCC/G++, CMake, Ninja, Drogon, and Trantor installed.
- MySQL 8 running locally with a database account authorized for `food_delivery`.
- VS Code Live Server or another static frontend server.

Keep the database password in the local `backend/config.json`; that path is ignored by `.gitignore`. For a new setup, copy `backend/config.example.json` to `backend/config.json`, then enter local database credentials. Do not commit the local config or put credentials in source code. The example uses a dedicated `food_app` user; create/configure that account separately with only the required database privileges. Existing local credentials are not overwritten by this project.

## Build and run

From an MSYS2 UCRT64 terminal:

```bash
cd /c/Users/<you>/path/to/FoodDeliverySystem/backend
cmake -S . -B build -G Ninja
cmake --build build
./build/food_delivery.exe
```

The backend reads `config.json` relative to the `backend` working directory and listens on `http://127.0.0.1:8080` with the supplied local configuration. Health check: `http://127.0.0.1:8080/`.

Open `frontend/index.html` through VS Code Live Server at `http://127.0.0.1:5500`. The backend CORS policy currently allows that exact origin. If your frontend uses another origin, update the CORS policy in `backend/main.cpp`.

## API

All request bodies are JSON. IDs and quantities must be positive integers. Order prices are calculated using current database prices.

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Backend health response |
| GET | `/api/foods` | Available menu items |
| POST | `/api/orders` | Create an order and transactionally insert its line items |
| GET | `/api/orders` | Joined order/line-item rows (the frontend groups rows by order ID) |
| PUT | `/api/orders/status` | Set an order status to `PLACED`, `PREPARING`, or `READY` |
| GET | `/api/admin/foods` | List all menu items, including unavailable items |
| POST | `/api/admin/foods` | Add a menu item |
| PUT | `/api/admin/foods` | Edit name, category, price, and rating |
| PUT | `/api/admin/foods/availability` | Hide or restore an item |
| GET | `/api/reports/summary` | SQL aggregate summary of order totals and statuses |

Example:

```json
POST /api/orders
{
  "items": [
    { "food_id": 1, "quantity": 2 }
  ]
}
```

`price` fields sent by a client are ignored. Invalid IDs, quantities, unavailable dishes, and totals exceeding the supported `DECIMAL(10,2)` order amount are rejected. Admin and status-management routes currently have **no authentication or authorization**; they are suitable only for a trusted local academic demonstration. Hiding the admin section is not access control.

## Testing

With MySQL and the backend running, use the browser UI or `curl.exe`. Examples:

```powershell
curl.exe -i http://127.0.0.1:8080/
curl.exe -i http://127.0.0.1:8080/api/foods
curl.exe -i http://127.0.0.1:8080/api/admin/foods
curl.exe -i http://127.0.0.1:8080/api/reports/summary
curl.exe -i -X POST http://127.0.0.1:8080/api/orders `
  -H "Content-Type: application/json" `
  -d "{`"items`":[{`"food_id`":1,`"quantity`":2,`"price`":0.01}]}"
```

The last request demonstrates that a client-supplied price does not set the stored total. A request containing a valid item followed by a nonexistent ID is useful for checking rollback: the endpoint should return `400` and the order count should not increase. Do not run destructive tests against valuable data.

See the end-to-end checklist and academic mapping in [docs/dbms_os_concepts.md](./docs/dbms_os_concepts.md).

## Concepts demonstrated

- **DBMS:** relational schema, primary and foreign keys, constraints, indexes, parameterized CRUD, joins, aggregates, InnoDB transactions, commit/rollback, persistence.
- **OS:** FIFO producer-consumer queue, mutex-protected queue access, predicate condition-variable wait, worker notification, background thread, and orderly join during shutdown.

This is not a CPU scheduler implementation.

## Known limitations

- No login, authorization, payment processing, delivery assignment, or customer-specific order history.
- Admin and status APIs are unauthenticated and must not be exposed to an untrusted network.
- Order history is returned without pagination.
- Order creation is asynchronous with respect to the Drogon event loop; the worker's database status updates use blocking client calls only on its dedicated thread.
- The worker drains queued work during shutdown, so shutdown can take several preparation intervals.
- CORS is configured for one local frontend origin.
- Database-dependent tests require a running MySQL server and a valid local configuration.

## Future enhancements

Authentication and role-based authorization, paginated order history, customer details/cancellation, payment, delivery assignment, inventory, WebSockets, and comparative scheduling algorithms are intentionally outside this foundation.

## Troubleshooting

- **Backend exits during startup:** run it from `backend/` so `config.json` is found; check MySQL availability and local Drogon configuration.
- **Database connection errors:** confirm MySQL is listening on the configured host/port, the account can access `food_delivery`, and schema creation has completed.
- **Browser CORS errors:** serve the frontend from `http://127.0.0.1:5500` or update the origin header in `main.cpp`.
- **Empty menu:** run `database/schema.sql` and `database/sample_data.sql`, then refresh the menu.
- **Build cannot find Drogon:** use the MSYS2 UCRT64 shell and verify Drogon/Trantor CMake packages are installed in the paths configured in `backend/CMakeLists.txt`.
