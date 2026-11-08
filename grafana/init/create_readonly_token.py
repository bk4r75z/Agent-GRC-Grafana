"""Crée un compte de service Grafana en lecture seule (rôle Viewer) pour le serveur MCP.

Le jeton est écrit dans un volume partagé, lu par mcp-grafana via
GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE. Le script est idempotent.
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

GRAFANA_URL = os.getenv("GRAFANA_URL", "http://grafana:3000")
ADMIN = f"{os.getenv('GF_ADMIN_USER', 'admin')}:{os.getenv('GF_ADMIN_PASSWORD', 'admin')}"
TOKEN_FILE = os.getenv("TOKEN_FILE", "/secrets/grafana_mcp_token")
SA_NAME = "mcp-readonly"


def call(method, path, body=None, token=None):
    req = urllib.request.Request(f"{GRAFANA_URL}{path}", method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    else:
        req.add_header("Authorization", "Basic " + base64.b64encode(ADMIN.encode()).decode())
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(req, data, timeout=10) as resp:
        return json.loads(resp.read() or b"{}")


def wait_for_grafana():
    for _ in range(60):
        try:
            call("GET", "/api/health")
            return
        except Exception:
            time.sleep(2)
    sys.exit("Grafana n'a pas démarré")


def main():
    wait_for_grafana()
    if os.path.exists(TOKEN_FILE):
        try:
            call("GET", "/api/search?limit=1", token=open(TOKEN_FILE).read().strip())
            print("Jeton MCP existant toujours valide")
            return
        except urllib.error.HTTPError:
            print("Jeton existant invalide, régénération")

    found = call("GET", f"/api/serviceaccounts/search?query={SA_NAME}")["serviceAccounts"]
    if found:
        sa_id = found[0]["id"]
    else:
        sa_id = call("POST", "/api/serviceaccounts",
                     {"name": SA_NAME, "role": "Viewer", "isDisabled": False})["id"]
    token = call("POST", f"/api/serviceaccounts/{sa_id}/tokens",
                 {"name": f"mcp-{int(time.time())}"})["key"]
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    with open(TOKEN_FILE, "w") as fh:
        fh.write(token)
    os.chmod(TOKEN_FILE, 0o644)
    print(f"Compte de service '{SA_NAME}' (Viewer) prêt, jeton écrit dans {TOKEN_FILE}")


if __name__ == "__main__":
    main()
