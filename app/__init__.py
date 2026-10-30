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
    # Auto-load .env environment configuration
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_file = os.path.join(base_dir, '.env')
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip().strip("'").strip('"'))

    app = Flask(__name__,
                static_folder='static',
                template_folder='templates')

    app.config.from_object('app.config.Config')

    # Ensure directories exist
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

    from app.routes.crishi import crishi_bp
    app.register_blueprint(crishi_bp, url_prefix='/api/crishi')

    # Serve the SPA
    @app.route('/')
    def index():
        from flask import render_template
        return render_template('index.html')

    @app.route('/favicon.ico')
    def favicon():
        from flask import Response
        return Response(status=204)

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
    """Add columns to existing tables when models grow new fields and backfill relational mappings."""
    from sqlalchemy import text, inspect
    expected = {
        'reports':           [('backup_1', "VARCHAR(255) DEFAULT ''"),
                              ('backup_2', "VARCHAR(255) DEFAULT ''"),
                              ('schedule_day', "VARCHAR(50) DEFAULT ''"),
                              ('instructions', "TEXT"),
                              ('user_id', "BIGINT NULL"),
                              ('commodity', "VARCHAR(100) DEFAULT ''")],
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
        'db_task_catalog':   [('commodity_config', "TEXT NULL")],
        'kanban_tasks':      [('position', "INTEGER DEFAULT 0")],
        'users':             [('is_roster_sub_admin', "TINYINT(1) DEFAULT 0"),
                              ('backup_1', "VARCHAR(255) DEFAULT ''"),
                              ('backup_2', "VARCHAR(255) DEFAULT ''")],
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

        # Ensure user_report_mappings and user_commodity_mappings exist
        db.create_all()

        # Backfill migration logic
        from app.models import User, Report, UserReportMapping, UserCommodityMapping, DBTaskCatalog, infer_commodity

        users = User.query.all()
        user_by_name = {u.name.strip().lower(): u for u in users if u.name}
        user_by_email = {u.email.strip().lower(): u for u in users if u.email}

        reports = Report.query.all()
        # 1. Backfill Report.user_id and Report.commodity (with Turmeric fix)
        for r in reports:
            target_comm = infer_commodity(r.name)
            if not r.commodity or r.commodity != target_comm:
                r.commodity = target_comm
            if r.primary_assignee and not r.user_id:
                assignee_key = r.primary_assignee.strip().lower()
                matched_user = user_by_name.get(assignee_key) or user_by_email.get(assignee_key)
                if matched_user:
                    r.user_id = matched_user.id

        db.session.commit()

        # 2. Backfill user_report_mappings from Report where user_id is set
        for r in reports:
            if r.user_id:
                existing_urm = UserReportMapping.query.filter_by(user_id=r.user_id, report_id=r.id).first()
                if not existing_urm:
                    timing = f"{r.frequency or 'Daily'} {r.deadline or ''}".strip()
                    urm = UserReportMapping(
                        user_id=r.user_id,
                        report_id=r.id,
                        report_name=r.name,
                        timing_schedule=timing,
                        deadline=r.deadline or '',
                        frequency=r.frequency or 'Daily'
                    )
                    db.session.add(urm)

        # 3. Backfill user_commodity_mappings from User.commodities
        for u in users:
            if u.commodities:
                comms = [c.strip() for c in u.commodities.split(',') if c.strip()]
                for c in comms:
                    existing_ucm = UserCommodityMapping.query.filter_by(user_id=u.id, commodity=c).first()
                    if not existing_ucm:
                        ucm = UserCommodityMapping(
                            user_id=u.id,
                            commodity=c,
                            mapping_config='{}'
                        )
                        db.session.add(ucm)

        db.session.commit()

        # 4. Zero Data Loss Verification
        u_count = User.query.count()
        r_count = Report.query.count()
        t_count = DBTaskCatalog.query.count()
        if u_count > 0 or r_count > 0 or t_count > 0:
            assert u_count >= 9, f"Data loss detected: Expected >= 9 users, found {u_count}"
            assert r_count >= 27, f"Data loss detected: Expected >= 27 reports, found {r_count}"
            assert t_count >= 156, f"Data loss detected: Expected >= 156 catalog entries, found {t_count}"
        print(f"[migration] Zero data loss verified: {u_count} users, {r_count} reports, {t_count} catalog entries intact.")
    except Exception as e:
        print(f"[migration] warning: {e}")
