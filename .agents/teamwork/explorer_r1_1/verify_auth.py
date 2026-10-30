import urllib.request
import urllib.error
import json

url = "http://127.0.0.1:5000/api/auth/login"
payload = json.dumps({'email': 'vaibhav@agalabs.com', 'password': 'admin123'}).encode('utf-8')
req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})

try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        token = res.get('token')
        print(f"Login SUCCESS: HTTP {resp.status}")
        print(f"User: {res.get('user', {}).get('name')}, Role: {res.get('user', {}).get('role')}")
        print(f"Token length: {len(token) if token else 0}")

        # Now test /api/auth/me with Bearer token
        me_url = "http://127.0.0.1:5000/api/auth/me"
        me_req = urllib.request.Request(me_url, headers={'Authorization': f"Bearer {token}"})
        with urllib.request.urlopen(me_req, timeout=5) as me_resp:
            me_res = json.loads(me_resp.read().decode('utf-8'))
            print(f"/api/auth/me SUCCESS: HTTP {me_resp.status}, identity: {me_res.get('user', {}).get('email')}")

        # Now test /api/dash/stats with Bearer token
        stats_url = "http://127.0.0.1:5000/api/dash/stats"
        stats_req = urllib.request.Request(stats_url, headers={'Authorization': f"Bearer {token}"})
        with urllib.request.urlopen(stats_req, timeout=5) as s_resp:
            s_res = json.loads(s_resp.read().decode('utf-8'))
            print(f"/api/dash/stats SUCCESS: HTTP {s_resp.status}, keys: {list(s_res.keys())[:5]}")

        # Now test /api/admin/users with Bearer token
        users_url = "http://127.0.0.1:5000/api/admin/users"
        users_req = urllib.request.Request(users_url, headers={'Authorization': f"Bearer {token}"})
        with urllib.request.urlopen(users_req, timeout=5) as u_resp:
            u_res = json.loads(u_resp.read().decode('utf-8'))
            print(f"/api/admin/users SUCCESS: HTTP {u_resp.status}, user count in 'data': {len(u_res.get('data', []))}")

        # Now test /api/mis/reports with Bearer token
        mis_url = "http://127.0.0.1:5000/api/mis/reports"
        mis_req = urllib.request.Request(mis_url, headers={'Authorization': f"Bearer {token}"})
        with urllib.request.urlopen(mis_req, timeout=5) as m_resp:
            m_res = json.loads(m_resp.read().decode('utf-8'))
            print(f"/api/mis/reports SUCCESS: HTTP {m_resp.status}, count: {len(m_res.get('reports', []))}")

except Exception as e:
    print(f"Error during auth verification: {e}")
