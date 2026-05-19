"""Semantic Validation via local analysis engine."""
import json
import requests

def verify_semantic_data(report_type, analysis, examples=None):
    """
    Run semantic text verification on the extracted PDF sections.
    """
    sections_found = analysis.get('sectionsFound', [])
    extracted_fields = analysis.get('extractedFields', {})
    validation_results = analysis.get('validationResults', {})
    
    if not sections_found and not validation_results:
        return {'available': True, 'error': 'No sections to verify', 'sections': []}
        
    try:
        # Prepare context
        context_data = {
            "report_type": report_type,
            "fields": extracted_fields,
            "validation": validation_results
        }
        
        prompt = f"""
        Analyze the following extracted report data for accuracy and consistency:
        {json.dumps(context_data, indent=2)}
        
        Respond with a JSON object in this format:
        {{
            "overall": "A brief summary of the analysis",
            "sections": [
                {{"heading": "Section Name", "verdict": "ok|suspect|missing", "reason": "Explanation"}}
            ]
        }}
        """
        
        # Call local semantic engine (Ollama)
        resp = requests.post('http://localhost:11434/api/generate', json={
            'model': 'llama3', # Defaulting to llama3, the user can adjust if needed
            'prompt': prompt,
            'format': 'json',
            'stream': False
        }, timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            response_json = json.loads(data.get('response', '{}'))
            return {
                'available': True,
                'model': data.get('model', 'local'),
                'overall': response_json.get('overall', ''),
                'sections': response_json.get('sections', [])
            }
        else:
            return {'available': False, 'error': f'Engine returned {resp.status_code}', 'sections': []}
            
    except requests.exceptions.RequestException as e:
        return {'available': False, 'error': f'Engine unreachable: {e}', 'sections': []}
    except json.JSONDecodeError:
        return {'available': False, 'error': 'Could not parse JSON from semantic engine', 'sections': []}
    except Exception as e:
        return {'available': False, 'error': str(e), 'sections': []}
