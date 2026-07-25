"""
Advanced MIS — Application Entry Point
Run: python run.py
Access: http://localhost:5000
"""
import os
import sys

# Auto-re-execute using virtual environment if run with global python
if sys.prefix == sys.base_prefix:
    import subprocess
    current_dir = os.path.dirname(os.path.abspath(__file__))
    venv_python = os.path.join(current_dir, '.venv', 'Scripts', 'python.exe')
    if not os.path.exists(venv_python):
        venv_python = os.path.join(current_dir, '.venv', 'bin', 'python')
    if os.path.exists(venv_python):
        sys.exit(subprocess.call([venv_python] + sys.argv))

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    print("\n" + "="*60)
    print("  Advanced MIS - Research Team Management System")
    print("  Running at: http://localhost:5000")
    print("  Default login: nishant@agalabs.com / admin123")
    print("="*60 + "\n")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
