USE food_delivery;

INSERT INTO food_items (name, category, price, rating, availability)
SELECT 'Margherita Pizza', 'Pizza', 249.00, 4.5, 1
WHERE NOT EXISTS (
    SELECT 1 FROM food_items WHERE name = 'Margherita Pizza'
);

INSERT INTO food_items (name, category, price, rating, availability)
SELECT 'Cheese Burger', 'Burger', 149.00, 4.3, 1
WHERE NOT EXISTS (
    SELECT 1 FROM food_items WHERE name = 'Cheese Burger'
);

INSERT INTO food_items (name, category, price, rating, availability)
SELECT 'Chicken Biryani', 'Biryani', 299.00, 4.7, 1
WHERE NOT EXISTS (
    SELECT 1 FROM food_items WHERE name = 'Chicken Biryani'
);

INSERT INTO food_items (name, category, price, rating, availability)
SELECT 'Veg Hakka Noodles', 'Chinese', 179.00, 4.2, 1
WHERE NOT EXISTS (
    SELECT 1 FROM food_items WHERE name = 'Veg Hakka Noodles'
);

INSERT INTO food_items (name, category, price, rating, availability)
SELECT 'Chocolate Cake', 'Dessert', 129.00, 4.6, 1
WHERE NOT EXISTS (
    SELECT 1 FROM food_items WHERE name = 'Chocolate Cake'
);

INSERT INTO food_items (name, category, price, rating, availability)
SELECT 'Farmhouse Pizza', 'Pizza', 329.00, 4.4, 1
WHERE NOT EXISTS (
    SELECT 1 FROM food_items WHERE name = 'Farmhouse Pizza'
);
