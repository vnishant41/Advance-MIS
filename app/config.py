"""
Application configuration.
"""
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'erp-secret-key-change-in-production-2026')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-erp-secret-2026')
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours in seconds
    JWT_TOKEN_LOCATION = ['headers', 'cookies']
    JWT_COOKIE_SECURE = True  # Set True in production with HTTPS

    MYSQL_URI = 'mysql+pymysql://erp_user:Researc2026@168.144.28.192:3306/advance_erp'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', MYSQL_URI)
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max upload

    # Default settings (can be overridden in DB)
    DEFAULT_WINDOW_START = '08:00'
    DEFAULT_WINDOW_END = '22:00'
    DEFAULT_ESCALATE_DAYS = 3
