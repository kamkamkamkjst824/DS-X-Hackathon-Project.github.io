def get_other_preferences(
    vegetarian=False,
    vegan=False,
    gluten_free=False,
    halal=False,
    cool_food=False
):
    preferences = {
        "vegetarian": vegetarian,
        "vegan": vegan,
        "gluten_free": gluten_free,
        "halal": halal,
        "cool_food": cool_food
    }

    return preferences