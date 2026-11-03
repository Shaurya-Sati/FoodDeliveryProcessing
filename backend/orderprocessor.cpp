
#include "orderprocessor.h"

#include <chrono>
#include <exception>
#include <iostream>
#include <stdexcept>
#include <utility>

OrderProcessor::OrderProcessor(
    const drogon::orm::DbClientPtr& db
) : dbClient(db) {
    if (!dbClient) {
        throw std::invalid_argument("Database client is null");
    }

    worker = std::thread(&OrderProcessor::workerLoop, this);
}

OrderProcessor::~OrderProcessor() {
    shutdown();
}

void OrderProcessor::submitOrder(int orderId) {
    if (orderId <= 0) {
        throw std::invalid_argument("Invalid order ID");
    }

    {
        std::lock_guard<std::mutex> lock(queueMutex);

        if (stopping) {
            throw std::runtime_error(
                "Order processor is shutting down"
            );
        }

        orderQueue.push(orderId);
        std::cout << "[Producer] Order " << orderId
                  << " added to queue\n";
    }

    queueCondition.notify_one();
}

void OrderProcessor::workerLoop() {
    while (true) {
        int orderId;

        {
            std::unique_lock<std::mutex> lock(queueMutex);

            std::cout << "[Worker] Waiting for orders\n";

            queueCondition.wait(lock, [this] {
                return stopping || !orderQueue.empty();
            });

            if (stopping && orderQueue.empty()) {
                std::cout << "[Worker] Shutting down\n";
                return;
            }

            orderId = orderQueue.front();
            orderQueue.pop();
        }

        std::cout << "[Worker] Dequeued order "
                  << orderId << '\n';

        try {
            processOrder(orderId);
        } catch (const std::exception& e) {
            std::cerr << "[Worker] Order " << orderId
                      << " failed: " << e.what() << '\n';
        } catch (...) {
            std::cerr << "[Worker] Unknown error for order "
                      << orderId << '\n';
        }
    }
}

void OrderProcessor::processOrder(int orderId) {
    // Only move an order forward if it is still PLACED.
    auto result = dbClient->execSqlSync(
        "UPDATE orders SET status = 'PREPARING' "
        "WHERE id = ? AND status = 'PLACED'",
        orderId
    );

    if (result.affectedRows() == 0) {
        std::cout << "[Worker] Order " << orderId
                  << " was not in PLACED status; skipped\n";
        return;
    }

    std::cout << "[Worker] Order " << orderId
              << " status: PREPARING\n";

    // Simulate food preparation without blocking the GUI thread.
    std::this_thread::sleep_for(std::chrono::seconds(5));

    result = dbClient->execSqlSync(
        "UPDATE orders SET status = 'READY' "
        "WHERE id = ? AND status = 'PREPARING'",
        orderId
    );

    if (result.affectedRows() > 0) {
        std::cout << "[Worker] Order " << orderId
                  << " status: READY\n";
    } else {
        std::cout << "[Worker] Order " << orderId
                  << " was not PREPARING; READY update skipped\n";
    }
}

void OrderProcessor::shutdown() {
    {
        std::lock_guard<std::mutex> lock(queueMutex);
        stopping = true;
    }

    queueCondition.notify_all();

    if (worker.joinable()) {
        worker.join();
    }
}
