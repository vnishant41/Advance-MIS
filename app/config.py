"""
Application configuration.
"""
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'erp-secret-key-change-in-production-2026')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-advance-erp-super-secret-key-32bytes-2026-production')
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours in seconds
    JWT_TOKEN_LOCATION = ['headers', 'cookies']
    JWT_COOKIE_SECURE = True  # Set True in production with HTTPS

    MYSQL_URI = os.environ.get('MYSQL_URI', '')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or MYSQL_URI or 'mysql+pymysql://localhost/advance_erp'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 280,
        'pool_timeout': 30
    }

    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max upload

    # Default settings (can be overridden in DB)
    DEFAULT_WINDOW_START = '08:00'
    DEFAULT_WINDOW_END = '22:00'
    DEFAULT_ESCALATE_DAYS = 3
