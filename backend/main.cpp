#include "orderprocessor.h"
#include "reportroutes.h"
#include "adminroutes.h"
#include <drogon/drogon.h>

#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace {
std::shared_ptr<OrderProcessor> orderProcessor;
std::mutex processorMutex;

std::shared_ptr<OrderProcessor> getOrderProcessor() {
    std::lock_guard<std::mutex> lock(processorMutex);

    if (!orderProcessor) {
        auto db = drogon::app().getDbClient("food_db");
        if (!db) {
            throw std::runtime_error(
                "Drogon database client 'food_db' is not available");
        }
        orderProcessor = std::make_shared<OrderProcessor>(db);
    }

    return orderProcessor;
}

drogon::HttpResponsePtr jsonError(
    const std::string& message,
    drogon::HttpStatusCode code) {
    Json::Value body;
    body["error"] = message;
    auto response = drogon::HttpResponse::newHttpJsonResponse(body);
    response->setStatusCode(code);
    return response;
}

struct OrderItemInput {
    int foodId;
    int quantity;
};

struct OrderCreation {
    std::shared_ptr<drogon::orm::Transaction> transaction;
    std::shared_ptr<std::function<void(const drogon::HttpResponsePtr&)>>
        callback;
    std::vector<OrderItemInput> items;
    std::size_t nextItem = 0;
    int orderId = 0;
    std::int64_t totalCents = 0;
    Json::Value savedItems{Json::arrayValue};
};

void failOrder(const std::shared_ptr<OrderCreation>& order,
               const std::string& message,
               drogon::HttpStatusCode status) {
    if (order->transaction) {
        order->transaction->rollback();
        order->transaction.reset();
    }
    (*order->callback)(jsonError(message, status));
}

void insertNextOrderItem(const std::shared_ptr<OrderCreation>& order);

void saveOrderTotal(const std::shared_ptr<OrderCreation>& order) {
    const double total = static_cast<double>(order->totalCents) / 100.0;
    order->transaction->execSqlAsync(
        "UPDATE orders SET total_amount = ? WHERE id = ?",
        [order, total](const drogon::orm::Result&) {
            order->transaction->setCommitCallback(
                [order, total](bool success) {
                    if (!success) {
                        (*order->callback)(jsonError(
                            "Unable to commit order",
                            drogon::k500InternalServerError));
                        return;
                    }

                    try {
                        getOrderProcessor()->submitOrder(order->orderId);
                    } catch (const std::exception& e) {
                        LOG_ERROR << "Could not queue order "
                                  << order->orderId << ": " << e.what();
                    }

                    Json::Value body;
                    body["message"] = "Order placed successfully";
                    body["order_id"] = order->orderId;
                    body["total_amount"] = total;
                    body["items"] = order->savedItems;
                    (*order->callback)(
                        drogon::HttpResponse::newHttpJsonResponse(body));
                });

            auto transaction = std::move(order->transaction);
            transaction.reset();
        },
        [order](const drogon::orm::DrogonDbException& e) {
            LOG_ERROR << "Order total update failed: " << e.base().what();
            failOrder(order, "Unable to save order",
                      drogon::k500InternalServerError);
        },
        total, order->orderId);
}

void saveOrderItem(const std::shared_ptr<OrderCreation>& order,
                   const OrderItemInput& item,
                   const drogon::orm::Result& rows) {
    if (rows.empty()) {
        failOrder(order, "Food item not found", drogon::k400BadRequest);
        return;
    }

    const auto& row = rows[0];
    if (row["availability"].as<int>() == 0) {
        failOrder(order, "Food item is unavailable", drogon::k400BadRequest);
        return;
    }

    const double price = row["price"].as<double>();
    if (!std::isfinite(price) || price <= 0 || price > 1000000.0) {
        failOrder(order, "Food item has an invalid price",
                  drogon::k400BadRequest);
        return;
    }
    const std::int64_t priceCents =
        static_cast<std::int64_t>(std::llround(price * 100.0));
    constexpr std::int64_t maxOrderCents = 9999999999LL;
    if (priceCents <= 0 || priceCents > 100000000LL) {
        failOrder(order, "Food item has an invalid price",
                  drogon::k400BadRequest);
        return;
    }

    const std::int64_t lineTotalCents =
        priceCents * static_cast<std::int64_t>(item.quantity);
    if (lineTotalCents > maxOrderCents - order->totalCents) {
        failOrder(order, "Order total exceeds the supported limit",
                  drogon::k400BadRequest);
        return;
    }

    const std::string name = row["name"].as<std::string>();
    const double trustedPrice = static_cast<double>(priceCents) / 100.0;
    order->transaction->execSqlAsync(
        "INSERT INTO order_items "
        "(order_id, food_id, quantity, price) VALUES (?, ?, ?, ?)",
        [order, item, name, priceCents, lineTotalCents](
            const drogon::orm::Result&) {
            order->totalCents += lineTotalCents;
            Json::Value saved;
            saved["food_id"] = item.foodId;
            saved["name"] = name;
            saved["quantity"] = item.quantity;
            saved["price"] = static_cast<double>(priceCents) / 100.0;
            order->savedItems.append(saved);
            ++order->nextItem;
            insertNextOrderItem(order);
        },
        [order](const drogon::orm::DrogonDbException& e) {
            LOG_ERROR << "Order item insert failed: " << e.base().what();
            failOrder(order, "Unable to save order",
                      drogon::k500InternalServerError);
        },
        order->orderId, item.foodId, item.quantity, trustedPrice);
}

void insertNextOrderItem(const std::shared_ptr<OrderCreation>& order) {
    if (order->nextItem == order->items.size()) {
        saveOrderTotal(order);
        return;
    }

    const auto item = order->items[order->nextItem];
    order->transaction->execSqlAsync(
        "SELECT id, name, price, availability "
        "FROM food_items WHERE id = ?",
        [order, item](const drogon::orm::Result& rows) {
            saveOrderItem(order, item, rows);
        },
        [order](const drogon::orm::DrogonDbException& e) {
            LOG_ERROR << "Food lookup for order failed: " << e.base().what();
            failOrder(order, "Unable to validate order items",
                      drogon::k500InternalServerError);
        },
        item.foodId);
}

bool parseOrderItems(const Json::Value& requestBody,
                     std::vector<OrderItemInput>& orderItems,
                     std::string& errorMessage) {
    if (!requestBody.isMember("items") ||
        !requestBody["items"].isArray() ||
        requestBody["items"].empty()) {
        errorMessage = "Please provide a non-empty items array";
        return false;
    }

    const Json::Value& items = requestBody["items"];
    orderItems.reserve(items.size());
    for (const auto& item : items) {
        if (!item.isMember("food_id") ||
            !item.isMember("quantity") ||
            !item["food_id"].isInt() ||
            !item["quantity"].isInt() ||
            item["food_id"].asInt() <= 0 ||
            item["quantity"].asInt() <= 0) {
            errorMessage = "Each item needs a positive food_id and quantity";
            return false;
        }

        orderItems.push_back(
            {item["food_id"].asInt(), item["quantity"].asInt()});
    }
    return true;
}

void startOrderTransaction(
    const drogon::orm::DbClientPtr& db,
    const std::shared_ptr<OrderCreation>& order) {
    db->newTransactionAsync(
        [order](const std::shared_ptr<drogon::orm::Transaction>& transaction) {
            if (!transaction) {
                failOrder(order, "Unable to start order transaction",
                          drogon::k500InternalServerError);
                return;
            }

            order->transaction = transaction;
            transaction->execSqlAsync(
                "INSERT INTO orders (total_amount, status) "
                "VALUES (0, 'PLACED')",
                [order](const drogon::orm::Result& result) {
                    const auto id = result.insertId();
                    if (id <= 0 || id > std::numeric_limits<int>::max()) {
                        failOrder(order, "Unable to create order",
                                  drogon::k500InternalServerError);
                        return;
                    }

                    order->orderId = static_cast<int>(id);
                    insertNextOrderItem(order);
                },
                [order](const drogon::orm::DrogonDbException& e) {
                    LOG_ERROR << "Order insert failed: " << e.base().what();
                    failOrder(order, "Unable to save order",
                              drogon::k500InternalServerError);
                });
        });
}
}  // namespace

int main() {
    // Load configuration before starting the application. Create the worker
    // lazily from a request handler, after Drogon has initialized its clients.
    drogon::app().loadConfigFile("config.json");

    // CORS headers for the local frontend.
    drogon::app().registerPostHandlingAdvice(
        [](const drogon::HttpRequestPtr&,
           const drogon::HttpResponsePtr& response) {
            response->addHeader("Access-Control-Allow-Origin",
                                "http://127.0.0.1:5500");
         response->removeHeader("Access-Control-Allow-Methods");
         response->addHeader("Access-Control-Allow-Methods",
                             "GET, POST, PUT, OPTIONS");
         response->removeHeader("Access-Control-Allow-Headers");
         response->addHeader("Access-Control-Allow-Headers",
                             "Content-Type");
        });

    drogon::app().registerPreRoutingAdvice(
        [](const drogon::HttpRequestPtr& request,
           drogon::AdviceCallback&& callback,
           drogon::AdviceChainCallback&& chainCallback) {
         if (request->method() != drogon::Options) {
             chainCallback();
             return;
         }

         auto response = drogon::HttpResponse::newHttpResponse();
         response->addHeader("Access-Control-Allow-Origin",
                             "http://127.0.0.1:5500");
         response->addHeader("Access-Control-Allow-Methods",
                             "GET, POST, PUT, OPTIONS");
         response->addHeader("Access-Control-Allow-Headers",
                             "Content-Type");
         response->addHeader("Access-Control-Max-Age", "600");
         callback(response);
        });

    // GET /api/foods
    drogon::app().registerHandler(
        "/api/foods",
        [](const drogon::HttpRequestPtr&,
           std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                callback(jsonError("Database client unavailable",
                                    drogon::k500InternalServerError));
                return;
            }

            db->execSqlAsync(
                "SELECT id, name, category, price, rating "
                "FROM food_items "
                "WHERE availability = 1 "
                "ORDER BY id",
                [callback](const drogon::orm::Result& rows) mutable {
                    Json::Value foods(Json::arrayValue);
                    for (const auto& row : rows) {
                        Json::Value food;
                        food["id"] = row["id"].as<int>();
                        food["name"] = row["name"].as<std::string>();
                        food["category"] = row["category"].as<std::string>();
                        food["price"] = row["price"].as<double>();
                        food["rating"] = row["rating"].as<double>();
                        foods.append(food);
                    }
                    callback(drogon::HttpResponse::newHttpJsonResponse(foods));
                },
                [callback](const drogon::orm::DrogonDbException& e) mutable {
                    LOG_ERROR << "Fetching foods failed: " << e.base().what();
                    callback(jsonError("Unable to retrieve food items",
                                        drogon::k500InternalServerError));
                });
        },
        {drogon::Get});

    // POST /api/orders
    // Expected JSON: {"items":[{"food_id":1,"quantity":2}]}
    drogon::app().registerHandler(
        "/api/orders",
        [](const drogon::HttpRequestPtr& request,
           std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
            auto json = request->getJsonObject();
            if (!json) {
                callback(jsonError("Please provide a non-empty items array",
                                   drogon::k400BadRequest));
                return;
            }

            std::vector<OrderItemInput> orderItems;
            std::string validationError;
            if (!parseOrderItems(*json, orderItems, validationError)) {
                callback(jsonError(validationError, drogon::k400BadRequest));
                return;
            }

            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                callback(jsonError("Database client unavailable",
                                   drogon::k500InternalServerError));
                return;
            }

            auto order = std::make_shared<OrderCreation>();
            order->callback =
                std::make_shared<std::function<void(
                    const drogon::HttpResponsePtr&)>>(std::move(callback));
            order->items = std::move(orderItems);

            startOrderTransaction(db, order);
        },
        {drogon::Post});

    // GET /api/orders
    // Returns one row per order item, preserving the existing frontend/API shape.
    drogon::app().registerHandler(
        "/api/orders",
        [](const drogon::HttpRequestPtr&,
           std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                callback(jsonError("Database client unavailable",
                                    drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync(
                "SELECT o.id AS order_id, o.total_amount, o.status, "
                "o.created_at, oi.food_id, f.name AS food_name, "
                "oi.quantity, oi.price "
                "FROM orders o "
                "LEFT JOIN order_items oi ON o.id = oi.order_id "
                "LEFT JOIN food_items f ON oi.food_id = f.id "
                "ORDER BY o.id DESC",
                [callback](const drogon::orm::Result& rows) mutable {
                    Json::Value result(Json::arrayValue);
                    for (const auto& row : rows) {
                        Json::Value order;
                        order["order_id"] = row["order_id"].as<int>();
                        order["total_amount"] =
                            row["total_amount"].as<double>();
                        order["status"] = row["status"].as<std::string>();
                        order["created_at"] =
                            row["created_at"].as<std::string>();

                        if (!row["food_id"].isNull()) {
                            order["food_id"] = row["food_id"].as<int>();
                            order["food_name"] =
                                row["food_name"].as<std::string>();
                            order["quantity"] = row["quantity"].as<int>();
                            order["price"] = row["price"].as<double>();
                        }
                        result.append(order);
                    }
                    callback(drogon::HttpResponse::newHttpJsonResponse(result));
                },
                [callback](const drogon::orm::DrogonDbException& e) mutable {
                    LOG_ERROR << "Fetching orders failed: " << e.base().what();
                    callback(jsonError("Unable to fetch orders",
                                       drogon::k500InternalServerError));
                });
        },
        {drogon::Get});

    // PUT /api/orders/status
    // Expected JSON: {"order_id":1,"status":"PREPARING"}
    drogon::app().registerHandler(
        "/api/orders/status",
        [](const drogon::HttpRequestPtr& request,
           std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
            auto json = request->getJsonObject();
            if (!json || !json->isMember("order_id") ||
                !(*json)["order_id"].isInt() ||
                !json->isMember("status") ||
                !(*json)["status"].isString()) {
                callback(jsonError("Provide order_id and status",
                                   drogon::k400BadRequest));
                return;
            }

            const int orderId = (*json)["order_id"].asInt();
            const std::string status = (*json)["status"].asString();
            if (orderId <= 0 ||
                (status != "PLACED" && status != "PREPARING" &&
                 status != "READY")) {
                callback(jsonError("Invalid order ID or status",
                                   drogon::k400BadRequest));
                return;
            }

            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                callback(jsonError("Database client unavailable",
                                    drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync(
                "UPDATE orders SET status = ? WHERE id = ?",
                [db, callback, orderId, status](
                    const drogon::orm::Result& result) mutable {
                    if (result.affectedRows() > 0) {
                        Json::Value body;
                        body["message"] = "Order status updated";
                        body["order_id"] = orderId;
                        body["status"] = status;
                        callback(drogon::HttpResponse::newHttpJsonResponse(body));
                        return;
                    }

                    db->execSqlAsync(
                        "SELECT status FROM orders WHERE id = ?",
                        [callback, orderId](
                            const drogon::orm::Result& rows) mutable {
                            if (rows.empty()) {
                                callback(jsonError("Order not found",
                                                   drogon::k404NotFound));
                                return;
                            }
                            Json::Value body;
                            body["message"] = "Order status unchanged";
                            body["order_id"] = orderId;
                            body["status"] =
                                rows[0]["status"].as<std::string>();
                            callback(
                                drogon::HttpResponse::newHttpJsonResponse(body));
                        },
                        [callback](const drogon::orm::DrogonDbException& e) mutable {
                            LOG_ERROR << "Order lookup failed: " << e.base().what();
                            callback(jsonError("Unable to verify order",
                                               drogon::k500InternalServerError));
                        },
                        orderId);
                },
                [callback](const drogon::orm::DrogonDbException& e) mutable {
                    LOG_ERROR << "Status update failed: " << e.base().what();
                    callback(jsonError("Unable to update order status",
                                       drogon::k500InternalServerError));
                },
                status, orderId);
        },
        {drogon::Put});

    // GET /
    drogon::app().registerHandler(
        "/",
        [](const drogon::HttpRequestPtr&,
           std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
            auto response = drogon::HttpResponse::newHttpResponse();
            response->setBody("Food Delivery System Backend is running!");
            callback(response);
        },
        {drogon::Get});
    registerAdminRoutes();  
    registerReportRoutes();  
    drogon::app().run();

    // Stop the worker only after Drogon's event loop exits.
    {
        std::lock_guard<std::mutex> lock(processorMutex);
        if (orderProcessor) {
            orderProcessor->shutdown();
            orderProcessor.reset();
        }
    }

    return 0;
}
