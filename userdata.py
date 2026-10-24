"""Local-demo persistence for nutrition preferences (not a login/user database)."""

import json
import math
from pathlib import Path

DATA_FILE = Path(__file__).with_name('user_preferences.json')
FIELDS = ('calories', 'carbs', 'protein', 'saturated_fat')


def validate_preferences(data):
    if not isinstance(data, dict):
        raise ValueError('Expected a JSON object.')
    if set(data) != set(FIELDS):
        raise ValueError('Required fields: ' + ', '.join(FIELDS))
    result = {}
    for field in FIELDS:
        value = data[field]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f'{field} must be a number.')
        if not math.isfinite(value) or value < 0 or value > 100000:
            raise ValueError(f'{field} must be between 0 and 100000.')
        result[field] = value
    return result


def save_preferences(data):
    """Validate and save a single demo profile; return saved values."""
    preferences = validate_preferences(data)
    temp = DATA_FILE.with_suffix('.json.tmp')
    temp.write_text(json.dumps(preferences, indent=2) + '\n', encoding='utf-8')
    temp.replace(DATA_FILE)
    return preferences


def load_preferences():
    if not DATA_FILE.exists():
        return None
    return validate_preferences(json.loads(DATA_FILE.read_text(encoding='utf-8')))
