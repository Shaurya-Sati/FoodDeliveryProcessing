CREATE DATABASE IF NOT EXISTS food_delivery
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;
USE food_delivery;

CREATE TABLE IF NOT EXISTS food_items (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    rating DECIMAL(2, 1) NOT NULL DEFAULT 0.0,
    availability TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    CONSTRAINT chk_food_price_positive CHECK (price > 0),
    CONSTRAINT chk_food_rating_range CHECK (rating >= 0 AND rating <= 5),
    CONSTRAINT chk_food_availability_boolean CHECK (availability IN (0, 1)),
    INDEX idx_food_availability_category (availability, category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
    id INT NOT NULL AUTO_INCREMENT,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'PLACED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_order_total_nonnegative CHECK (total_amount >= 0),
    CONSTRAINT chk_order_status CHECK (
        status IN ('PLACED', 'PREPARING', 'READY')
    ),
    INDEX idx_orders_status_created (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
    id INT NOT NULL AUTO_INCREMENT,
    order_id INT NOT NULL,
    food_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT fk_order_items_food
        FOREIGN KEY (food_id) REFERENCES food_items (id),
    CONSTRAINT chk_order_item_quantity_positive CHECK (quantity > 0),
    CONSTRAINT chk_order_item_price_nonnegative CHECK (price >= 0),
    INDEX idx_order_items_order (order_id),
    INDEX idx_order_items_food (food_id)
) ENGINE=InnoDB;
