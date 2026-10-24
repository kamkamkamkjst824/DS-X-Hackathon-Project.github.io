import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("BU_API_KEY")

BASE_URL = "https://public.api-nonprod.bu.edu/api/v1/dining"

HEADERS = {
    "accept": "application/json",
    "x-api-key": API_KEY
}


def get_menu(location):
    url = f"{BASE_URL}/locations/{location}/menu"

    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()

    return response.json()


menu = get_menu("marciano")

for meal in menu["meals"]:
    print(f"\n--- {meal['name']} ---")

    for station in meal["stations"]:
        print(f"\n{station['name']}")

        for item in station["items"]:
            print(
                item["name"],
                "| Calories:", item["calories"],
                "| Protein:", item["protein_grams"]
            )