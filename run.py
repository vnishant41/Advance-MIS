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

# Auto-load .env environment configuration
env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(env_file):
    with open(env_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ[k.strip()] = v.strip().strip("'").strip('"')


from app import create_app, socketio

app = create_app()

def free_port(port=5000):
    """Ensure port 5000 is available by cleanly terminating any stale listener."""
    import subprocess
    try:
        my_pid = os.getpid()
        out = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode('utf-8', errors='ignore')
        for line in out.strip().split('\n'):
            parts = line.split()
            if len(parts) >= 5 and 'LISTENING' in line:
                pid = int(parts[-1])
                if pid != my_pid and pid > 0:
                    subprocess.call(f'taskkill /F /PID {pid}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def get_local_ip():
    """Detect the local Wi-Fi / LAN IPv4 address."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


if __name__ == '__main__':
    free_port(5000)
    local_ip = get_local_ip()
    print("\n" + "="*60)
    print("  Advanced MIS - Research Team Management System")
    print(f"  Local Access:    http://localhost:5000")
    print(f"  Wi-Fi / Network: http://{local_ip}:5000")
    print("="*60 + "\n")
    try:
        socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=False, allow_unsafe_werkzeug=True)
    except OSError as e:
        if getattr(e, 'winerror', None) == 10048 or '10048' in str(e):
            print("Port 5000 occupied. Freeing port and retrying...")
            free_port(5000)
            socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=False, allow_unsafe_werkzeug=True)
        else:
            raise
