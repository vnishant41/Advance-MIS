# DigitalOcean Production Server Deployment Guide

Production-ready terminal commands for deploying **Advance ERP (Flask + SocketIO + MySQL + Eventlet)** on an **Ubuntu 22.04 / 24.04 LTS DigitalOcean Droplet**.

---

## 1. System Packages & Firewall Setup

```bash
# Update system repositories
sudo apt update && sudo apt upgrade -y

# Install Python build tools, Git, Nginx, and MySQL client libraries
sudo apt install -y python3-pip python3-venv python3-dev build-essential \
                    git curl ufw nginx certbot python3-certbot-nginx \
                    pkg-config libmysqlclient-dev default-libmysqlclient-dev

# Configure firewall (SSH + HTTP/HTTPS)
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## 2. MySQL Setup (Skip if using DigitalOcean Managed Database)

```bash
# Install MySQL Server
sudo apt install -y mysql-server
sudo systemctl enable --now mysql

# Create database, user, and assign privileges
sudo mysql -e "CREATE DATABASE advance_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'erp_user'@'localhost' IDENTIFIED BY 'StrongProductionPasswordHere#2026';"
sudo mysql -e "GRANT ALL PRIVILEGES ON advance_erp.* TO 'erp_user'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"

# (Optional) Restore existing backup SQL dump if you have one:
# mysql -u erp_user -p advance_erp < /path/to/advance_erp_backup.sql
```

---

## 3. Clone Repository & Setup Virtualenv

```bash
# Set deployment directory
sudo mkdir -p /var/www/advance-erp
sudo chown -R $USER:www-data /var/www/advance-erp
cd /var/www/advance-erp

# Clone repository
git clone <YOUR_GIT_REPOSITORY_URL> .

# Setup Python 3 virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip & install dependencies (including gunicorn for production WSGI)
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install gunicorn

# Ensure upload directory & permissions exist
mkdir -p uploads
chmod -R 775 uploads
sudo chown -R www-data:www-data uploads
```

---

## 4. Production Environment Configuration (`.env`)

```bash
cat << 'EOF' > /var/www/advance-erp/.env
# Flask Core
SECRET_KEY=generate_with_openssl_rand_hex_32
JWT_SECRET_KEY=generate_with_openssl_rand_hex_32

# Production MySQL
DATABASE_URL=mysql+pymysql://erp_user:StrongProductionPasswordHere#2026@127.0.0.1:3306/advance_erp
MYSQL_URI=mysql+pymysql://erp_user:StrongProductionPasswordHere#2026@127.0.0.1:3306/advance_erp

# Target Surveillance DB (agalabsdev_stage)
STAGE_DB_HOST=127.0.0.1
STAGE_DB_PORT=3306
STAGE_DB_USER=erp_user
STAGE_DB_PASS=StrongProductionPasswordHere#2026
STAGE_DB_NAME=agalabsdev_stage

# SMTP Configuration (Sending Automated MIS Digests)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=your_email@domain.com

# Gmail IMAP Ingestion
GMAIL_IMAP_SERVER=imap.gmail.com
GMAIL_IMAP_PORT=993
GMAIL_USER=your_email@domain.com
GMAIL_APP_PASSWORD=your_gmail_app_password
GMAIL_SEARCH_CRITERIA=ALL
EOF

# Lock down .env permissions
chmod 600 /var/www/advance-erp/.env
```

> **Key Generation:** Generate random 32-byte secret tokens via:
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```

---

## 5. Systemd Service Setup

Since the app uses `Flask-SocketIO` with `eventlet`, run Gunicorn with `--worker-class eventlet` and 1 worker process.

```bash
# Create log directory
sudo mkdir -p /var/log/advance-erp
sudo chown -R www-data:www-data /var/log/advance-erp

# Write systemd service definition
sudo tee /etc/systemd/system/advance-erp.service > /dev/null << 'EOF'
[Unit]
Description=Advance ERP Flask + SocketIO Service
After=network.target mysql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/advance-erp
EnvironmentFile=/var/www/advance-erp/.env
ExecStart=/var/www/advance-erp/.venv/bin/gunicorn \
    --worker-class eventlet \
    -w 1 \
    --bind 127.0.0.1:5000 \
    --timeout 120 \
    --access-logfile /var/log/advance-erp/access.log \
    --error-logfile /var/log/advance-erp/error.log \
    run:app

Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd, enable and start service
sudo systemctl daemon-reload
sudo systemctl enable advance-erp
sudo systemctl restart advance-erp
sudo systemctl status advance-erp --no-pager
```

---

## 6. Nginx Reverse Proxy with WebSocket & File Upload Support

```bash
# Create Nginx server configuration
sudo tee /etc/nginx/sites-available/advance-erp > /dev/null << 'EOF'
server {
    listen 80;
    server_name your_domain.com www.your_domain.com; # or server IP

    client_max_body_size 100M;

    # Serve static assets directly
    location /static/ {
        alias /var/www/advance-erp/app/static/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Flask App & REST APIs
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SocketIO / WebSockets Reverse Proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

# Enable site and test configuration
sudo ln -sf /etc/nginx/sites-available/advance-erp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

---

## 7. SSL Certificate Setup (Let's Encrypt)

```bash
# Provision SSL and automatically configure HTTPS redirect in Nginx
sudo certbot --nginx -d your_domain.com -d www.your_domain.com --non-interactive --agree-tos -m admin@your_domain.com
```

---

## 8. Deployment Automation Script

Save this script at `/var/www/advance-erp/deploy.sh` to handle fast updates:

```bash
cat << 'EOF' > /var/www/advance-erp/deploy.sh
#!/usr/bin/env bash
set -e
cd /var/www/advance-erp
git pull origin main
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart advance-erp
sudo systemctl status advance-erp --no-pager
echo "Deployment successful."
EOF
chmod +x /var/www/advance-erp/deploy.sh
```

---

## 9. Diagnostic & Log Monitoring Commands

```bash
# View live application journal logs
sudo journalctl -u advance-erp -f

# View Gunicorn error and access logs
sudo tail -f /var/log/advance-erp/error.log
sudo tail -f /var/log/advance-erp/access.log

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Service control
sudo systemctl restart advance-erp
sudo systemctl restart nginx
```

