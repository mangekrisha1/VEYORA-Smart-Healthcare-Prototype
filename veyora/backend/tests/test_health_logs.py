"""Health log validation and ownership (technical constraints, not clinical)."""
from conftest import login


def _post(client, csrf, payload):
    return client.post("/api/health-logs", json=payload,
                       headers={"X-CSRF-Token": csrf})


def test_create_and_list_all_types(client):
    csrf = login(client, "patient")
    assert _post(client, csrf, {"type": "HEART_RATE", "value": 72,
                                "note": "resting"}).status_code == 201
    assert _post(client, csrf, {"type": "TEMPERATURE",
                                "value": 36.8}).status_code == 201
    assert _post(client, csrf, {"type": "BLOOD_PRESSURE", "systolic": 120,
                                "diastolic": 80}).status_code == 201
    logs = client.get("/api/health-logs").get_json()["logs"]
    types = {l["type"] for l in logs}
    assert {"HEART_RATE", "TEMPERATURE", "BLOOD_PRESSURE"} <= types
    bp = next(l for l in logs if l["type"] == "BLOOD_PRESSURE")
    assert bp["systolic"] == 120 and bp["diastolic"] == 80


def test_filter_by_type(client):
    csrf = login(client, "patient")
    _post(client, csrf, {"type": "HEART_RATE", "value": 70})
    _post(client, csrf, {"type": "TEMPERATURE", "value": 37.0})
    logs = client.get("/api/health-logs?type=TEMPERATURE").get_json()["logs"]
    assert logs and all(l["type"] == "TEMPERATURE" for l in logs)


def test_invalid_type_rejected(client):
    csrf = login(client, "patient")
    resp = _post(client, csrf, {"type": "GLUCOSE", "value": 90})
    assert resp.status_code == 400


def test_out_of_range_rejected(client):
    csrf = login(client, "patient")
    assert _post(client, csrf, {"type": "HEART_RATE", "value": 999}).status_code == 400
    assert _post(client, csrf, {"type": "HEART_RATE", "value": -5}).status_code == 400
    assert _post(client, csrf, {"type": "TEMPERATURE", "value": 60}).status_code == 400
    assert _post(client, csrf, {"type": "BLOOD_PRESSURE", "systolic": 400,
                                "diastolic": 80}).status_code == 400


def test_wrong_types_rejected(client):
    csrf = login(client, "patient")
    assert _post(client, csrf, {"type": "HEART_RATE",
                                "value": "fast"}).status_code == 400
    assert _post(client, csrf, {"type": "HEART_RATE",
                                "value": 70.5}).status_code == 400  # whole bpm
    assert _post(client, csrf, {"type": "BLOOD_PRESSURE", "systolic": 120}
                 ).status_code == 400  # missing diastolic
    assert _post(client, csrf, {"type": "BLOOD_PRESSURE", "systolic": 80,
                                "diastolic": 120}).status_code == 400  # inverted


def test_delete_own_log(client):
    csrf = login(client, "patient")
    created = _post(client, csrf, {"type": "HEART_RATE", "value": 75})
    log_id = created.get_json()["log"]["id"]
    resp = client.delete(f"/api/health-logs/{log_id}",
                         headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    logs = client.get("/api/health-logs").get_json()["logs"]
    assert all(l["id"] != log_id for l in logs)
