# Architecture and request flow

## Components

- `backend/main.cpp` initializes Drogon, configures CORS and routes, validates customer requests, and coordinates transactional order creation.
- `backend/adminroutes.cpp` implements menu management.
- `backend/reportroutes.cpp` performs the SQL report aggregation.
- `backend/orderprocessor.cpp` owns the synchronized FIFO and background worker.
- `frontend/` contains the browser application; it calls the JSON API and polls order status.
- `database/` contains the MySQL schema and a repeatable sample menu seed.

## Order lifecycle

1. Customer UI sends `POST /api/orders` with food IDs and quantities.
2. The backend validates the JSON fields and opens a Drogon asynchronous transaction.
3. Within the transaction, it inserts a `PLACED` order, reads each food's current name/price/availability, inserts each line item, and updates the total in cents.
4. An invalid/nonexistent/unavailable item or SQL error rolls back the transaction. Only the successful commit callback submits the order ID to the worker queue.
5. The producer locks the queue mutex, enqueues the ID, releases the mutex, and notifies the condition variable.
6. The worker waits with a predicate (`stopping || !orderQueue.empty()`), removes one ID while holding the mutex, and performs DB updates on its own thread.
7. The worker moves a still-`PLACED` order to `PREPARING`, waits five seconds, then moves a still-`PREPARING` order to `READY`.
8. The browser refreshes `GET /api/orders` every five seconds and groups the joined rows into orders. Reports are fetched separately from `GET /api/reports/summary`.

```text
Customer UI
    | HTTP / JSON
    v
Drogon route + request validation
    | asynchronous prepared SQL
    v
MySQL transaction: order + items + trusted prices
    | commit succeeds
    v
Producer -> mutex-protected FIFO -> condition variable -> worker
                                                  | status writes
                                                  v
                                               MySQL
                                                  |
                                    browser polls order API
```

## Shutdown

After Drogon's run loop exits, `main.cpp` signals the worker to stop. The worker wakes, finishes draining already queued orders, exits when the queue is empty, and is joined before the processor is destroyed. Processing delay is isolated to the worker thread and does not sleep on a request/event-loop thread.

## Operational boundaries

The menu-admin and status-update routes are not authenticated. CORS is restricted to the configured local frontend origin, but CORS is not an authorization mechanism. Do not expose this service to an untrusted network. The worker is an educational FIFO processor, not a CPU scheduler.
