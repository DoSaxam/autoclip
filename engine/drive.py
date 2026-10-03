"""Google Drive integration: real OAuth2 + resumable upload to an 'Autoclip' folder.
Activated only when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars exist.
Without credentials, clips stay local and links are preserved (never lost)."""
import json
import os
import time

from . import config

TOKEN_PATH = os.path.join(config.DATA_DIR, "drive_token.json")
SCOPE = "https://www.googleapis.com/auth/drive.file"


def is_configured() -> bool:
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))


def get_token():
    if not os.path.exists(TOKEN_PATH):
        return None
    try:
        with open(TOKEN_PATH) as f:
            return json.load(f)
    except Exception:
        return None


def status() -> dict:
    tok = get_token()
    return {
        "configured": is_configured(),
        "connected": bool(tok and tok.get("access_token")),
        "email": (tok or {}).get("email", ""),
    }


def auth_url(redirect_origin: str) -> str:
    cid = os.environ["GOOGLE_CLIENT_ID"]
    redirect = f"{redirect_origin}/engine/api/drive/callback"
    from urllib.parse import urlencode, quote
    params = {
        "client_id": cid,
        "redirect_uri": redirect,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "scope": SCOPE,
        "include_granted_scopes": "true",
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)


def exchange_code(code: str, redirect_origin: str) -> dict:
    import requests
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": f"{redirect_origin}/engine/api/drive/callback",
        "grant_type": "authorization_code",
    }, timeout=30)
    resp.raise_for_status()
    tok = resp.json()
    save_token(tok)
    return tok


def save_token(tok: dict):
    if "refresh_token" not in tok and get_token():
        tok["refresh_token"] = get_token()["refresh_token"]
    with open(TOKEN_PATH, "w") as f:
        json.dump(tok, f)


def refresh_access() -> str:
    tok = get_token()
    if not tok:
        raise RuntimeError("not connected to Google Drive")
    if tok.get("expires_at", 0) > time.time() + 60:
        return tok["access_token"]
    if not tok.get("refresh_token"):
        raise RuntimeError("no refresh token — reconnect Google Drive")
    import requests
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "refresh_token": tok["refresh_token"],
        "grant_type": "refresh_token",
    }, timeout=30)
    resp.raise_for_status()
    new = resp.json()
    tok["access_token"] = new["access_token"]
    tok["expires_at"] = time.time() + new.get("expires_in", 3600)
    save_token(tok)
    return tok["access_token"]


def _ensure_folder(access: str) -> str:
    """Find or create the 'Autoclip' folder, return its id."""
    import requests
    r = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        params={"q": "name='Autoclip' and mimeType='application/vnd.google-apps.folder' "
                     "and trashed=false", "fields": "files(id,name)"},
        headers={"Authorization": f"Bearer {access}"}, timeout=30,
    )
    r.raise_for_status()
    items = r.json().get("files", [])
    if items:
        return items[0]["id"]
    r = requests.post(
        "https://www.googleapis.com/drive/v3/files",
        json={"name": "Autoclip", "mimeType": "application/vnd.google-apps.folder"},
        headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["id"]


def upload_file(path: str, title: str) -> str:
    """Resumable upload; returns the Drive webViewLink."""
    import requests
    access = refresh_access()
    folder_id = _ensure_folder(access)
    meta = {"name": f"{title}.mp4", "parents": [folder_id]}
    init = requests.post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
        headers={"Authorization": f"Bearer {access}",
                 "Content-Type": "application/json; charset=UTF-8"},
        json=meta, timeout=30,
    )
    init.raise_for_status()
    session_uri = init.headers["Location"]
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        up = requests.put(session_uri, data=f,
                          headers={"Content-Length": str(size)}, timeout=1800)
    up.raise_for_status()
    file_id = up.json().get("id")
    r = requests.get(
        f"https://www.googleapis.com/drive/v3/files/{file_id}",
        params={"fields": "webViewLink"},
        headers={"Authorization": f"Bearer {access}"}, timeout=30,
    )
    r.raise_for_status()
    return r.json().get("webViewLink", "")
