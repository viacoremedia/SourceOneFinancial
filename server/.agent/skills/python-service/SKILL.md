---
name: Python Service Patterns
description: Python data acquisition scripts — API client patterns, multi-platform data collection, output formatting, and error handling for Node.js consumption
---

# Python Service Skill

Patterns for Python scripts that serve as data acquisition and processing
services, spawned by a Node.js orchestrator.

## Architecture

Python scripts are standalone executables, not long-running servers. Each script:
1. Receives parameters (command-line args or environment variables)
2. Fetches data from external APIs (Google Ads, Meta, Bing, CallRail, etc.)
3. Processes and normalizes the data
4. Outputs valid JSON to stdout
5. Outputs errors to stderr

```
server-py/
├── custom_timeframe_google.py   ← Google Ads data acquisition
├── bing_ads.py                  ← Microsoft/Bing Ads
├── bing_custom.py               ← Bing custom timeframe
├── facebook_report.py           ← Meta Ads
├── fb_custom.py                 ← Meta custom timeframe
├── callrail_campaign_stats.py   ← CallRail phone tracking
├── event_logger.py              ← Event tracking
├── actionable_items.py          ← Business intelligence
├── server.py                    ← Lightweight Flask API (optional)
├── requirements.txt             ← Dependencies
├── google-ads.yml               ← Google Ads API config
└── creds/                       ← API credentials (gitignored)
```

## Script Structure

### Standard Pattern
```python
#!/usr/bin/env python3
"""
Fetch Google Ads performance data for a custom time range.
Output: JSON to stdout
Usage: python custom_timeframe_google.py --customer-id 123 --start 2026-01-01 --end 2026-01-31
"""

import sys
import json
import argparse
from google.ads.googleads.client import GoogleAdsClient

def main():
    parser = argparse.ArgumentParser(description='Google Ads data acquisition')
    parser.add_argument('--customer-id', required=True)
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    args = parser.parse_args()

    try:
        client = GoogleAdsClient.load_from_storage('google-ads.yml')
        data = fetch_campaign_data(client, args.customer_id, args.start, args.end)

        # Normalize metrics
        result = {
            'success': True,
            'data': normalize_metrics(data),
            'metadata': {
                'customer_id': args.customer_id,
                'date_range': {'start': args.start, 'end': args.end},
                'platform': 'google_ads'
            }
        }

        # Output valid JSON to stdout — this is what Node.js reads
        print(json.dumps(result))

    except Exception as e:
        # Errors to stderr (won't pollute JSON stdout)
        print(json.dumps({
            'success': False,
            'error': str(e),
            'platform': 'google_ads'
        }))
        sys.exit(1)

def normalize_metrics(raw_data):
    """Standardize metric names across platforms."""
    return {
        'spend': float(raw_data.get('cost_micros', 0)) / 1_000_000,
        'clicks': int(raw_data.get('clicks', 0)),
        'impressions': int(raw_data.get('impressions', 0)),
        'conversions': float(raw_data.get('conversions', 0)),
        'cpl': calculate_cpl(raw_data),
    }

def calculate_cpl(data):
    """Cost per lead — handle division by zero."""
    conversions = float(data.get('conversions', 0))
    spend = float(data.get('cost_micros', 0)) / 1_000_000
    return round(spend / conversions, 2) if conversions > 0 else 0

if __name__ == '__main__':
    main()
```

## Multi-Platform API Patterns

### Google Ads (GAQL)
```python
from google.ads.googleads.client import GoogleAdsClient

client = GoogleAdsClient.load_from_storage('google-ads.yml')
ga_service = client.get_service('GoogleAdsService')

query = """
    SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '2026-01-01' AND '2026-01-31'
"""

response = ga_service.search(customer_id=customer_id, query=query)
```

### Meta / Facebook Ads
```python
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount

FacebookAdsApi.init(app_id, app_secret, access_token)
account = AdAccount(f'act_{account_id}')

insights = account.get_insights(params={
    'time_range': {'since': start, 'until': end},
    'fields': ['spend', 'clicks', 'impressions', 'actions'],
})
```

### Bing / Microsoft Ads
```python
from bingads.service_client import ServiceClient
from bingads.authorization import AuthorizationData, OAuthDesktopMobileAuthCodeGrant

# Uses OAuth with refresh tokens stored in credentials
```

## Error Handling

### Partial Failure Pattern
When fetching from multiple platforms, continue on individual platform failure:
```python
results = {}
errors = []

for platform in ['google', 'meta', 'bing']:
    try:
        results[platform] = fetch_platform_data(platform, params)
    except Exception as e:
        errors.append({'platform': platform, 'error': str(e)})
        # Continue — don't fail the entire report

output = {
    'success': len(errors) == 0,
    'data': results,
    'errors': errors,
    'partial': len(errors) > 0 and len(results) > 0
}
print(json.dumps(output))
```

### Output Contract
- stdout: ONLY valid JSON. Never print debug info to stdout.
- stderr: Human-readable error messages for debugging.
- Exit code 0: success (stdout has `"success": true`)
- Exit code 1: failure (stdout still has JSON with `"success": false`)

## Dependencies & Environment

```
# requirements.txt
google-ads>=24.0.0
facebook-business>=19.0.0
bingads>=13.0.0
requests>=2.31.0
python-dotenv>=1.0.0
```

- Python 3.10+
- Virtual environment: `python -m venv venv`
- Credentials: stored in `creds/` (gitignored) or environment variables
- Config files: `google-ads.yml` for Google Ads API configuration
