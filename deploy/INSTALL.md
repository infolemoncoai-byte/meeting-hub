# Meeting Hub — Production deploy (systemd)

Target: EC2 / Ubuntu host.

## 0) Prereqs
- Node + npm installed
- Repo present at `/home/ubuntu/clawd/meeting-hub`

## 1) Create env file (REQUIRED)

```bash
sudo mkdir -p /etc/meeting-hub
sudo nano /etc/meeting-hub/meeting-hub.env
```

Example:
```bash
# Required
MEETING_HUB_PASSWORD=CHANGEME_STRONG
SESSION_PASSWORD=CHANGEME_32+_CHARS_LONG
DATABASE_URL="file:/home/ubuntu/clawd/meeting-hub/data/prod.db"

# Optional (needed for MSU3 summarize)
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

## 2) Install Python deps for transcription (MSU2)
```bash
cd /home/ubuntu/clawd/meeting-hub
python3 -m venv .venv
./.venv/bin/pip install -r scripts/requirements.txt
```

## 3) Build once
```bash
cd /home/ubuntu/clawd/meeting-hub
npm ci
npm run build
```

## 4) Install systemd unit
```bash
sudo cp deploy/meeting-hub.service /etc/systemd/system/meeting-hub.service
sudo systemctl daemon-reload
sudo systemctl enable --now meeting-hub
```

## 5) Check status / logs
```bash
systemctl status meeting-hub --no-pager
journalctl -u meeting-hub -n 200 --no-pager
```

## 6) Update flow
```bash
cd /home/ubuntu/clawd/meeting-hub
git pull
npm ci
npm run build
sudo systemctl restart meeting-hub
```

## Notes
- Service listens on port 3001 by default.
- Ensure your Security Group allows inbound 3001/tcp (temporary) or put behind a reverse proxy + HTTPS later.
