"""BACKEND_CORS_ORIGINS can be written as a JSON list or as plain addresses."""
import pytest

from src.core.config import Settings

A, B = "https://a.example.com", "https://b.example.com"


@pytest.mark.parametrize("value,expected", [
    (f'["{A}"]', [A]),
    (f'["{A}/","{B}"]', [A, B]),
    (A, [A]),
    (f" {A}/ , {B} ", [A, B]),
    ("", []),
])
def test_cors_origins_from_the_environment(monkeypatch, value, expected):
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", value)
    assert Settings().BACKEND_CORS_ORIGINS == expected
