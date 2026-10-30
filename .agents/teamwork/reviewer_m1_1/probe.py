import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

import json
from app import create_app, db
from app.models import DBTaskCatalog, User
from flask_jwt_extended import create_access_token

app = create_app()
app.config['TESTING'] = True
client = app.test_client()

with app.app_context():
    cid = DBTaskCatalog.query.first().id
    
    # 1. Test unauthenticated calls to admin mutating routes -> Expect 401
    for path, method in [
        ('/api/crishi/pull', 'post'),
        ('/api/crishi/skip', 'post'),
        ('/api/crishi/manager-review', 'post'),
        ('/api/crishi/source', 'put'),
        ('/api/crishi/roster/apply-week', 'post')
    ]:
        fn = getattr(client, method)
        res = fn(path, json={'catalogId': cid, 'reason': 'test'})
        assert res.status_code == 401, f"Expected 401 for unauth {method.upper()} {path}, got {res.status_code}"
    print("1. Unauthenticated mutating routes returned 401: OK")

    # 2. Test Teammate calls to admin mutating routes -> Expect 403
    t_bhawna = create_access_token('bhawna@agalabs.com', additional_claims={'role': 'Teammate'})
    headers_bhawna = {'Authorization': f'Bearer {t_bhawna}'}
    for path, method in [
        ('/api/crishi/pull', 'post'),
        ('/api/crishi/skip', 'post'),
        ('/api/crishi/manager-review', 'post'),
        ('/api/crishi/source', 'put'),
        ('/api/crishi/roster/apply-week', 'post')
    ]:
        fn = getattr(client, method)
        res = fn(path, json={'catalogId': cid, 'reason': 'test'}, headers=headers_bhawna)
        assert res.status_code == 403, f"Expected 403 for Teammate {method.upper()} {path}, got {res.status_code}"
    print("2. Teammate mutating routes returned 403: OK")

    # 3. Test Leader calls to admin mutating routes -> Should NOT be 403
    t_leader = create_access_token('test_leader@agalabs.com', additional_claims={'role': 'Leader'})
    headers_leader = {'Authorization': f'Bearer {t_leader}'}
    res_pull_leader = client.post('/api/crishi/pull', json={'catalogId': cid, 'slaHours': 12}, headers=headers_leader)
    assert res_pull_leader.status_code == 200, f"Leader pull status {res_pull_leader.status_code}"
    
    res_skip_leader = client.post('/api/crishi/skip', json={'catalogId': cid, 'reason': 'Holiday'}, headers=headers_leader)
    assert res_skip_leader.status_code == 200, f"Leader skip status {res_skip_leader.status_code}"
    print("3. Leader mutating routes authorized: OK")

    # 4. Surveillance grid scoping
    t_admin = create_access_token('nishant@agalabs.com', additional_claims={'role': 'SuperAdmin'})
    g_admin = client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {t_admin}'}).get_json()
    g_unauth = client.get('/api/crishi/grid').get_json()
    g_bhawna = client.get('/api/crishi/grid', headers=headers_bhawna).get_json()

    admin_task_len = len(g_admin['tasks'])
    unauth_task_len = len(g_unauth['tasks'])
    bhawna_task_len = len(g_bhawna['tasks'])
    assert admin_task_len == 140, f"Admin tasks count expected 140, got {admin_task_len}"
    assert unauth_task_len == 140, f"Unauth tasks count expected 140, got {unauth_task_len}"
    assert bhawna_task_len == 36, f"Bhawna tasks count expected 36, got {bhawna_task_len}"
    
    # Verify Bhawna summary['teammates'] contains ONLY Bhawna
    teammates_keys = list(g_bhawna['summary']['teammates'].keys())
    assert teammates_keys == ['Bhawna'], f"Expected strictly Bhawna in summary teammates, got {teammates_keys}"
    
    # Verify Admin summary contains multiple teammates
    assert len(g_admin['summary']['teammates']) >= 4
    print("4. Surveillance grid dual-branch scoping: OK")

    # 5. Reports scoping
    r_admin = client.get('/api/crishi/reports/all', headers={'Authorization': f'Bearer {t_admin}'}).get_json()
    r_bhawna = client.get('/api/crishi/reports/all', headers=headers_bhawna).get_json()
    assert r_admin['total'] == 339, f"Expected 339 reports for Admin, got {r_admin['total']}"
    assert r_bhawna['total'] == 14, f"Expected 14 reports for Bhawna, got {r_bhawna['total']}"
    for rep in r_bhawna['reports']:
        cat = rep.get('category', '').lower()
        assert cat in ['cotton', 'rapeseed', 'soybeans', 'weather'], f"Unexpected category {cat} in Bhawna reports"
    print("5. Reports scoping: OK")

    # 6. Gopichand grid and reports check
    t_gopi = create_access_token('gopichand@agalabs.com', additional_claims={'role': 'Teammate'})
    g_gopi = client.get('/api/crishi/grid', headers={'Authorization': f'Bearer {t_gopi}'}).get_json()
    r_gopi = client.get('/api/crishi/reports/all', headers={'Authorization': f'Bearer {t_gopi}'}).get_json()
    assert len(g_gopi['tasks']) == 36, f"Expected 36 tasks for Gopichand, got {len(g_gopi['tasks'])}"
    assert list(g_gopi['summary']['teammates'].keys()) == ['Gopi']
    assert r_gopi['total'] == 70, f"Expected 70 reports for Gopichand, got {r_gopi['total']}"
    for r in r_gopi['reports']:
        cat = r.get('category', '').lower()
        title = (r.get('report_name') or r.get('title') or '').lower()
        assert 'pulses' not in cat and 'pulses' not in title, f"Pulses exposed to Gopichand: {r}"
    print("6. Gopichand scoping: OK")

    # Clean test skip if created
    from app.models import TaskSkip, ManagerTaskPull
    TaskSkip.query.filter_by(catalog_id=cid).delete()
    ManagerTaskPull.query.filter_by(catalog_id=cid).delete()
    db.session.commit()
    print("ALL ADVERSARIAL PROBES PASSED SUCCESSFULLY!")
