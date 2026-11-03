
#ifndef ORDERPROCESSOR_H
#define ORDERPROCESSOR_H

#include <drogon/orm/DbClient.h>

#include <condition_variable>
#include <mutex>
#include <queue>
#include <thread>

class OrderProcessor {
public:
    explicit OrderProcessor(
        const drogon::orm::DbClientPtr& dbClient
    );

    ~OrderProcessor();

    OrderProcessor(const OrderProcessor&) = delete;
    OrderProcessor& operator=(const OrderProcessor&) = delete;

    void submitOrder(int orderId);
    void shutdown();

private:
    void workerLoop();
    void processOrder(int orderId);

    drogon::orm::DbClientPtr dbClient;

    std::queue<int> orderQueue;
    std::mutex queueMutex;
    std::condition_variable queueCondition;

    bool stopping = false;
    std::thread worker;
};

#endif
