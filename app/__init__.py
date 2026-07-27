"""
Advanced MIS — Flask Application Factory
"""
import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_jwt_extended import JWTManager

db = SQLAlchemy()
jwt = JWTManager()
socketio = SocketIO(cors_allowed_origins="*")


def create_app():
    app = Flask(__name__,
                static_folder='static',
                template_folder='templates')

    app.config.from_object('app.config.Config')

    # Ensure directories exist
    os.makedirs(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'instance'), exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)
    CORS(app)
    socketio.init_app(app, async_mode='eventlet')

    # Register blueprints
    from app.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    from app.routes.dashboard import dashboard_bp
    app.register_blueprint(dashboard_bp, url_prefix='/api/dash')

    from app.routes.tasks import tasks_bp
    app.register_blueprint(tasks_bp, url_prefix='/api/tasks')

    from app.routes.data_update import du_bp
    app.register_blueprint(du_bp, url_prefix='/api/du')

    from app.routes.mis_report import mis_bp
    app.register_blueprint(mis_bp, url_prefix='/api/mis')

    from app.routes.kanban import kanban_bp
    app.register_blueprint(kanban_bp, url_prefix='/api/kanban')

    from app.routes.chat import chat_bp
    app.register_blueprint(chat_bp, url_prefix='/api/chat')

    from app.routes.admin import admin_bp
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    from app.routes.analytics import analytics_bp
    app.register_blueprint(analytics_bp, url_prefix='/api/analytics')

    from app.routes.roster import roster_bp
    app.register_blueprint(roster_bp, url_prefix='/api/roster')

    from app.routes.notifications import notif_bp
    app.register_blueprint(notif_bp, url_prefix='/api/notifications')

    # Serve the SPA
    @app.route('/')
    def index():
        from flask import render_template
        return render_template('index.html')

    # Create tables
    with app.app_context():
        from app import models  # noqa: F401
        db.create_all()
        _run_lightweight_migrations()

    # Register the global socket-connect handler so each session joins a
    # personal room keyed by their email — the scheduler emits to that room.
    _register_socket_handlers()

    # Boot the background reminder scheduler. Disabled when the Flask reloader
    # is active in the parent process to avoid two schedulers running at once.
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
        from app.services.scheduler import start_scheduler
        start_scheduler(app, socketio)

    return app


def _register_socket_handlers():
    """User joins a Socket.IO room named after their email on connect.
    The background scheduler emits notifications to that room so each user
    only receives their own alerts.
    """
    from flask_socketio import join_room
    from flask_jwt_extended import decode_token

    @socketio.on('connect')
    def _on_connect(auth=None):
        token = (auth or {}).get('token') if isinstance(auth, dict) else None
        if not token:
            return  # anonymous socket; no personal room
        try:
            payload = decode_token(token)
            user_email = (payload.get('sub') or '').lower()
        except Exception:
            return
        if user_email:
            join_room(user_email)


def _run_lightweight_migrations():
    """Add columns to existing tables when models grow new fields."""
    from sqlalchemy import text, inspect
    expected = {
        'reports':           [('backup_1', "VARCHAR(255) DEFAULT ''"),
                              ('backup_2', "VARCHAR(255) DEFAULT ''"),
                              ('schedule_day', "VARCHAR(50) DEFAULT ''"),
                              ('instructions', "TEXT")],
        'task_templates':    [('backup_1', "VARCHAR(255) DEFAULT ''"),
                              ('backup_2', "VARCHAR(255) DEFAULT ''"),
                              ('schedule_day', "VARCHAR(50) DEFAULT ''"),
                              ('instructions', "TEXT")],
        'commodity_configs': [('primary_assignee', "VARCHAR(255) DEFAULT ''"),
                              ('backup_1', "VARCHAR(255) DEFAULT ''"),
                              ('backup_2', "VARCHAR(255) DEFAULT ''"),
                              ('schedule_day', "VARCHAR(50) DEFAULT ''"),
                              ('instructions', "TEXT")],
        'report_groups':     [('backup_1', "VARCHAR(255) DEFAULT ''"),
                              ('backup_2', "VARCHAR(255) DEFAULT ''"),
                              ('schedule_day', "VARCHAR(50) DEFAULT ''")],
        'roster_configs':    [('schedule_day', "VARCHAR(50) DEFAULT ''")],
        'chat_messages':     [('attachment_filename', "VARCHAR(255) DEFAULT ''"),
                              ('attachment_original', "VARCHAR(255) DEFAULT ''"),
                              ('attachment_size', "INTEGER DEFAULT 0"),
                              ('attachment_mime', "VARCHAR(100) DEFAULT ''")],
        'kanban_tasks':      [('position', "INTEGER DEFAULT 0")],
    }
    try:
        inspector = inspect(db.engine)
        for table, cols in expected.items():
            if not inspector.has_table(table):
                continue
            existing = {c['name'] for c in inspector.get_columns(table)}
            with db.engine.connect() as conn:
                for col_name, col_decl in cols:
                    if col_name not in existing:
                        conn.execute(text(f"ALTER TABLE `{table}` ADD COLUMN `{col_name}` {col_decl}"))
                        conn.commit()
    except Exception as e:
        print(f"[migration] warning: {e}")
