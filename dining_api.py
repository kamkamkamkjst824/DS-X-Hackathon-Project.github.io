import os
import requests
from dotenv import load_dotenv


# ==========================================
# API SETUP
# ==========================================

load_dotenv()

API_KEY = os.getenv("BU_API_KEY")

BASE_URL = "https://public.api-nonprod.bu.edu/api/v1/dining"

HEADERS = {
    "accept": "application/json",
    "x-api-key": API_KEY
}


# ==========================================
# GET RAW MENU FROM BU
# ==========================================

def get_menu(location, day=None):
    """
    Gets the dining menu for a location on a specific day.

    location examples:
        "marciano"
        "warren"
        "west"

    day example:
        "2026-10-24"
    """

    url = f"{BASE_URL}/locations/{location}/menu"

    params = {}

    if day is not None:
        params["day"] = day

    response = requests.get(
        url,
        headers=HEADERS,
        params=params
    )

    response.raise_for_status()

    return response.json()


# ==========================================
# TURN API DATA INTO FOOD LIST
# ==========================================

def get_foods(location, day=None):
    """
    Gets the menu and converts every menu item
    into a simple food dictionary.
    """

    menu = get_menu(location, day)

    foods = []

    for meal in menu["meals"]:

        for station in meal["stations"]:

            for item in station["items"]:

                food = {
                    "id": item["id"],
                    "name": item["name"],

                    "location": location,
                    "date": menu["date"],
                    "meal": meal["name"],
                    "station": station["name"],

                    "calories": item["calories"],
                    "carbs": item["carbohydrates_grams"],
                    "protein": item["protein_grams"],
                    "saturated_fat": item["saturated_fat_grams"],

                    "vegetarian": item["vegetarian"],
                    "vegan": item["vegan"],
                    "gluten_free": item["gluten_free"],
                    "halal": item["halal"],
                    "cool_food": item["cool_food"]
                }

                foods.append(food)

    return foods


# ==========================================
# FILTER FOODS
# ==========================================

def filter_foods(
    foods,
    meal=None,
    vegetarian=False,
    vegan=False,
    gluten_free=False,
    halal=False
):
    """
    Removes foods that don't satisfy the
    user's dietary requirements.
    """

    filtered = []

    for food in foods:

        # Meal filter
        if meal is not None and food["meal"] != meal:
            continue

        # Dietary filters
        if vegetarian and not food["vegetarian"]:
            continue

        if vegan and not food["vegan"]:
            continue

        if gluten_free and not food["gluten_free"]:
            continue

        if halal and not food["halal"]:
            continue

        filtered.append(food)

    return filtered


# ==========================================
# REMOVE DUPLICATES
# ==========================================

def remove_duplicates(foods):
    """
    Removes duplicate foods that may appear
    at multiple stations.
    """

    unique_foods = []

    seen = set()

    for food in foods:

        key = (food["id"], food["meal"])

        if key not in seen:

            seen.add(key)

            unique_foods.append(food)

    return unique_foods


# ==========================================
# TEST
# ==========================================

foods = get_foods(
    location="marciano",
    day="2026-10-26"
)

filtered = filter_foods(
    foods,
    meal="Breakfast",
    vegan=True
)

filtered = remove_duplicates(filtered)


print("Date:", foods[0]["date"])
print("Total menu items:", len(foods))
print("Matching foods:", len(filtered))
print()


for food in filtered:

    print(
        food["name"],
        "| Calories:", food["calories"],
        "| Protein:", food["protein"],
        "| Station:", food["station"]
    )