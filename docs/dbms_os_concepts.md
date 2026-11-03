# DBMS and OS concepts: implementation and test checklist

## Academic concept mapping

| Concept | Implementation | Demonstration |
|---|---|---|
| Relational schema | `database/schema.sql`: `food_items`, `orders`, `order_items` | Explain the parent/child relationships |
| Primary keys / auto-increment | `id` primary keys in all three tables | Insert records without choosing IDs |
| Foreign keys | `order_items.order_id` and `food_id` | Try inserting a line for a nonexistent parent in a disposable database |
| Data integrity | `NOT NULL`, `CHECK`, decimal and boolean-like columns | Submit invalid menu fields / quantity |
| Indexes | Availability/category, status/time, order-item join keys | Inspect indexes with `SHOW INDEX` |
| Parameterized SQL | Drogon `?` bindings in backend route SQL | Explain that request values are never concatenated into SQL |
| CRUD | Admin GET/POST/PUT and availability PUT routes | Add, edit, hide, and restore an item |
| JOIN | `GET /api/orders` joins orders, order items, and foods | Compare a multi-item order with its joined rows |
| Aggregates | `GET /api/reports/summary` uses `COUNT`, `SUM`, `AVG` | Compare counts and totals to SQL queries |
| Transaction | Async transaction in `backend/main.cpp` wraps order and all items | Send a multi-item request with a valid ID followed by an invalid ID; verify no order persists |
| Commit / rollback | Commit callback queues work only after success; invalid item/errors call rollback | Verify no partial order/line items after rejection |
| Persistence | MySQL stores all committed records | Restart the backend and reload orders |
| Producer-consumer | `OrderProcessor` uses `std::queue`, mutex, condition variable, and worker thread | Submit several orders and observe FIFO processing logs |
| Predicate wait / notification | `queueCondition.wait(lock, predicate)` and `notify_one()` | Leave queue empty, then place an order |
| Safe shutdown | stop flag, `notify_all()`, and `join()` | Stop the server while idle and while work is queued |

## API examples

Create an order (the supplied price is deliberately ignored):

```json
{
  "items": [
    { "food_id": 1, "quantity": 2, "price": 0.01 }
  ]
}
```

Menu creation:

```json
{
  "name": "Paneer Tikka",
  "category": "Starter",
  "price": 199.00,
  "rating": 4.5
}
```

Hide/restore:

```json
{
  "id": 1,
  "availability": false
}
```

## Verification checklist

Run non-destructive checks first:

- `GET /` returns HTTP 200.
- `GET /api/foods` returns only available items; `GET /api/admin/foods` includes availability for every item.
- `GET /api/reports/summary` returns numeric totals and status counts, including zeros for an empty orders table.
- Submit an invalid food ID, zero quantity, or negative quantity and confirm HTTP 400 with no persisted order.
- Submit a valid order and confirm its total equals database menu price × quantity, regardless of any client `price`.
- Submit a request containing a valid first item and an invalid later item; compare order counts before/after and confirm the transaction left no partial order.
- Confirm order statuses progress from `PLACED` to `PREPARING` to `READY`, and that several requests do not block the frontend.
- Restart the backend and confirm committed orders remain available.
- Stop the backend while idle and while processing queued orders; confirm it exits without a detached worker.

Admin create/edit/hide/restore tests change persistent menu data. Run them only in a local test database or restore the original values manually. Do not drop or reset a shared database. Database-dependent behaviors are not verified merely by a successful C++ build.

## Limitations

The admin routes and order-status update route have no authentication. They are demonstration-only. The sample seed avoids duplicate named entries but does not update or overwrite existing menu records. MySQL check-constraint enforcement depends on MySQL 8.0.16 or later.
