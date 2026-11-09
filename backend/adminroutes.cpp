#include "adminroutes.h"
#include <drogon/drogon.h>
#include <algorithm>
#include <cmath>
#include <cctype>
#include <functional>
#include <limits>
#include <string>

namespace {
using Callback = std::function<void(const drogon::HttpResponsePtr &)>;

drogon::HttpResponsePtr errorResponse(const std::string &message,
                                      drogon::HttpStatusCode status) {
    Json::Value body;
    body["error"] = message;
    auto response = drogon::HttpResponse::newHttpJsonResponse(body);
    response->setStatusCode(status);
    return response;
}

bool getText(const Json::Value &body, const char *key, std::string &out,
             std::size_t maxLength) {
    if (!body.isMember(key) || !body[key].isString()) return false;
    out = body[key].asString();
    return !out.empty() && out.size() <= maxLength &&
           std::any_of(out.begin(), out.end(), [](unsigned char character) {
               return !std::isspace(character);
           });
}

bool getNumber(const Json::Value &body, const char *key, double &out) {
    if (!body.isMember(key) || !body[key].isNumeric()) return false;
    out = body[key].asDouble();
    return std::isfinite(out);
}

bool getPositiveId(const Json::Value &body, int &id) {
    double idValue;
    if (!getNumber(body, "id", idValue) || idValue < 1 ||
        idValue > std::numeric_limits<int>::max() ||
        std::floor(idValue) != idValue) {
        return false;
    }

    id = static_cast<int>(idValue);
    return true;
}

Json::Value toJson(const drogon::orm::Result &rows) {
    Json::Value foods(Json::arrayValue);
    for (const auto &row : rows) {
        Json::Value food;
        food["id"] = row["id"].as<int>();
        food["name"] = row["name"].as<std::string>();
        food["category"] = row["category"].as<std::string>();
        food["price"] = row["price"].as<double>();
        food["rating"] = row["rating"].as<double>();
        food["availability"] = row["availability"].as<int>() != 0;
        foods.append(food);
    }
    return foods;
}

Json::Value foodUpdatedResponse(int id) {
    Json::Value response;
    response["message"] = "Food item updated";
    response["id"] = id;
    return response;
}

Json::Value availabilityResponse(int id, int availability) {
    Json::Value response;
    response["message"] = availability
        ? "Food item is now available"
        : "Food item hidden from customers";
    response["id"] = id;
    response["availability"] = availability != 0;
    return response;
}
}

void registerAdminRoutes() {
    auto &app = drogon::app();
    app.registerHandler(
        "/api/admin/foods",
        [](const drogon::HttpRequestPtr &, Callback &&callback) {
            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                callback(errorResponse("Database client unavailable",
                                       drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync(
                "SELECT id,name,category,price,rating,availability FROM food_items ORDER BY id",
                [callback](const drogon::orm::Result &rows) mutable {
                    callback(drogon::HttpResponse::newHttpJsonResponse(
                        toJson(rows)));
                },
                [callback](const drogon::orm::DrogonDbException &e) mutable {
                    LOG_ERROR << "Admin menu read failed: "
                              << e.base().what();
                    callback(errorResponse(
                        "Unable to load admin menu",
                        drogon::k500InternalServerError));
                });
        },
        {drogon::Get});

    app.registerHandler(
        "/api/admin/foods",
        [](const drogon::HttpRequestPtr &request, Callback &&callback) {
            auto body = request->getJsonObject();
            std::string name;
            std::string category;
            double price;
            double rating;
            if (!body ||
                !getText(*body, "name", name, 100) ||
                !getText(*body, "category", category, 50) ||
                !getNumber(*body, "price", price) ||
                price <= 0 || price > 1000000 ||
                !getNumber(*body, "rating", rating) ||
                rating < 0 || rating > 5) {
                callback(errorResponse(
                    "Provide name (1-100 chars), category (1-50 chars), price > 0 and <= 1000000, and rating from 0 to 5",
                    drogon::k400BadRequest));
                return;
            }
            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                callback(errorResponse("Database client unavailable",
                                       drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync(
                "INSERT INTO food_items(name,category,price,rating,availability) VALUES(?,?,?,?,1)",
                [callback](const drogon::orm::Result &result) mutable {
                    Json::Value body;
                    body["message"] = "Food item added";
                    body["id"] = static_cast<Json::Int64>(result.insertId());
                    auto response =
                        drogon::HttpResponse::newHttpJsonResponse(body);
                    response->setStatusCode(drogon::k201Created);
                    callback(response);
                },
                [callback](const drogon::orm::DrogonDbException &e) mutable {
                    LOG_ERROR << "Admin menu insert failed: "
                              << e.base().what();
                    callback(errorResponse(
                        "Unable to add food item",
                        drogon::k500InternalServerError));
                },
                name, category, price, rating);
        },
        {drogon::Post});

    app.registerHandler(
        "/api/admin/foods",
        [](const drogon::HttpRequestPtr &request, Callback &&callback) {
            auto body = request->getJsonObject();
            int id;
            std::string name;
            std::string category;
            double price;
            double rating;
            if (!body ||
                !getPositiveId(*body, id) ||
                !getText(*body, "name", name, 100) ||
                !getText(*body, "category", category, 50) ||
                !getNumber(*body, "price", price) ||
                price <= 0 || price > 1000000 ||
                !getNumber(*body, "rating", rating) ||
                rating < 0 || rating > 5) {
                callback(errorResponse(
                    "Invalid food item fields", drogon::k400BadRequest));
                return;
            }
            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                callback(errorResponse("Database client unavailable",
                                       drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync(
                "UPDATE food_items SET name=?,category=?,price=?,rating=? WHERE id=?",
                [db, callback, id](const drogon::orm::Result &result) mutable {
                    if (result.affectedRows() > 0) {
                        callback(drogon::HttpResponse::newHttpJsonResponse(
                            foodUpdatedResponse(id)));
                        return;
                    }

                    db->execSqlAsync(
                        "SELECT id FROM food_items WHERE id=?",
                        [callback, id](const drogon::orm::Result &rows) mutable {
                            if (rows.empty()) {
                                callback(errorResponse(
                                    "Food item not found",
                                    drogon::k404NotFound));
                                return;
                            }

                            callback(drogon::HttpResponse::newHttpJsonResponse(
                                foodUpdatedResponse(id)));
                        },
                        [callback](
                            const drogon::orm::DrogonDbException &e) mutable {
                            LOG_ERROR << "Food item lookup failed: "
                                      << e.base().what();
                            callback(errorResponse(
                                "Unable to verify food item",
                                drogon::k500InternalServerError));
                        },
                        id);
                },
                [callback](
                    const drogon::orm::DrogonDbException &e) mutable {
                    LOG_ERROR << "Admin menu update failed: "
                              << e.base().what();
                    callback(errorResponse(
                        "Unable to update food item",
                        drogon::k500InternalServerError));
                },
                name, category, price, rating, id);
        },
        {drogon::Put});

    app.registerHandler(
        "/api/admin/foods/availability",
        [](const drogon::HttpRequestPtr &request, Callback &&callback) {
            auto body = request->getJsonObject();
            int id;
            if (!body ||
                !getPositiveId(*body, id) ||
                !body->isMember("availability") ||
                !(*body)["availability"].isBool()) {
                callback(errorResponse(
                    "Provide a valid id and boolean availability",
                    drogon::k400BadRequest));
                return;
            }
            const int availability =
                (*body)["availability"].asBool() ? 1 : 0;
            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                callback(errorResponse("Database client unavailable",
                                       drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync(
                "UPDATE food_items SET availability=? WHERE id=?",
                [db, callback, id, availability](
                    const drogon::orm::Result &result) mutable {
                    if (result.affectedRows() > 0) {
                        callback(drogon::HttpResponse::newHttpJsonResponse(
                            availabilityResponse(id, availability)));
                        return;
                    }

                    db->execSqlAsync(
                        "SELECT id FROM food_items WHERE id=?",
                        [callback, id, availability](
                            const drogon::orm::Result &rows) mutable {
                            if (rows.empty()) {
                                callback(errorResponse(
                                    "Food item not found",
                                    drogon::k404NotFound));
                                return;
                            }

                            callback(drogon::HttpResponse::newHttpJsonResponse(
                                availabilityResponse(id, availability)));
                        },
                        [callback](const drogon::orm::DrogonDbException &e) mutable {
                            LOG_ERROR << "Food item lookup failed: "
                                      << e.base().what();
                            callback(errorResponse(
                                "Unable to verify food item",
                                drogon::k500InternalServerError));
                        },
                        id);
                },
                [callback](const drogon::orm::DrogonDbException &e) mutable {
                    LOG_ERROR << "Availability update failed: "
                              << e.base().what();
                    callback(errorResponse(
                        "Unable to update availability",
                        drogon::k500InternalServerError));
                },
                availability, id);
        },
        {drogon::Put});
}
