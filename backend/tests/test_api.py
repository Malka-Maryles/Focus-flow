import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    """Verify health endpoint returns 200 OK and expected structure."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["app"] == "FocusFlow"
    assert "database" in data
    assert "simulation_mode" in data

def test_registration_validation():
    """Verify registration rejects invalid inputs (short password, bad email)."""
    # Short password (< 8 chars)
    resp = client.post("/api/auth/register", json={
        "email": "valid@example.com",
        "password": "123",
        "display_name": "משתמש"
    })
    assert resp.status_code == 422 or resp.status_code == 400

    # Invalid email
    resp = client.post("/api/auth/register", json={
        "email": "not-an-email",
        "password": "password123",
        "display_name": "משתמש"
    })
    assert resp.status_code == 422 or resp.status_code == 400

def test_unauthenticated_protected_endpoints():
    """Verify that protected endpoints reject requests without a valid token."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401

    resp = client.get("/api/content")
    assert resp.status_code == 401

    resp = client.get("/api/sessions")
    assert resp.status_code == 401
