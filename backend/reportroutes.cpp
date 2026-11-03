
#include "reportroutes.h"

#include <drogon/drogon.h>
#include <json/json.h>
#include <functional>
#include <memory>

using namespace drogon;

void registerReportRoutes()
{
    app().registerHandler(
        "/api/reports/summary",
        [](const HttpRequestPtr&,
           std::function<void(const HttpResponsePtr&)>&& callback)
        {
            auto db = app().getDbClient("food_db");
            if (!db)
            {
                Json::Value json;
                json["error"] = "Database client unavailable";
                auto response = HttpResponse::newHttpJsonResponse(json);
                response->setStatusCode(k500InternalServerError);
                callback(response);
                return;
            }

            auto responseCallback =
                std::make_shared<
                    std::function<void(const HttpResponsePtr&)>
                >(std::move(callback));

            db->execSqlAsync(
                "SELECT "
                "COUNT(*) AS total_orders, "
                "COALESCE(SUM(total_amount), 0) AS total_value, "
                "COALESCE(AVG(total_amount), 0) AS average_value, "
                "COALESCE(SUM(status = 'PLACED'), 0) AS placed_orders, "
                "COALESCE(SUM(status = 'PREPARING'), 0) AS preparing_orders, "
                "COALESCE(SUM(status = 'READY'), 0) AS ready_orders "
                "FROM orders",

                [responseCallback](const orm::Result& result)
                {
                    Json::Value json;

                    json["total_orders"] =
                        result[0]["total_orders"].as<int>();

                    json["total_value"] =
                        result[0]["total_value"].as<double>();

                    json["average_value"] =
                        result[0]["average_value"].as<double>();

                    json["placed_orders"] =
                        result[0]["placed_orders"].as<int>();

                    json["preparing_orders"] =
                        result[0]["preparing_orders"].as<int>();

                    json["ready_orders"] =
                        result[0]["ready_orders"].as<int>();

                    auto response =
                        HttpResponse::newHttpJsonResponse(json);

                    (*responseCallback)(response);
                },

                [responseCallback](const orm::DrogonDbException& error)
                {
                    Json::Value json;
                    json["error"] = "Failed to retrieve order reports";
                    LOG_ERROR << error.base().what();

                    auto response =
                        HttpResponse::newHttpJsonResponse(json);

                    response->setStatusCode(
                        k500InternalServerError
                    );

                    (*responseCallback)(response);
                }
            );
        },
        {Get}
    );
}
