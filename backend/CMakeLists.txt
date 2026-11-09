
cmake_minimum_required(VERSION 3.20)
project(FoodDeliverySystem LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(FOOD_DELIVERY_MSYS2_PREFIX "C:/msys64/ucrt64" CACHE PATH
    "MSYS2 UCRT64 installation prefix"
)

set(MARIADB_INCLUDE_DIRS "${FOOD_DELIVERY_MSYS2_PREFIX}/include/mariadb")
set(MYSQL_INCLUDE_DIRS "${FOOD_DELIVERY_MSYS2_PREFIX}/include/mysql")
set(MYSQL_LIBRARIES "${FOOD_DELIVERY_MSYS2_PREFIX}/lib/libmariadbclient.a")

find_package(Trantor CONFIG REQUIRED
    PATHS "${FOOD_DELIVERY_MSYS2_PREFIX}/lib/cmake/Trantor-shared"
)

find_package(Drogon CONFIG REQUIRED
    PATHS "${FOOD_DELIVERY_MSYS2_PREFIX}/lib/cmake/Drogon-shared"
)

add_executable(food_delivery
    main.cpp
    adminroutes.cpp
    adminroutes.h
    reportroutes.cpp
    reportroutes.h
    orderprocessor.h
    orderprocessor.cpp
)
target_link_libraries(food_delivery PRIVATE Drogon::Drogon)
