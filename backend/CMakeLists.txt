
cmake_minimum_required(VERSION 3.20)
project(FoodDeliverySystem LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(MARIADB_INCLUDE_DIRS "C:/msys64/ucrt64/include/mariadb" CACHE PATH "" FORCE)
set(MYSQL_INCLUDE_DIRS "C:/msys64/ucrt64/include/mysql" CACHE PATH "" FORCE)
set(MYSQL_LIBRARIES "C:/msys64/ucrt64/lib/libmariadbclient.a" CACHE FILEPATH "" FORCE)

find_package(Trantor CONFIG REQUIRED
    PATHS "C:/msys64/ucrt64/lib/cmake/Trantor-shared"
    NO_DEFAULT_PATH
)

find_package(Drogon CONFIG REQUIRED
    PATHS "C:/msys64/ucrt64/lib/cmake/Drogon-shared"
    NO_DEFAULT_PATH
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
