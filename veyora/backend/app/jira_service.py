"""Jira Cloud REST API v3 integration service.

Supports testing connection, issue type discovery, issue creation, linking
existing issues, and refreshing issue status for Risks and Incidents.
Credentials come strictly from backend environment variables.
"""
from __future__ import annotations

import base64
import json
import os
import threading
from typing import Any
import urllib.error
import urllib.parse
import urllib.request

# Global in-memory set to prevent concurrent creation requests for the same entity
_in_flight_creations: set[str] = set()
_in_flight_lock = threading.Lock()


def get_jira_config() -> dict[str, str] | None:
    """Retrieve Jira configuration from environment. Returns None if incomplete."""
    site_url = (os.environ.get("JIRA_SITE_URL") or "").strip().rstrip("/")
    email = (os.environ.get("JIRA_EMAIL") or "").strip()
    token = (os.environ.get("JIRA_API_TOKEN") or "").strip()
    project_key = (os.environ.get("JIRA_PROJECT_KEY") or "").strip().upper()

    if not (site_url and email and token and project_key):
        return None

    return {
        "site_url": site_url,
        "email": email,
        "token": token,
        "project_key": project_key,
    }


def is_jira_configured() -> bool:
    return get_jira_config() is not None


def _make_auth_header(email: str, token: str) -> str:
    creds = f"{email}:{token}".encode("utf-8")
    return f"Basic {base64.b64encode(creds).decode('ascii')}"


def _jira_request(
    endpoint: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    timeout: float = 12.0,
) -> tuple[int, dict[str, Any] | None, str | None]:
    """Execute an authenticated request to Jira Cloud REST API v3.
    
    Returns (status_code, response_dict, error_message).
    """
    cfg = get_jira_config()
    if not cfg:
        return 0, None, "Jira integration is not configured."

    url = f"{cfg['site_url']}/rest/api/3/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": _make_auth_header(cfg["email"], cfg["token"]),
        "Accept": "application/json",
        "User-Agent": "VEYORA-Healthcare/1.0",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            status = resp.status
            try:
                res_data = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                res_data = {}
            return status, res_data, None
    except urllib.error.HTTPError as e:
        status = e.code
        err_body = e.read().decode("utf-8", errors="replace")
        err_msg = f"Jira API error ({status})"
        try:
            parsed = json.loads(err_body)
            if "errorMessages" in parsed and parsed["errorMessages"]:
                err_msg = "; ".join(parsed["errorMessages"])
            elif "errors" in parsed and isinstance(parsed["errors"], dict):
                err_msg = "; ".join(f"{k}: {v}" for k, v in parsed["errors"].items())
            elif "message" in parsed:
                err_msg = parsed["message"]
        except Exception:
            if err_body:
                err_msg = err_body[:200]

        if status == 401:
            err_msg = "Invalid Jira credentials. Check JIRA_EMAIL and JIRA_API_TOKEN."
        elif status == 403:
            err_msg = f"Insufficient permissions to access project {cfg['project_key']} in Jira."
        elif status == 404:
            err_msg = "Requested Jira resource or project was not found."

        return status, None, err_msg
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError) or "timed out" in str(e.reason).lower():
            return 0, None, "Jira connection timed out."
        return 0, None, f"Network error connecting to Jira: {e.reason}"
    except Exception as e:
        return 0, None, f"Unexpected error communicating with Jira: {str(e)}"


def test_connection() -> dict[str, Any]:
    """Test connection to Jira and verify access to the configured project."""
    cfg = get_jira_config()
    if not cfg:
        return {
            "configured": False,
            "connected": False,
            "message": "Jira is not configured. Set JIRA_SITE_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY in your backend environment.",
        }

    # 1. Test credentials with /myself
    status, user_data, err = _jira_request("myself")
    if err or not user_data:
        return {
            "configured": True,
            "connected": False,
            "site_url": cfg["site_url"],
            "project_key": cfg["project_key"],
            "message": err or "Failed to authenticate with Jira.",
        }

    user_name = user_data.get("displayName") or user_data.get("emailAddress") or cfg["email"]

    # 2. Check access to configured project and discover issue types
    status, proj_data, err = _jira_request(f"project/{cfg['project_key']}")
    if err or not proj_data:
        return {
            "configured": True,
            "connected": False,
            "site_url": cfg["site_url"],
            "project_key": cfg["project_key"],
            "user": user_name,
            "message": f"Project '{cfg['project_key']}' check failed: {err}",
        }

    issue_types = [
        {"id": it.get("id"), "name": it.get("name"), "subtask": it.get("subtask", False)}
        for it in proj_data.get("issueTypes", [])
        if not it.get("subtask", False)
    ]

    return {
        "configured": True,
        "connected": True,
        "site_url": cfg["site_url"],
        "project_key": cfg["project_key"],
        "project_name": proj_data.get("name", cfg["project_key"]),
        "user": user_name,
        "issue_types": issue_types,
        "message": f"Successfully connected to Jira project '{cfg['project_key']}' as {user_name}.",
    }


def get_available_issue_types() -> list[dict[str, Any]]:
    """Retrieve non-subtask issue types available in the configured project."""
    cfg = get_jira_config()
    if not cfg:
        return []

    status, proj_data, err = _jira_request(f"project/{cfg['project_key']}")
    if err or not proj_data:
        return []

    return [
        {"id": it.get("id"), "name": it.get("name")}
        for it in proj_data.get("issueTypes", [])
        if not it.get("subtask", False)
    ]


def _text_to_adf(text: str) -> dict[str, Any]:
    """Convert plain text into Jira Atlassian Document Format (ADF) v3."""
    paragraphs = []
    lines = text.strip().split("\n")
    cur_para: list[dict[str, str]] = []

    for line in lines:
        cleaned = line.rstrip()
        if not cleaned:
            if cur_para:
                paragraphs.append({
                    "type": "paragraph",
                    "content": cur_para,
                })
                cur_para = []
        else:
            if cur_para:
                cur_para.append({"type": "hardBreak"})
            cur_para.append({"type": "text", "text": cleaned})

    if cur_para:
        paragraphs.append({
            "type": "paragraph",
            "content": cur_para,
        })

    if not paragraphs:
        paragraphs = [{
            "type": "paragraph",
            "content": [{"type": "text", "text": "No description provided."}],
        }]

    return {
        "type": "doc",
        "version": 1,
        "content": paragraphs,
    }


def create_issue(
    entity_key: str,
    summary: str,
    description: str,
    issue_type: str = "Task",
) -> tuple[dict[str, Any] | None, str | None]:
    """Create an issue in the configured Jira project.
    
    entity_key is used for concurrency protection (e.g. 'risk-1' or 'incident-5').
    """
    cfg = get_jira_config()
    if not cfg:
        return None, "Jira integration is not configured."

    with _in_flight_lock:
        if entity_key in _in_flight_creations:
            return None, "A Jira issue creation request is already in progress for this item."
        _in_flight_creations.add(entity_key)

    try:
        # Discover project issue types to match case-insensitively or fall back safely
        avail_types = get_available_issue_types()
        matched_type = None
        if avail_types:
            for it in avail_types:
                if it["name"].lower() == issue_type.lower():
                    matched_type = it["name"]
                    break
            if not matched_type:
                # Fallback to Task or the first available type
                for it in avail_types:
                    if "task" in it["name"].lower():
                        matched_type = it["name"]
                        break
                if not matched_type:
                    matched_type = avail_types[0]["name"]
        else:
            matched_type = issue_type

        payload = {
            "fields": {
                "project": {"key": cfg["project_key"]},
                "summary": summary.strip()[:255],
                "issuetype": {"name": matched_type},
                "description": _text_to_adf(description),
            }
        }

        status, data, err = _jira_request("issue", method="POST", body=payload)
        if err or not data or "key" not in data:
            if "timed out" in (err or "").lower():
                return None, "Creation outcome unknown—check Jira before retrying."
            return None, err or "Failed to create Jira issue."

        jira_key = data["key"]
        jira_id = str(data.get("id") or "")
        jira_url = f"{cfg['site_url']}/browse/{jira_key}"

        # Fetch status of created issue
        st_code, issue_data, _ = _jira_request(f"issue/{jira_key}?fields=status")
        initial_status = "Open"
        if issue_data and "fields" in issue_data:
            initial_status = issue_data["fields"].get("status", {}).get("name", "Open")

        return {
            "jira_id": jira_id,
            "jira_key": jira_key,
            "jira_url": jira_url,
            "jira_status": initial_status,
        }, None

    finally:
        with _in_flight_lock:
            _in_flight_creations.discard(entity_key)


def verify_and_get_issue(jira_key: str) -> tuple[dict[str, Any] | None, str | None]:
    """Verify an existing issue belongs to the configured project and retrieve status."""
    cfg = get_jira_config()
    if not cfg:
        return None, "Jira integration is not configured."

    jira_key = jira_key.strip().upper()
    status, data, err = _jira_request(f"issue/{jira_key}?fields=status,project,summary")
    if err or not data or "fields" not in data:
        return None, err or f"Issue '{jira_key}' was not found in Jira."

    proj = data["fields"].get("project", {})
    if proj.get("key", "").upper() != cfg["project_key"]:
        return None, (
            f"Issue '{jira_key}' belongs to project '{proj.get('key')}', "
            f"not the configured project '{cfg['project_key']}'."
        )

    jira_status = data["fields"].get("status", {}).get("name", "Unknown")
    jira_id = str(data.get("id") or "")
    jira_url = f"{cfg['site_url']}/browse/{jira_key}"

    return {
        "jira_id": jira_id,
        "jira_key": jira_key,
        "jira_url": jira_url,
        "jira_status": jira_status,
        "summary": data["fields"].get("summary", ""),
    }, None


def refresh_issue_status(jira_key: str) -> tuple[str | None, str | None]:
    """Fetch current status for a linked issue key. Returns (status_name, error)."""
    res, err = verify_and_get_issue(jira_key)
    if err or not res:
        return None, err
    return res["jira_status"], None
