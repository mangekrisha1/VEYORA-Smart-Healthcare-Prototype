"""Risk register validation, scoring, and planning workspace."""
from conftest import login


def test_seeded_register_and_metrics(client):
    csrf = login(client, "pm")
    body = client.get("/api/risks").get_json()
    codes = {r["code"] for r in body["risks"]}
    assert {"RISK-01", "RISK-02", "RISK-03", "RISK-04", "RISK-05", "RISK-06"} <= codes
    assert body["metrics"]["open"] >= 6
    for r in body["risks"]:
        assert r["score"] == r["probability"] * r["impact"]


def test_score_bands(client):
    from app.models import score_band
    assert score_band(1) == "Low" and score_band(4) == "Low"
    assert score_band(5) == "Moderate" and score_band(9) == "Moderate"
    assert score_band(10) == "High" and score_band(16) == "High"
    assert score_band(17) == "Critical" and score_band(25) == "Critical"


def test_create_risk_computes_score(client):
    csrf = login(client, "pm")
    resp = client.post("/api/risks", json={
        "title": "Test risk", "description": "d", "category": "Schedule",
        "probability": 4, "impact": 5, "owner": "Krisha Mange",
        "mitigation": "m", "contingency": "c"},
        headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 201
    risk = resp.get_json()["risk"]
    assert risk["score"] == 20 and risk["band"] == "Critical"


def test_risk_validation(client):
    csrf = login(client, "pm")
    bad_cases = [
        {"title": "x", "probability": 0, "impact": 3},
        {"title": "x", "probability": 6, "impact": 3},
        {"title": "x", "probability": "high", "impact": 3},
        {"title": "", "probability": 3, "impact": 3},
        {"title": "x", "probability": 3, "impact": 3, "category": "Bogus"},
    ]
    for payload in bad_cases:
        resp = client.post("/api/risks", json=payload,
                           headers={"X-CSRF-Token": csrf})
        assert resp.status_code == 400, payload


def test_update_close_reopen(client):
    csrf = login(client, "pm")
    risks = client.get("/api/risks").get_json()["risks"]
    target = next(r for r in risks if r["code"] == "RISK-06")

    resp = client.patch(f"/api/risks/{target['id']}", json={"action": "close"},
                        headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200 and resp.get_json()["risk"]["status"] == "CLOSED"

    resp = client.patch(f"/api/risks/{target['id']}", json={"action": "reopen"},
                        headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200 and resp.get_json()["risk"]["status"] == "OPEN"

    resp = client.patch(f"/api/risks/{target['id']}",
                        json={"probability": 3, "impact": 4},
                        headers={"X-CSRF-Token": csrf})
    assert resp.get_json()["risk"]["score"] == 12

    resp = client.patch(f"/api/risks/{target['id']}", json={"probability": 9},
                        headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 400


def test_risk_search_and_filter(client):
    login(client, "pm")
    body = client.get("/api/risks?q=duplicate").get_json()
    assert any(r["code"] == "RISK-02" for r in body["risks"])
    body = client.get("/api/risks?category=Security").get_json()
    assert all(r["category"] == "Security" for r in body["risks"])


def test_task_workflow_and_plan_metrics(client):
    csrf = login(client, "pm")
    tasks = client.get("/api/tasks").get_json()["tasks"]
    assert tasks, "seeded task board expected"

    t = tasks[0]
    resp = client.patch(f"/api/tasks/{t['id']}", json={"status": "IN_PROGRESS"},
                        headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    resp = client.patch(f"/api/tasks/{t['id']}", json={"status": "BOGUS"},
                        headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 400

    plan = client.get("/api/plan").get_json()
    assert plan["task_progress"]["in_progress"] >= 1
    assert plan["effort"]["actual_hours"] is None  # never fabricated
    assert plan["verification_progress"]["total"] >= 8


def test_verification_record_requires_evidence(client):
    csrf = login(client, "pm")
    recs = client.get("/api/verification").get_json()["records"]
    rec = recs[0]
    # PASS without date/evidence is refused — results must be real.
    resp = client.post(f"/api/verification/{rec['id']}/record",
                       json={"result": "PASS"},
                       headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 400

    resp = client.post(f"/api/verification/{rec['id']}/record",
                       json={"result": "PASS", "run_date": "2026-10-04",
                             "evidence_source": "pytest log"},
                       headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    assert resp.get_json()["record"]["result"] == "PASS"


def test_delivery_plan_get_and_save(client):
    csrf = login(client, "pm")
    # Initially None
    res = client.get("/api/delivery-plan")
    assert res.status_code == 200
    assert res.get_json()["plan"] is None

    # Invalid payload
    bad_payload = {
        "deadline": "invalid-date",
        "available_hours": 100,
        "remaining_hours": 50,
        "buffer_hours": 10,
        "jira_url": "https://jira.example.com",
    }
    res = client.put("/api/delivery-plan", json=bad_payload, headers={"X-CSRF-Token": csrf})
    assert res.status_code == 400

    # Valid payload
    valid_payload = {
        "deadline": "2026-11-15",
        "available_hours": 100.0,
        "remaining_hours": 60.0,
        "buffer_hours": 15.0,
        "jira_url": "https://jira.atlassian.net/projects/VEYORA",
    }
    res = client.put("/api/delivery-plan", json=valid_payload, headers={"X-CSRF-Token": csrf})
    assert res.status_code == 200
    data = res.get_json()["plan"]
    assert data["deadline"] == "2026-11-15"
    assert data["available_hours"] == 100.0
    assert data["remaining_hours"] == 60.0
    assert data["buffer_hours"] == 15.0
    assert data["required_hours"] == 75.0
    assert data["capacity_gap"] == 25.0
    assert data["jira_url"] == "https://jira.atlassian.net/projects/VEYORA"

    # GET returns updated plan
    res = client.get("/api/delivery-plan")
    assert res.status_code == 200
    assert res.get_json()["plan"]["deadline"] == "2026-11-15"


def test_milestone_update_extended(client):
    csrf = login(client, "pm")
    milestones = client.get("/api/milestones").get_json()["milestones"]
    ms = milestones[0]

    # Valid update
    res = client.patch(f"/api/milestones/{ms['id']}", json={
        "due_date": "2026-10-20",
        "status": "In progress",
        "notes": "Testing milestone progress notes"
    }, headers={"X-CSRF-Token": csrf})
    assert res.status_code == 200
    updated = res.get_json()["milestone"]
    assert updated["due_date"] == "2026-10-20"
    assert updated["status"] == "In progress"
    assert updated["notes"] == "Testing milestone progress notes"

    # Invalid status
    res = client.patch(f"/api/milestones/{ms['id']}", json={"status": "INVALID"}, headers={"X-CSRF-Token": csrf})
    assert res.status_code == 400

    # Notes too long
    res = client.patch(f"/api/milestones/{ms['id']}", json={"notes": "x" * 281}, headers={"X-CSRF-Token": csrf})
    assert res.status_code == 400

