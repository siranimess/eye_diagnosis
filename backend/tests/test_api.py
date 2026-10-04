import io
import json
import pytest
from fastapi.testclient import TestClient
from PIL import Image
import main

client = TestClient(main.app)

@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setenv('DEMO_MODE', 'true')
    for name in ['ALL_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'http_proxy', 'https_proxy']:
        monkeypatch.delenv(name, raising=False)

def picture():
    buf = io.BytesIO()
    Image.new('RGB', (100, 100), 'white').save(buf, 'PNG')
    return buf.getvalue()

def request(context=None, data=None):
    return client.post('/analyze', data={'context': json.dumps(context or {'age': 23, 'laterality': 'OD', 'image_type': 'External', 'consent': True})}, files={'image': ('eye.png', picture() if data is None else data, 'image/png')})

def test_demo_is_not_diagnosis():
    response = request()
    assert response.status_code == 200
    result = response.json()
    assert result['mode'] == 'demo'
    assert result['report']['differentials'] == []
    assert result['report']['severity'] == 'indeterminate'
    assert 'UNVALIDATED' in result['disclaimer']

def test_fake_image_rejected():
    assert request(data=b'not a photo').status_code == 422

def test_large_upload_rejected():
    assert request(data=b'x' * (main.MAX_BYTES + 1)).status_code == 413

def test_invalid_context_rejected():
    assert request({'age': -1, 'laterality': 'OD', 'image_type': 'Fundus', 'consent': True}).status_code == 422

def test_consent_required():
    assert request({'age': 23, 'laterality': 'OD', 'image_type': 'Fundus', 'consent': False}).status_code == 422

def test_unknown_symptom_rejected():
    assert request({'age': 23, 'laterality': 'OD', 'image_type': 'Fundus', 'consent': True, 'symptoms': ['invented']}).status_code == 422

def test_red_flags_persist_outside_model():
    response = request({'age': 23, 'laterality': 'OD', 'image_type': 'Fundus', 'consent': True, 'symptoms': ['New flashes']})
    assert response.status_code == 200
    assert response.json()['alerts']

def test_live_requires_configuration(monkeypatch):
    monkeypatch.setenv('DEMO_MODE', 'false')
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    assert request().status_code == 503

def test_live_response_validation(monkeypatch):
    monkeypatch.setenv('DEMO_MODE', 'false')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key')
    monkeypatch.setenv('ANTHROPIC_MODEL', 'test-model')
    async def fake_post(self, url, **kwargs):
        body = kwargs['json']
        assert body['messages'][0]['content'][0]['source']['media_type'] == 'image/jpeg'
        return main.httpx.Response(200, json={'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': '{"unexpected":true}'}]}, request=main.httpx.Request('POST',url))
    monkeypatch.setattr(main.httpx.AsyncClient, 'post', fake_post)
    assert request().status_code == 502

def test_live_ungradable_clears_claims(monkeypatch):
    monkeypatch.setenv('DEMO_MODE', 'false')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key')
    monkeypatch.setenv('ANTHROPIC_MODEL', 'test-model')
    report = main.demo_report().model_dump()
    report['observations'] = ['Unsupported finding']
    report['severity'] = 'urgent concern'
    async def fake_post(self, url, **kwargs):
        return main.httpx.Response(200, json={'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': json.dumps(report)}]}, request=main.httpx.Request('POST',url))
    monkeypatch.setattr(main.httpx.AsyncClient, 'post', fake_post)
    result = request().json()
    assert result['mode'] == 'live'
    assert result['report']['observations'] == []
    assert result['report']['severity'] == 'indeterminate'
