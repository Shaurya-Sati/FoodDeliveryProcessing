#include "adminroutes.h"
#include <drogon/drogon.h>
#include <algorithm>
#include <cmath>
#include <cctype>
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
}

void registerAdminRoutes() {
    auto &app = drogon::app();
    app.registerHandler("/api/admin/foods",
        [](const drogon::HttpRequestPtr &, Callback &&cb) {
            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                cb(errorResponse("Database client unavailable",
                                 drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync("SELECT id,name,category,price,rating,availability FROM food_items ORDER BY id",
                [cb](const drogon::orm::Result &rows) mutable {
                    cb(drogon::HttpResponse::newHttpJsonResponse(toJson(rows)));
                },
                [cb](const drogon::orm::DrogonDbException &e) mutable {
                    LOG_ERROR << "Admin menu read failed: " << e.base().what();
                    cb(errorResponse("Unable to load admin menu", drogon::k500InternalServerError));
                });
        }, {drogon::Get});

    app.registerHandler("/api/admin/foods",
        [](const drogon::HttpRequestPtr &req, Callback &&cb) {
            auto body = req->getJsonObject();
            std::string name, category; double price, rating;
            if (!body || !getText(*body,"name",name,100) || !getText(*body,"category",category,50) ||
                !getNumber(*body,"price",price) || price <= 0 || price > 1000000 ||
                !getNumber(*body,"rating",rating) || rating < 0 || rating > 5) {
                cb(errorResponse("Provide name (1-100 chars), category (1-50 chars), price > 0 and <= 1000000, and rating from 0 to 5", drogon::k400BadRequest)); return;
            }
            auto db = drogon::app().getDbClient("food_db");
            if (!db) {
                cb(errorResponse("Database client unavailable",
                                 drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync("INSERT INTO food_items(name,category,price,rating,availability) VALUES(?,?,?,?,1)",
                [cb](const drogon::orm::Result &result) mutable {
                    Json::Value out; out["message"]="Food item added"; out["id"]=static_cast<Json::Int64>(result.insertId());
                    auto response=drogon::HttpResponse::newHttpJsonResponse(out); response->setStatusCode(drogon::k201Created); cb(response);
                },
                [cb](const drogon::orm::DrogonDbException &e) mutable {
                    LOG_ERROR << "Admin menu insert failed: " << e.base().what(); cb(errorResponse("Unable to add food item",drogon::k500InternalServerError));
                }, name,category,price,rating);
        }, {drogon::Post});

    app.registerHandler("/api/admin/foods",
        [](const drogon::HttpRequestPtr &req, Callback &&cb) {
            auto body=req->getJsonObject(); std::string name,category; double idValue,price,rating;
            if (!body || !getNumber(*body,"id",idValue) || idValue < 1 ||
                idValue > std::numeric_limits<int>::max() ||
                std::floor(idValue)!=idValue ||
                !getText(*body,"name",name,100) || !getText(*body,"category",category,50) ||
                !getNumber(*body,"price",price) || price<=0 || price>1000000 ||
                !getNumber(*body,"rating",rating) || rating<0 || rating>5) {
                cb(errorResponse("Invalid food item fields",drogon::k400BadRequest)); return;
            }
            int id=static_cast<int>(idValue); auto db=drogon::app().getDbClient("food_db");
            if (!db) {
                cb(errorResponse("Database client unavailable",
                                 drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync("UPDATE food_items SET name=?,category=?,price=?,rating=? WHERE id=?",
                [db,cb,id](const drogon::orm::Result &r) mutable {
                    auto sendUpdated = [cb,id]() mutable {
                        Json::Value out;
                        out["message"] = "Food item updated";
                        out["id"] = id;
                        cb(drogon::HttpResponse::newHttpJsonResponse(out));
                    };
                    if (r.affectedRows() > 0) {
                        sendUpdated();
                        return;
                    }
                    db->execSqlAsync("SELECT id FROM food_items WHERE id=?",
                        [cb,id](const drogon::orm::Result &rows) mutable {
                            if (rows.empty()) {
                                cb(errorResponse("Food item not found",drogon::k404NotFound));
                                return;
                            }
                            Json::Value out;
                            out["message"] = "Food item updated";
                            out["id"] = id;
                            cb(drogon::HttpResponse::newHttpJsonResponse(out));
                        },
                        [cb](const drogon::orm::DrogonDbException &e) mutable {
                            LOG_ERROR << "Food item lookup failed: " << e.base().what();
                            cb(errorResponse("Unable to verify food item",drogon::k500InternalServerError));
                        }, id);
                },
                [cb](const drogon::orm::DrogonDbException &e) mutable { LOG_ERROR << "Admin menu update failed: " << e.base().what(); cb(errorResponse("Unable to update food item",drogon::k500InternalServerError)); },
                name,category,price,rating,id);
        }, {drogon::Put});

    app.registerHandler("/api/admin/foods/availability",
        [](const drogon::HttpRequestPtr &req, Callback &&cb) {
            auto body=req->getJsonObject(); double idValue;
            if(!body || !getNumber(*body,"id",idValue) || idValue<1 ||
               idValue > std::numeric_limits<int>::max() ||
               std::floor(idValue)!=idValue ||
               !body->isMember("availability") || !(*body)["availability"].isBool()) {
                cb(errorResponse("Provide a valid id and boolean availability",drogon::k400BadRequest)); return;
            }
            int id=static_cast<int>(idValue); int availability=(*body)["availability"].asBool()?1:0;
            auto db=drogon::app().getDbClient("food_db");
            if (!db) {
                cb(errorResponse("Database client unavailable",
                                 drogon::k500InternalServerError));
                return;
            }
            db->execSqlAsync("UPDATE food_items SET availability=? WHERE id=?",
                [db,cb,id,availability](const drogon::orm::Result &r) mutable {
                    auto sendUpdated = [cb,id,availability]() mutable {
                        Json::Value out;
                        out["message"] = availability
                            ? "Food item is now available"
                            : "Food item hidden from customers";
                        out["id"] = id;
                        out["availability"] = availability != 0;
                        cb(drogon::HttpResponse::newHttpJsonResponse(out));
                    };
                    if (r.affectedRows() > 0) {
                        sendUpdated();
                        return;
                    }
                    db->execSqlAsync("SELECT id FROM food_items WHERE id=?",
                        [cb,id,availability](const drogon::orm::Result &rows) mutable {
                            if (rows.empty()) {
                                cb(errorResponse("Food item not found",drogon::k404NotFound));
                                return;
                            }
                            Json::Value out;
                            out["message"] = availability
                                ? "Food item is now available"
                                : "Food item hidden from customers";
                            out["id"] = id;
                            out["availability"] = availability != 0;
                            cb(drogon::HttpResponse::newHttpJsonResponse(out));
                        },
                        [cb](const drogon::orm::DrogonDbException &e) mutable {
                            LOG_ERROR << "Food item lookup failed: " << e.base().what();
                            cb(errorResponse("Unable to verify food item",drogon::k500InternalServerError));
                        }, id);
                },
                [cb](const drogon::orm::DrogonDbException &e) mutable { LOG_ERROR << "Availability update failed: " << e.base().what(); cb(errorResponse("Unable to update availability",drogon::k500InternalServerError)); },
                availability,id);
        }, {drogon::Put});
}
