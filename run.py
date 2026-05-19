"""
Advanced MIS — Application Entry Point
Run: python run.py
Access: http://localhost:5000
"""
import os
import sys

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
