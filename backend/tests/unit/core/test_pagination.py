from src.core.pagination import PaginationMeta, next_page_cursor


def test_next_page_cursor_is_absent_on_last_page():
    assert next_page_cursor(page=2, limit=10, total_records=20) is None


def test_next_page_cursor_points_to_next_page():
    assert next_page_cursor(page=1, limit=10, total_records=21) == "page=2&limit=10"


def test_pagination_meta_serializes_camel_case():
    meta = PaginationMeta(page=1, limit=10, total_records=0)
    assert meta.model_dump(by_alias=True) == {
        "page": 1,
        "limit": 10,
        "total_records": 0,
    }
